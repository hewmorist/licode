/*global require, logger. setInterval, clearInterval, Buffer, exports*/
var Getopt = require('node-getopt');

var config = require('./../../licode_config');

// Configuration default values
GLOBAL.config = config || {};
GLOBAL.config.erizoAgentLeader = GLOBAL.config.erizoAgentLeader || {};
GLOBAL.config.erizoAgentLeader.netMaxByteS = GLOBAL.config.erizoAgentLeader.netMaxByteS || 12500000;
GLOBAL.config.erizoAgentLeader.netInterface = GLOBAL.config.erizoAgentLeader.netInterface || 'eth0'
GLOBAL.config.erizoAgentLeader.reportInterval = GLOBAL.config.erizoAgentLeader.reportInterval || 7000;

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
var rpcAll = require('./../common/rpcFanout');

// Logger
var log = logger.getLogger("ErizoAgent");

var os = require('os');
var proc = require('node-proc');

var agents = { };
exports.UID_HEAD = 'UIdErizoAgent+';
var isLeader = false;
var myDeleteErizoJSCallback = {};

// make a unique id for this erizo agent - used for leader election
var getUid = function() {
    return Math.floor(Math.random() * 0xffffffff) + 1;
};

var myId = getUid();
var myIdWasSet = false;
var myIdCallback = [];
var myLoad = {
    id: myId,
    current: 0,
    max: 0,
    netTraffic: 0,
    cpuUsage: 0
};
var myLocalApi = {};

var setId = function(id) {
    if (id) {
        if (typeof id === 'string') {
            id = id.replace('amq.gen', 'EAId'); 
        }
        myId = id;
        myLoad.id = id;

        myIdWasSet = true;
        for(var i = 0; i < myIdCallback.length; ++i) {
            myIdCallback[i](exports.UID_HEAD + myId);
        }
        myIdCallback = [];
    }
};

// how old the last leader info is
var leaderAge = 0;

var lowestLeaderId = 0;
var election = {};
// how long the leader election may take at most
var LEADER_ELECTION_DURATION = 3000;
var LOAD_INFORMATION_INTERVAL = GLOBAL.config.erizoAgentLeader.reportInterval;
// how often an interval may be missed before lost situation is assumed
var MAX_AGE = 3;

var reportIntervalInstance = undefined;
var lastNetDev = [];
var deltaNetDev = 0;
var lastCpuData = [];
var deltaCpuUsage = 0;

var sendLoad = function() {
    myLoad.netTraffic = deltaNetDev / GLOBAL.config.erizoAgentLeader.netMaxByteS;
    myLoad.cpuUsage = deltaCpuUsage;
    rpcAll.callFanout('AllErizoAgents', 'pingWithLoad', [myLoad], { callback: function(result) {
        if (result !== 'ok') {
            log.info("Leader failed to answer to ping - requesting election! Message was ", result);
            rpcAll.callFanout('AllErizoAgents', 'triggerLeaderElection', []);
        }
    }});
}

// this instance begins acting the leader
var startLeading = function() {
    isLeader = true;
    myLoad.leader = true;
 
    log.info("election => I am LEADER!");
    rpcAll.callFanout('AllErizoAgents', 'leaderChosen', [myId], {callback: function(){}});

    agents = {};
    var rpcLead = require('./../common/rpcSecond');

    var chooseAgentForCreate = function(id, callback) {
        var bestId = undefined;
        var bestLoad = 0;
        for (var agentId in agents) {
            if (agents.hasOwnProperty(agentId)) {
                var current = agents[agentId];
                if (current.age <= 1) {
                    var curLoad = current.netTraffic;
                    if (current.cpuUsage > curLoad) curLoad = current.cpuUsage;
                    if (!bestId || curLoad < bestLoad) {
                        bestLoad = curLoad;
                        bestId = agentId;
                    }
                }
            }
        }
        if (bestId) {
            log.info("LEADER - assigning task to agent ", bestId);
            log.debug("chosen from: ", agents);
            // integrate a spread across agents with similar load
            agents[bestId].cpuUsage += 0.1;
            agents[bestId].netTraffic += 0.1;
            rpcLead.callRpc(exports.UID_HEAD+bestId, 'createErizoJS', [id], {callback: function(erizoId) {
                callback('callback', erizoId);
            } });
        } else {
            log.error("LEADER - unable to assign task! Full load?! ", agents);
        }
    };


    var apiLeader = {
        createErizoJS: function(id, callback) {
            try {
                chooseAgentForCreate(id, callback);
            } catch (error) {
                console.log("Error in ErizoAgent:", error);
            }
        },
        deleteErizoJS: function(id, callback) {
            try {
                rpcAll.callFanout('AllErizoAgents', 'deleteErizoJS', [id], {callback: callback});
            } catch(err) {
                log.error("Error stopping ErizoJS");
            }
        }
    };

    rpcLead.connect(function() {
        "use strict";
        rpcLead.setPublicRPC(apiLeader);
        var rpcId = "ErizoAgent";
        rpcLead.bind(rpcId);
    });
    //rpcAll.setMainRPC(apiLeader);
    //var rpcId = "ErizoAgent";
    //rpcAll.bindMain(rpcId);
};

// trigger a lead election - if applicable
var startLeaderElection = function() {
    if (lowestLeaderId) {
        // prevent multiple elections from happening at the same time
        return;
    }
    election = {};
    leaderAge = 0;
    lowestLeaderId = myId;
    rpcAll.callFanout('AllErizoAgents', 'leaderVote', [myId],{callback: function(){}});
    setTimeout(function() {
        if (lowestLeaderId === myId) {
            startLeading();
        }
    }, LEADER_ELECTION_DURATION);
};

var apiAll = {
    // leader only: receive load information from each agent
    pingWithLoad: function(loadInfo, callback) {
        if (isLeader) {
            log.debug("Leader received information: ", loadInfo);
            try {
                agents[loadInfo.id] = loadInfo;
                agents[loadInfo.id].age = 0;
                callback('callback', 'ok');
            } catch(error) {
                log.error("Error with load information");
                callback('callback', 'error')
            }
        } else {
            log.debug("Agent received information: ", loadInfo);
            try {
                if (loadInfo.leader) {
                    leaderAge = 0;
                }
            } catch(error) {
                log.error("Error with non-leader load information.");
            }
        }
    },
    // always: leader has been chosen
    leaderChosen: function(leaderId, callback) {
        log.info("Leader chosen: ", leaderId);
        election = {};
        lowestLeaderId = 0;
        leaderAge = 0;
        sendLoad();
    },
    // always: leader votes
    leaderVote: function(voteId, callback) {
        log.debug("Leader vote: ", voteId, " - already collected: ", election);
        try {
            if (election.hasOwnProperty(voteId)) {
                log.error("Detected collision for ", voteId);
                // collision
                // TODO dk: needs to resolve collision
            }
            election[voteId] = 1;

            if (voteId < lowestLeaderId) {
                lowestLeaderId = voteId;
            }
        } catch(err) {
            log.error("Error during leader vote reception");
        }
    },
    // always: leader selection starting
    triggerLeaderElection: function(callback) {
        log.debug("Received trigger leader election!");
        try {
            startLeaderElection();
        } catch(err) {
            log.error("Error during leader selection");
        }
    },
    // always: inform agent instance that erizo js instance should die
    deleteErizoJS: function(id, callback) {
        // currently not used?!
        if (myDeleteErizoJSCallback) {
            myDeleteErizoJSCallback(id, callback);
        }
    }
};

rpcAll.connect(function () {
    "use strict";
    rpcAll.setPublicRPC(apiAll);

    var rpcID = "AllErizoAgents";

    rpcAll.bind(rpcID);
    
    setId(rpcAll.getId());
    sendLoad();
});

var lastReadNetLoadTime = 0;

var readNetLoad = function() {
    if (proc) {
        proc.netdev(function(err, netdev) {
            // log.debug('measuring load - new: ', netdev, ' VS old: ', lastNetDev);
            var oldDevLoad = lastNetDev;
            var currentTime = Date.now();
            var deltaTime = currentTime - lastReadNetLoadTime;
            lastReadNetLoadTime = currentTime;
            lastNetDev = netdev;
            if (oldDevLoad.length > 0) {
                var diff = {};
                var deviceCount = 0;
                var i = 0;
                var devname = '';
                for (i = 0; i < netdev.length; ++i) {
                    devname = netdev[i].device;
                    if (devname === 'lo') continue;
                    ++deviceCount;
                    diff[devname] = {};
                    diff[devname].recv = netdev[i].Rx.bytes;
                    diff[devname].send = netdev[i].Tx.bytes;
                }
                for (i = 0; i < oldDevLoad.length; ++i) {
                    devname = oldDevLoad[i].device;
                    if (diff.hasOwnProperty(devname)) {
                        diff[devname].recv -= oldDevLoad[i].Rx.bytes;
                        diff[devname].send -= oldDevLoad[i].Tx.bytes;
                    }  
                }

                var totalDiff = 0;
                if (diff.hasOwnProperty(GLOBAL.config.erizoAgentLeader.netInterface)) {
                    log.debug('counted packet differences: ', diff);
                    totalDiff = diff[GLOBAL.config.erizoAgentLeader.netInterface].send;
                } else {
                    log.debug('BAD: could not find configured net interface! Using all counted packet differences: ', diff);
                    for (var device in diff) {
                        if (diff.hasOwnProperty(device) ) {
                            // totalDiff += diff[device].recv;
                            totalDiff += diff[device].send;
                        }
                    }
                }
                deltaNetDev = totalDiff * 1000 / deltaTime;
                log.debug('measured current network load: ', deltaNetDev, ' with diff: ', totalDiff, ' - ', diff);
            }
        });
    }

    var oldCpuData = lastCpuData;
    lastCpuData = os.cpus();
    if (oldCpuData.length > 0) {
        var cpuIdle = 0;
        var cpuUse = 0;
        var num = lastCpuData.length;
        if (oldCpuData.length < num) num = oldCpuData.length;
        for (var i = 0; i < num; ++i) {
             cpuIdle += lastCpuData[i].times.idle - oldCpuData[i].times.idle;
             cpuUse += lastCpuData[i].times.user + lastCpuData[i].times.sys + lastCpuData[i].times.nice + lastCpuData[i].times.irq
                      - oldCpuData[i].times.user - oldCpuData[i].times.sys - oldCpuData[i].times.nice - oldCpuData[i].times.irq;
        }
        var totalCpu = cpuUse + cpuIdle
        if (totalCpu > 0) {
            deltaCpuUsage = cpuUse / (totalCpu);
        } else {
            deltaCpuUsage = 0;
        }
        log.debug('measured cpu current: ', deltaCpuUsage, ' with use ', cpuUse, ' vs idle ', cpuIdle);
    }
};

setInterval(readNetLoad, LOAD_INFORMATION_INTERVAL);
readNetLoad();

var restartReportInterval = function() {
if (reportIntervalInstance) {
    clearInterval(reportIntervalInstance);
}
reportIntervalInstance = setInterval(function() {
    sendLoad();
    if (isLeader) {
        var lost = [];
        for (var agentId in agents) {
            if (agents.hasOwnProperty(agentId)) {
                agents[agentId].age += 1;
                if (agents[agentId].age > MAX_AGE) {
                    lost.push(agentId);
                }
            }
        }
        for (var i = 0; i < lost.length; ++i) {
            var deleteId = lost[i];
            log.debug("LEADER - agent ", deleteId, " was unresponsive - deleting!");
            delete agents[deleteId];
        }
    } else {
        leaderAge += 1;
        if (leaderAge > MAX_AGE) {
            log.debug("Leader missing! No report from leader for " + leaderAge + " intervals. Requesting election!");
            rpcAll.callFanout('AllErizoAgents', 'triggerLeaderElection', [], {callback: function(){}});
        }
    }
}, LOAD_INFORMATION_INTERVAL);
}
restartReportInterval();

// set a current load and a max load
exports.setLoad = function(currentInstances, maxInstances) {
    myLoad.current = currentInstances;
    myLoad.max = maxInstances;
};

exports.setDeleteErizoJSCallback = function(callback) {
    myDeleteErizoJSCallback = callback;
};

exports.getId = function() {
    return myId;
};

exports.retrieveId = function(callback) {
    if (myIdWasSet) {
        callback(exports.UID_HEAD + myId);
    } else {
        myIdCallback.push(callback);
    }
};
