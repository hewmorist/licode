var sys = require('util');
var amqp = require('amqp');
var logger = require('./logger').logger;

// Logger
var log = logger.getLogger("RPC");

// Configuration default values
GLOBAL.config.rabbit = GLOBAL.config.rabbit || {};
GLOBAL.config.rabbit.host = GLOBAL.config.rabbit.host || 'localhost';
GLOBAL.config.rabbit.port = GLOBAL.config.rabbit.port || 5672;

var TIMEOUT = 5000;

// This timeout shouldn't be too low because it won't listen to onReady responses from ErizoJS
var REMOVAL_TIMEOUT = 300000;

var addr = {};
if (GLOBAL.config.rabbit.url !== undefined) {
    addr.url = GLOBAL.config.rabbit.url;
} else {
    addr.host = GLOBAL.config.rabbit.host;
    addr.port = GLOBAL.config.rabbit.port;
}

exports.create = function(spec) {
    "use strict";
    var that = {};

    spec = spec || {};
    var replyExchange = spec.replyExchange || "rpcExchange";
    var fanoutExchange = spec.fanoutExchange || "rpcFanout";

    var corrID = 0;
    var map = {};   //{corrID: {fn: callback, to: timeout}}
    var connection;
    var exc;
    var fanout = undefined;
    var clientQueue;

    var boundQueue = undefined;

    var rpcPublic = {};

    that.setPublicRPC = function(methods) {
        rpcPublic = methods;
    };

    that.connect = function(callback) {
        // Create the amqp connection to rabbitMQ server
        connection = amqp.createConnection(addr);
        connection.on('ready', function () {

            //Create a direct exchange
            exc = connection.exchange(replyExchange, {type: 'direct'}, function (exchange) {
                try {
                    log.info('Exchange ' + exchange.name + ' is open');

                    //Create the queue for send messages
                    clientQueue = connection.queue('', function (q) {
                        log.info('ClientQueue ' + q.name + ' is open');

                        clientQueue.bind(replyExchange, clientQueue.name, callback);

                        clientQueue.subscribe(function (message) {
                            try {
                                log.debug("New message received", message);

                                if(map[message.corrID] !== undefined) {
                                    log.debug("Callback", message.type, " - ", message.data);
                                    clearTimeout(map[message.corrID].to);
                                    if (message.type === "onReady") map[message.corrID].fn[message.type].call({});
                                    else map[message.corrID].fn[message.type].call({}, message.data);
                                    setTimeout(function() {
                                        if (map[message.corrID] !== undefined) delete map[message.corrID];
                                    }, REMOVAL_TIMEOUT);
                                }
                            } catch(err) {
                                log.error("Error processing response: ", err);
                            }
                        });

                    });
                } catch (err) {
                    logger.error("Error in exchange ", exchange.name, " - error - ", err);
                }
            });
        });
    }

    that.bind = function(id, callback) {
        //Create the queue for receive messages
        var q = connection.queue(id, function (queueCreated) {
            try {
                log.info('Queue ' + queueCreated.name + ' is open');

                q.bind(replyExchange, id, callback);
                q.subscribe(function (message) {
                    try {
                        log.debug("New message received", message);
                        message.args = message.args || [];
                        message.args.push(function(type, result) {
                            exc.publish(message.replyTo, {data: result, corrID: message.corrID, type: type});
                        });
                        rpcPublic[message.method].apply(rpcPublic, message.args);
                    } catch (error) {
                        log.error("Error processing call: ", error);
                    }

                });
            } catch (err) {
                logger.error("Error in exchange ", exchange.name, " - error - ", err);
            }

        });
        boundQueue = q;
    }

    that.bindFanout = function(name, callback) {
        fanout = connection.exchange(fanoutExchange, { type: 'fanout' }, function(exchange) {
           try {
               log.info('Fanout ' + exchange.name + ' opened!');
               var myQueue = connection.queue('', function(q) {
                   log.info('Queue ', q.name, ' is now open.');
                   myQueue.bind(fanoutExchange, '', callback);
                   myQueue.subscribe(function (message) {
                       try {
                           if (rpcPublic.hasOwnProperty(message.method)) {
                               log.debug("New fanout message received: ", message);
                               message.args = message.args || [];
                               message.args.push(function(type, result) {
                                   exc.publish(message.replyTo, { data: result, corrID: message.corrID, type: type});
                               });
                               rpcPublic[message.method].apply(rpcPublic, message.args);
                           } else {
                               log.info('Received but could not handle fanout message: ', message);
                           }
                       } catch(error) {
                           log.error("Error processing fanout call: ", error);
                       }
                   });
               });
               boundQueue = myQueue;
           } catch(err) {
               logger.error("Error in fanout exchange ", exchange.name, ": ", err);
           }
        });

    };

    /*
     * Calls remotely the 'method' function defined in rpcPublic of 'to'.
     */
    that.callRpc = function(to, method, args, callbacks) {
        log.debug("sending message ", method, " with arguments ", args);
        corrID ++;
        map[corrID] = {};
        map[corrID].fn = callbacks;
        map[corrID].to = setTimeout(callbackError, TIMEOUT, corrID);
        exc.publish(to, {method: method, args: args, corrID: corrID, replyTo: clientQueue.name});
    }

    that.callFanout = function(to, method, args, callbacks) {
        if (!fanout) {
            log.error("cannot send to fanout - not initialized!");
            return;
        }

        log.debug("sending fanout message ", method, " with arguments ", args);
        ++corrID;
        map[corrID] = {};
        map[corrID].fn = callbacks;
        map[corrID].to = setTimeout(callbackError, TIMEOUT, corrID);
        fanout.publish(to, { method: method, args: args, corrID: corrID, replyTo: clientQueue.name});
    }

    that.getId = function() {
        return clientQueue.name;
    }

    that.unbind = function(id) {
        if (boundQueue) {
            try {
                boundQueue.unbind(replyExchange, id);
                boundQueue = undefined;
            } catch(err) {
                log.error("couldn't unbind", err);
            }
        }
    }

    that.unbindFanout = function(id) {
        if (boundQueue && fanoutExchange) {
            try {
                boundQueue.unbind(fanoutExchange, id);
                boundQueue = undefined;
            } catch(err) {
                log.error("couldn't unbind fanout queue!", err);
            }
        }
    }

    var callbackError = function(corrID) {
        for (var i in map[corrID].fn) {
            map[corrID].fn[i]('timeout');
        }
        delete map[corrID];
    }

    return that;
};


