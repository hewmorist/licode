var sys = require('util');
var amqp = require('amqp');
var logger = require('./logger').logger;

// Logger
var log = logger.getLogger("RPCfanout");

// Configuration default values
GLOBAL.config.rabbit = GLOBAL.config.rabbit || {};
GLOBAL.config.rabbit.host = GLOBAL.config.rabbit.host || 'localhost';
GLOBAL.config.rabbit.port = GLOBAL.config.rabbit.port || 5672;

var TIMEOUT = 5000;

// This timeout shouldn't be too low because it won't listen to onReady responses from ErizoJS
var REMOVAL_TIMEOUT = 300000;

// name of the exchange for rabbit mq
var RPC_EXCHANGE_NAME = 'rpcFanout';
// name of the exchange for replies via rabbit mq
var RPC_REPLY_EXCHANGE = 'rpc';

var corrID = 0;
var map = {};   //{corrID: {fn: callback, to: timeout}}
var connection;
var exc;
var clientQueue;
var fanout;

var addr = {};
var rpcPublic = {};
var rpcMain = {};

if (GLOBAL.config.rabbit.url !== undefined) {
    addr.url = GLOBAL.config.rabbit.url;
} else {
    addr.host = GLOBAL.config.rabbit.host;
    addr.port = GLOBAL.config.rabbit.port;
}

exports.setPublicRPC = function(methods) {
    rpcPublic = methods;
};

exports.setMainRPC = function(methods) {
    rpcMain = methods;
};

exports.connect = function(callback) {

    // Create the amqp connection to rabbitMQ server
    connection = amqp.createConnection(addr);
    connection.on('ready', function () {

        //Create a direct exchange
        exc = connection.exchange(RPC_REPLY_EXCHANGE, {type: 'direct'}, function (exchange) {
            try {
                log.info('Exchange ' + exchange.name + ' is open');

                //Create the queue for send messages
                clientQueue = connection.queue('', function (q) {
                    log.info('ClientQueue ' + q.name + ' is open');

                    clientQueue.bind(RPC_REPLY_EXCHANGE, clientQueue.name, callback);

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

exports.bind = function(id, callback) {

    // register to the fanout exchange
    fanout = connection.exchange(RPC_EXCHANGE_NAME, { type: 'fanout' }, function(exchange) {
       try {
           log.info('Fanout ' + exchange.name + ' opened!');
           var myQueue = connection.queue('', function(q) {
               log.info('Queue ', q.name, ' is now open.');
               myQueue.bind(RPC_EXCHANGE_NAME, '', callback);
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
       } catch(err) {
           logger.error("Error in fanout exchange ", exchange.name, ": ", err);
       }
    });
}

/*
 * Calls remotely the 'method' function defined in rpcPublic of 'to'.
 */
exports.callFanout = function(to, method, args, callbacks) {

    corrID ++;
    map[corrID] = {};
    map[corrID].fn = callbacks;
    map[corrID].to = setTimeout(callbackError, TIMEOUT, corrID);
    fanout.publish(to, {method: method, args: args, corrID: corrID, replyTo: clientQueue.name});
}

exports.bindMain = function(id, callback) {
    log.debug('binding attempt: ', id);

    //Create the queue for receive messages
    var q = connection.queue(id, function (queueCreated) {
        try {
            log.info('Queue ' + queueCreated.name + ' is open');

            q.bind(RPC_REPLY_EXCHANGE, id, callback);
            q.subscribe(function (message) {
                try {
                    log.debug("New main message received", message);
                    message.args = message.args || [];
                    message.args.push(function(type, result) {
                        exc.publish(message.replyTo, {data: result, corrID: message.corrID, type: type});
                    });
                    rpcMain[message.method].apply(rpcMain, message.args);
                } catch (error) {
                    log.error("Error processing main call: ", error);
                }

            });
        } catch (err) {
            logger.error("Error in exchange ", exchange.name, " - error - ", err);
        }

    });
}

exports.callMainRpc = function(to, method, args, callbacks) {

    corrID ++;
    map[corrID] = {};
    map[corrID].fn = callbacks;
    map[corrID].to = setTimeout(callbackError, TIMEOUT, corrID);
    exc.publish(to, {method: method, args: args, corrID: corrID, replyTo: clientQueue.name});
}

var callbackError = function(corrID) {
    for (var i in map[corrID].fn) {
        map[corrID].fn[i]('timeout');
    }
    delete map[corrID];
}

exports.getId = function() {
    if (clientQueue) { 
        return clientQueue.name;
    }
    return undefined;
}

