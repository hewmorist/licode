/*global require, logger. setInterval, clearInterval, Buffer, exports*/
var Getopt = require('node-getopt');

var spawn = require('child_process').spawn;

var config = require('./../../licode_config');


// Configuration default values
GLOBAL.config = config || {};
GLOBAL.config.erizoAgent = GLOBAL.config.erizoAgent || {};
GLOBAL.config.erizoAgent.maxProcesses = GLOBAL.config.erizoAgent.maxProcesses || 1;

GLOBAL.config.erizoAgent.publicIP = GLOBAL.config.erizoAgent.publicIP || '';
var BINDED_INTERFACE_NAME = GLOBAL.config.erizoAgent.networkInterface;
GLOBAL.config.erizoAgent.prerunProcesses = GLOBAL.config.erizoAgent.prerunProcesses || 1;
GLOBAL.config.erizoAgent.maxDurationJS = GLOBAL.config.erizoAgent.maxDurationJS || 24 * 60 * 60;
GLOBAL.config.erizoAgent.logPath = GLOBAL.config.erizoAgent.logPath || '.';

var MAX_JS_DURATION_MS = GLOBAL.config.erizoAgent.maxDurationJS * 1000;


// Parse command line arguments
var getopt = new Getopt([
  ['r' , 'rabbit-host=ARG'            , 'RabbitMQ Host'],
  ['g' , 'rabbit-port=ARG'            , 'RabbitMQ Port'],
  ['l' , 'logging-config-file=ARG'    , 'Logging Config File'],
  ['M' , 'maxProcesses=ARG'          , 'Stun Server URL'],
  ['P' , 'prerunProcesses=ARG'         , 'Default video Bandwidth'],
  ['h' , 'help'                       , 'display this help']
]);

opt = getopt.parse(process.argv.slice(2));

for (var prop in opt.options) {
    if (opt.options.hasOwnProperty(prop)) {
        var value = opt.options[prop];
        switch (prop) {
            case "help":
                getopt.showHelp();
                process.exit(0);
                break;
            case "rabbit-host":
                GLOBAL.config.rabbit = GLOBAL.config.rabbit || {};
                GLOBAL.config.rabbit.host = value;
                break;
            case "rabbit-port":
                GLOBAL.config.rabbit = GLOBAL.config.rabbit || {};
                GLOBAL.config.rabbit.port = value;
                break;
            case "logging-config-file":
                GLOBAL.config.logger = GLOBAL.config.logger || {};
                GLOBAL.config.logger.config_file = value;
                break;
            default:
                GLOBAL.config.erizoAgent[prop] = value;
                break;
        }
    }
}

// Load submodules with updated config
var logger = require('./../common/logger').logger;
var amqper = require('./../common/amqper');

// Logger
var log = logger.getLogger("ErizoAgent");

var agentLeader = require('./erizoAgentLeader');

var childs = [];

var SEARCH_INTERVAL = 5000;

var idle_erizos = [];

var erizos = [];

var processes = {};

// local id of this agent
var myId = undefined;
// erizo js currently starting, id: [{ publisherId, onReady }]
var processLaunching = {}, preparing_erizos = [];

var guid = (function() {
  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000)
               .toString(16)
               .substring(1);
  }
  return function() {
    return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
           s4() + '-' + s4() + s4() + s4();
  };
})();

var saveChild = function(id) {
    childs.push(id);
};

var removeChild = function(id) {
    childs.push(id);
};

var launchErizoJS = function() {
    log.info("Running process");
    var id = guid();
    processLaunching[id] = [];
    var fs = require('fs');
<<<<<<< HEAD
    var out = fs.openSync('./erizo-' + id + '.log', 'a');
    var err = fs.openSync('./erizo-' + id + '.log', 'a');
    var erizoProcess = spawn('./launch.sh', ['./../erizoJS/erizoJS.js', id, privateIP, publicIP], { detached: true, stdio: [ 'ignore', out, err ] });
=======
    var logFile = GLOBAL.config.erizoAgent.logPath + '/erizo-' + id + '.log';
    var out = fs.openSync(logFile, 'a');
    var err = fs.openSync(logFile, 'a');
    var params = ['./../erizoJS/erizoJS.js', id];
    if (myId) params.push(myId);
    var erizoProcess = spawn('node', params, { detached: true, stdio: [ 'ignore', out, err ] });
>>>>>>> 28e7c7c5cb386dfe5890912a3593c33f6a6e8db8
    erizoProcess.unref();

    var erizoTimeoutHandle;
    if (MAX_JS_DURATION_MS > 0) {
        erizoTimeoutHandle = setTimeout(function() {
            log.debug("TIMEOUT: terminating id", id);
            erizoProcess.kill();
        }, MAX_JS_DURATION_MS);
    }

    erizoProcess.on('close', function (code) {
<<<<<<< HEAD

=======
        log.info("Process died.");
        if (erizoTimeoutHandle) {
            clearTimeout(erizoTimeoutHandle);
        }
        var index = idle_erizos.indexOf(id);
        var index2 = erizos.indexOf(id);
        var index3 = preparing_erizos.indexOf(id);
        if (index > -1) {
            idle_erizos.splice(index, 1);
        } else if (index2 > -1) {
            erizos.splice(index2, 1);
        } else if (index3 >= 0) {
            preparing_erizos.splice(index3, 1);
        }
        delete processLaunching[id];
        delete processes[id];
        fillErizos();
    });
    processes[id] = erizoProcess;
    if (myId) {
        preparing_erizos.push(id);
    } else {
        idle_erizos.push(id);
    }
};

var launchErizoJsAndStart = function(publisher_id, callback) {
    log.info("Running process");
    if (!myId) {
        // this can't possibly work
        log.error("Trying to start publisher on new erizoJS without knowing agents id");
        return false;
    }
    var id = guid();
    processLaunching[id] = [{ publisherId: publisher_id, onReady: callback }];
    var fs = require('fs');
    var logFile = GLOBAL.config.erizoAgent.logPath + '/erizo-' + id + '.log';
    var out = fs.openSync(logFile, 'a');
    var err = fs.openSync(logFile, 'a');
    var erizoProcess = spawn('node', ['./../erizoJS/erizoJS.js', id, myId], { detached: true, stdio: [ 'ignore', out, err ] });
    erizoProcess.unref();

    var erizoTimeoutHandle;
    if (MAX_JS_DURATION_MS > 0) {
        erizoTimeoutHandle = setTimeout(function() {
            log.debug("TIMEOUT: terminating id", id);
            erizoProcess.kill();
        }, MAX_JS_DURATION_MS);
    }

    erizoProcess.on('close', function (code) {
        log.info("Process died.");
        if (erizoTimeoutHandle) {
            clearTimeout(erizoTimeoutHandle);
        }
>>>>>>> 28e7c7c5cb386dfe5890912a3593c33f6a6e8db8
        var index = idle_erizos.indexOf(id);
        var index2 = erizos.indexOf(id);
        if (index > -1) {
            idle_erizos.splice(index, 1);
        } else if (index2 > -1) {
            erizos.splice(index2, 1);
        }
        delete processes[id];
        fillErizos();
    });

    log.info('Launched new ErizoJS ', id);
    processes[id] = erizoProcess;
    //erizos.push(id);
    preparing_erizos.push(id);
    return true;
};

var dropErizoJS = function(erizo_id, callback) {
   log.info("Dropping process.");
   if (processes.hasOwnProperty(erizo_id)) {
      var process = processes[erizo_id];
      process.kill();
      delete processes[erizo_id];
      callback("callback", "ok");
   }
};

<<<<<<< HEAD
var fillErizos = function () {
    if (erizos.length + idle_erizos.length < GLOBAL.config.erizoAgent.maxProcesses) {
        if (idle_erizos.length < GLOBAL.config.erizoAgent.prerunProcesses) {
            launchErizoJS();
            fillErizos();
        }
=======
var fillErizos = function() {
    var maxNumber = GLOBAL.config.erizoAgent.maxProcesses - (erizos.length + preparing_erizos.length);
    if (maxNumber > GLOBAL.config.erizoAgent.prerunProcesses) {
        maxNumber = GLOBAL.config.erizoAgent.prerunProcesses;
    }
    for (var i = idle_erizos.length; i<maxNumber; i++) {
        launchErizoJS();
>>>>>>> 28e7c7c5cb386dfe5890912a3593c33f6a6e8db8
    }
    agentLeader.setLoad(erizos.length, GLOBAL.config.erizoAgent.maxProcesses);
};

<<<<<<< HEAD
var getErizo = function () {

    var erizo_id = idle_erizos.shift();

    if (!erizo_id) {
        if (erizos.length < GLOBAL.config.erizoAgent.maxProcesses) {
            launchErizoJS();
            return getErizo();
        } else {
            erizo_id = erizos.shift();
        }
    }

    return erizo_id;
}
=======
agentLeader.setDeleteErizoJSCallback(dropErizoJS);
>>>>>>> 28e7c7c5cb386dfe5890912a3593c33f6a6e8db8

var api = {
    createErizoJS: function(callback) {
        try {
<<<<<<< HEAD

            var erizo_id = getErizo(); 
            
            callback("callback", erizo_id);
=======
            log.info("createErizoJS ", id);
            if (idle_erizos.length > 0) {
                var erizo_id = idle_erizos.pop();
                callback("callback", erizo_id);

                // We re-use Erizos
                erizos.push(erizo_id);
            } else {
                var foundErizoId;
                for (var launchId in preparing_erizos) {
                    if (processLaunching.hasOwnProperty(launchId) && processLaunching[launchId].length === 0) {
                        foundErizoId = launchId;
                        processLaunching[launchId].push({publisher_id: id, onReady: callback});
                        break;
                    }
                }
                if (!foundErizoId && preparing_erizos.length + erizos.length >= GLOBAL.config.erizoAgent.maxProcesses && GLOBAL.config.erizoAgent.maxProcesses > 0) {
                    var index = Math.floor(GLOBAL.config.erizoAgent.maxProcesses * Math.random());
                    if (index < preparing_erizos.length) {
                        foundErizoId = preparing_erizos[index];
                        processLaunching[foundErizoId].push({publisher_id: id, onReady: callback});
                    } else {
                        index = index - preparing_erizos.length;
                        foundErizoId = erizos[index % erizos.length];
                        callback("callback", foundErizoId);
                    }
                }

                if (!foundErizoId) {
                    launchErizoJsAndStart(id, callback);
                }
            }
>>>>>>> 28e7c7c5cb386dfe5890912a3593c33f6a6e8db8

            erizos.push(erizo_id);
            fillErizos();
<<<<<<< HEAD

=======
>>>>>>> 28e7c7c5cb386dfe5890912a3593c33f6a6e8db8
        } catch (error) {
            log.error("Error in ErizoAgent:", error);
            if (error.stack) {
                log.error(error.stack);
            }
        }
    },
    deleteErizoJS: function(id, callback) {
        try {
            dropErizoJS(id, callback);
        } catch(err) {
            log.error("Error stopping ErizoJS");
        }
    },
    erizoJSReady: function(erizo_id, callback) {
        try {
            if (processLaunching.hasOwnProperty(erizo_id)) {
                var replyList = processLaunching[erizo_id];
                var isIdle = (replyList.length == 0);
                for (var curRequest = 0; curRequest < replyList.length; ++curRequest) {
                    if (replyList[curRequest].onReady) {
                        replyList[curRequest].onReady("callback", erizo_id);
                    }
                    log.debug("erizoJSReady call from", erizo_id, "for", replyList[curRequest].publisherId);
                }
                delete processLaunching[erizo_id];
                callback("callback", "ok");

                var index = preparing_erizos.indexOf(erizo_id);
                preparing_erizos.splice(index, 1);

                if (processes[erizo_id]) {
                    // put in proper list, if not already dropped
                    if (isIdle) {
                        idle_erizos.push(erizo_id);
                    } else {
                        erizos.push(erizo_id);
                    }
                }
            } else {
                log.debug("erizoJSReady call from", erizo_id, "for -undefined-");
                callback("callback", "fail");
            }
        } catch(error) {
            log.error("Error when erizoJS ready", error);
        }
    }
};

var interfaces = require('os').networkInterfaces(),
    addresses = [],
    k,
    k2,
    address, 
    privateIP, 
    publicIP;


for (k in interfaces) {
    if (interfaces.hasOwnProperty(k)) {
        for (k2 in interfaces[k]) {
            if (interfaces[k].hasOwnProperty(k2)) {
                address = interfaces[k][k2];
                if (address.family === 'IPv4' && !address.internal) {
                    if (k === BINDED_INTERFACE_NAME || !BINDED_INTERFACE_NAME) {
                        addresses.push(address.address);
                    }
                }
            }
        }
    }
}

privateIP = addresses[0];

if (GLOBAL.config.erizoAgent.publicIP === '' || GLOBAL.config.erizoAgent.publicIP === undefined){
    publicIP = addresses[0];
} else {
    publicIP = GLOBAL.config.erizoAgent.publicIP;
}

fillErizos();

amqper.connect(function () {
    "use strict";
    amqper.setPublicRPC(api);

<<<<<<< HEAD
    var rpcID = "ErizoAgent";
    

    amqper.bind(rpcID);

=======
    agentLeader.retrieveId(function(id) {
        myId = id;
        rpc.bind(id);
    });
>>>>>>> 28e7c7c5cb386dfe5890912a3593c33f6a6e8db8
});

/*
setInterval(function() {
    var search = spawn("ps", ['-aef']);

    search.stdout.on('data', function(data) {

    });

    search.on('close', function (code) {

    });
}, SEARCH_INTERVAL);
*/
