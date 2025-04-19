/** @param {NS} ns **/
 
// GLOBALS
var hostArray = [];
var attackedHosts = [];
var taintedHosts = [];
var taintTimer = Date.now();
var workersAvailable = false;
var silences = ["getServerMaxMoney", "getHackingLevel", "scan", "getServerRequiredHackingLevel", "sleep", "getServerNumPortsRequired", "getServerMoneyAvailable", "purchaseServer"];
 
// CONFIG
var taintPort = 1; // port to use for taint communication
var taintInterval = 1000 * 60 * 30; // reset taints after 30 minutes
var ram = 1024; // capacity of initial purchased servers
var serverNameTemplate = "nillabotV"; // template to name your purchased servers
 
export async function main(ns) {
    for (var silence of silences) {
        ns.disableLog(silence);
    }
 
    while (true) {
 
        // check for online workers and never go in here again after we found/bough some
        if(!workersAvailable){
            if(ns.getPurchasedServers().length > 0){
                workersAvailable = true;
                ns.print("Workers online. Proceeding with money making baby.")
            } else {
                await hatchBabies(ns);
                continue;
            }
        }
 
        var workerNodes = findEmptyWorkers(ns);
        reevaluateAttacks(ns);
        
 
        for (var worker of workerNodes) {
            checkTaints(ns);
            var target = await findTarget(ns);
            
            //In case we didn't find a suitable target wait a second and continue with the next worker
            if(target == "") {
                await ns.sleep(1000);
                ns.print("No suitable target found...")
                continue;
            }
            ns.run("worker.js", 1, worker, target);
            attackedHosts.push(target);
        }
        await ns.sleep(1000);
    }
}
 
// find and return best target
async function findTarget(ns) {
    let target = "";
    
    //TODO include hackchance in calculation maybe?
    var rootedServers = await searchAndDestroy(ns);
    var usableServers = findUsableServers(ns, rootedServers);
    usableServers = sortByMaxMoney(ns, usableServers);
    for (var server of usableServers) {
        if (attackedHosts.includes(server) || taintedHosts.includes(server)) {
            continue;
        } else {
            target = server;
            break;
        }
    }
    return target;
}
 
// get all server and root them if possible, array of rooted servers
async function searchAndDestroy(ns) {
    hostArray = [];
    var allServers = await searchForHosts(ns, "home", "");
    var rootedServers = [];
    var attackLevel = 0;
 
    if (ns.fileExists("BruteSSH.exe", "home")) {
        attackLevel += 1;
    }
    if (ns.fileExists("FTPCrack.exe", "home")) {
        attackLevel += 1;
    }
    if (ns.fileExists("RelaySMTP.exe", "home")) {
        attackLevel += 1;
    }
    if (ns.fileExists("HTTPWorm.exe", "home")) {
        attackLevel += 1;
    }
    if (ns.fileExists("SQLInject.exe", "home")) {
        attackLevel += 1;
    }
 
    for (var server of allServers) {
        if (ns.hasRootAccess(server)) {
            rootedServers.push(server);
        } else if (ns.getServerNumPortsRequired(server) <= attackLevel) {
            if (ns.fileExists("BruteSSH.exe", "home")) {
                ns.brutessh(server);
            }
            if (ns.fileExists("FTPCrack.exe", "home")) {
                ns.ftpcrack(server);
            }
            if (ns.fileExists("HTTPWorm.exe", "home")) {
                ns.httpworm(server);
            }
            if (ns.fileExists("SQLInject.exe", "home")) {
                ns.sqlinject(server);
            }
            if (ns.fileExists("relaySMTP.exe", "home")) {
                ns.relaysmtp(server);
            }
            ns.nuke(server);
            if (ns.hasRootAccess(server)) {
                rootedServers.push(server);
            }
        }
    }
    return rootedServers;
}
 
// search all hosts and return an array with them
async function searchForHosts(ns, currentNode, prevNode) {
    var nodes = ns.scan(currentNode);
    var pattern = serverNameTemplate + ".*";
    var regex = new RegExp(pattern, "g");
 
    //remove previousNode from Nodes to scan as not to have an infinite loop
    var index = nodes.indexOf(prevNode);
    if (index > -1) {
        nodes.splice(index, 1);
    }
 
    if (nodes.length > 0) {
        nodes = nodes.filter(node => !regex.test(node));
        for (var node of nodes) {
            hostArray.push(node);
            await searchForHosts(ns, node, currentNode);
        }
    }
    return hostArray;
}
 
 
// take array of servers and filter for those we can hack and which hold money, then return it
function findUsableServers(ns, servers) {
 
    //TODO: filter out servers without money (or above a certain treshold) and no possibillity to grow to make the sort later more efficient
    var usableServers = [];
    for (var server of servers) {
        if (ns.getServerRequiredHackingLevel(server) <= ns.getHackingLevel() && ns.getServerMaxMoney(server) > 0) {
            usableServers.push(server);
        }
    }
    return usableServers;
}
 
// take array of servers and return sorted for max money (big to small)
function sortByMaxMoney(ns, servers) {
    var serversJson = [];
    var sortedServers = [];
    for (var server of servers) {
        serversJson.push({ "host": server, "maxMoney": ns.getServerMaxMoney(server) });
    }
    serversJson.sort(function (a, b) {
        return b.maxMoney - a.maxMoney;
    });
 
    for (var i = 0; serversJson.length > i; i++) {
        sortedServers[i] = serversJson[i].host;
    }
 
    return sortedServers;
}
 
 
// check all running scripts on the machine and get their targets
function reevaluateAttacks(ns) {
    var portEmpty = false;
    var message = "";
    attackedHosts = [];
    var scripts = ns.ps("home");
    for (var script of scripts) {
        if(script.filename === "worker.js") {
            attackedHosts.push(script.args[1]);
        }
    }
    while (!portEmpty) {
        message = ns.readPort(taintPort);
        if(message != "NULL PORT DATA") {
            taintedHosts.push(message);
            ns.print("Tainted " + message + "...");
        } else {
            portEmpty = true;
            break;
        }
    }
}
 
// reset all taints if configured time has lapsed
function checkTaints(ns) {
    if ((Date.now() - taintTimer) > taintInterval)
    {
        taintedHosts = [];
        taintTimer = Date.now();
        ns.print("Resetting taints...");
    }
}
 
// find all workers that aren't currently attacking anyone and return them
function findEmptyWorkers(ns) {
    //populate emptyWorkers with all workers and then filter out these with running scripts
    var allWorkers = ns.getPurchasedServers();
    var busyWorkers = []; 
    var emptyWorkers = [];
 
 
    var scripts = ns.ps("home");
    for (var script of scripts) {
        if(script.filename === "worker.js") {
            busyWorkers.push(script.args[0]);
        }
    }
    emptyWorkers = allWorkers.filter(worker => !busyWorkers.includes(worker));
    //ns.print("emptyWorkers: " + emptyWorkers + "\nbusyWorkers: "+ busyWorkers);
 
    //TODO: check for running scripts on worker as well
 
    return emptyWorkers;
}
 
// initially buy servers if enough money available, else root all possible servers at least
async function hatchBabies(ns) {
    var upgradeCost = ns.getPurchasedServerLimit() * ns.getPurchasedServerCost(ram);
 
    if (upgradeCost < ns.getServerMoneyAvailable("home") / 2) {
        ns.tprint("Buying babies first workernodes ♥(。U ω U。)");
        for (var i = 0; i < ns.getPurchasedServerLimit(); i++) {
            ns.purchaseServer(serverNameTemplate + ram, ram);
        }
        workersAvailable = true;
    } else {
        ns.print("No workers yet, rooting and tooting some servers instead...");
        await searchAndDestroy(ns);
        await ns.sleep(10 * 1000);
    }
}