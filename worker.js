/** @param {NS} ns **/
 
// GLOBALS
var workerRam = "";
var wRam = "";
var gRam = "";
var silences = ["exec", "getServerMaxMoney", "sleep", "getServerSecurityLevel", "getServerMinSecurityLevel", "getServerMoneyAvailable", "getServerUsedRam", "getPurchasedServerCost", "getServerMaxRam"];
 
//  CONFIG
var taintPort = 1; // port to use for taint communication
var secTresh = 20; // treshold for weakening while growing (point value)
var serverNameTemplate = "nillabotV"; // template to name your purchased servers
// percentage of money to steal from target
// smaller percentages may be desirable in earlier game
var stealPercentage = 50;
 
 
//TODO: kill yourself after set time to make way for better targets (thinking at least two cycles and after an hour)
 
 
export async function main(ns) {
    var worker = ns.args[0];
    var target = ns.args[1];
    var fileList = ["hack.js", "grow.js", "weaken.js"]
    var hRam = ns.getScriptRam("hack.js");
    gRam = ns.getScriptRam("grow.js");
    wRam = ns.getScriptRam("weaken.js");
    workerRam = ns.getServerMaxRam(worker);
 
    // Logging helper
    for (var silence of silences) {
        ns.disableLog(silence);
    }
 
    await ns.scp(fileList, "home", worker,);
    upgradeCheck(ns, worker);
 
 
    while (true) {
 
        if (!isTargetMaxed(ns, target)) {
            await fillThatBitchUp(ns, target, worker);
        }
 
        if (!isTargetSoft(ns, target)) {
            await makeTargetSoft(ns, target, worker);
        }
 
        var hThreads = fetchHackThreads(ns, target);
        var w1Threads = fetchWeakenThreads(ns.hackAnalyzeSecurity(hThreads));
        var gThreads = fetchGrowThreads(ns, target);
        var w2Threads = fetchWeakenThreads(ns.growthAnalyzeSecurity(gThreads));
 
        let totalRam = hRam * hThreads + gRam * gThreads + (w1Threads + w2Threads) * wRam;
        if (totalRam > workerRam) {
            await taintAndQuit(ns, target);
        }
 
        // only continue if we can at least run one iteration, 
        // this is kinda redundant with the line above but I found to still need it 
        let iterations = Math.floor(workerRam / totalRam)
        if (iterations < 1) {
            await taintAndQuit(ns, target);
        }
 
        // only run as many iterations as we can start while the first weaken in a run executes
        // as not to still spawn more processes while the earlier ones already resolve
        if ((iterations * 1.1) > (ns.getWeakenTime(target) / 1000) + 1) {
            iterations = Math.floor(ns.getWeakenTime(target) / 1000) - 2;
        }
 
        ns.print("Running " + iterations + " iterations...");
        for (var i = 1; i <= iterations; i++) {
            ns.exec("hack.js", worker, hThreads, target, fetchHackSleep(ns, target), i);
            ns.exec("weaken.js", worker, w1Threads, target, 0, i);
            ns.exec("grow.js", worker, gThreads, target, fetchGrowSleep(ns, target), i);
            ns.exec("weaken.js", worker, w2Threads, target, 100, i);
            await ns.sleep(200);
        }
 
        //make sure the last iteration has run through before restarting the loop
        await ns.sleep(ns.getWeakenTime(target) + 150);
        upgradeCheck(ns, worker);
    }
}
 
// run weaken against the target until it's reached it's min Security
async function makeTargetSoft(ns, target, worker) {
    var threads = Math.ceil((ns.getServerSecurityLevel(target) - ns.getServerMinSecurityLevel(target)) / 0.05) + 1;
    ns.print("Weakening for " + threads + " threads.");
 
    if (threads > Math.floor((workerRam - ns.getServerUsedRam(worker)) / wRam)) {
        threads = Math.floor((workerRam - ns.getServerUsedRam(worker)) / wRam);
        ns.print("Too many threads for one cycle weakening. Weakening for " + threads + " threads instead.");
    }
    if (threads < 1) {
        ns.tprint("Negative Error on Worker: " + worker + "\nThreads: " + threads + "\nWorkerRam: " + workerRam + "\nUsed ram: " + ns.getServerUsedRam(worker));
    }
    ns.exec("weaken.js", worker, threads, target, 0, 0);
    await ns.sleep(ns.getWeakenTime(target) + 200);
 
    if (ns.getServerSecurityLevel(target) != ns.getServerMinSecurityLevel(target)) {
        await makeTargetSoft(ns, target, worker);
    }
}
 
// run grow against the target until it's reached it's max money
async function fillThatBitchUp(ns, target, worker) {
    var maxMoney = ns.getServerMaxMoney(target);
    var threads = Math.ceil(ns.growthAnalyze(target, maxMoney / ns.getServerMoneyAvailable(target)));
    ns.print("Growing for " + threads + " threads.");
 
    //Weaken if over secTreshold as not to make the grow take forever
    if ((ns.getServerSecurityLevel - ns.getServerMinSecurityLevel(target)) > secTresh) {
        makeTargetSoft(ns, target, worker);
    }
 
    if (threads > Math.floor((workerRam - ns.getServerUsedRam(worker)) / gRam)) {
        threads = Math.floor((workerRam - ns.getServerUsedRam(worker)) / gRam);
        ns.print("Too many threads for one cycle Grow. Growing for " + threads + " threads instead.");
    }
    ns.exec("grow.js", worker, threads, target, 0, 0);
    await ns.sleep(ns.getGrowTime(target) + 200);
 
    if (ns.getServerMoneyAvailable(target) != ns.getServerMaxMoney(target)) {
        await fillThatBitchUp(ns, target, worker);
    }
}
 
// check if target sec = min sec
function isTargetSoft(ns, target) {
    if (ns.getServerMinSecurityLevel(target) == ns.getServerSecurityLevel(target)) {
        return true;
    } else {
        return false;
    }
}
 
// check if target money = max money
function isTargetMaxed(ns, target) {
    if (ns.getServerMaxMoney(target) == ns.getServerMoneyAvailable(target)) {
        return true;
    } else {
        return false;
    }
}
 
// calculate threads needed for hack operation
function fetchHackThreads(ns, target) {
    let pPerThread = ns.hackAnalyze(target);
    let threadCount = Math.floor((stealPercentage / 100) / pPerThread);
    return threadCount;
}
 
// calculate threads needed for growth operation
function fetchGrowThreads(ns, target) {
    // 0.5 added as safety measure
    let threadCount = ns.growthAnalyze(target, (100 / (100 - stealPercentage)) + 0.5);
    return threadCount;
}
 
// calculate threads needed for weaken operation
function fetchWeakenThreads(amount) {
    //+1 or we could be left with less than 0,05 of security difference left...
    let threadCount = Math.ceil(amount / 0.05) + 1
    return threadCount;
}
 
function fetchHackSleep(ns, target) {
    var sTime = (ns.getWeakenTime(target) - ns.getHackTime(target)) - 50;
    return sTime;
}
 
function fetchGrowSleep(ns, target) {
    var sTime = (ns.getWeakenTime(target) - ns.getGrowTime(target)) + 50;
    return sTime;
}
 
// write target to taint port and kill this script
async function taintAndQuit(ns, target) {
    await ns.writePort(taintPort, target);
    ns.exit();
}
 
// Check if we have enough money and upgrade if we do
function upgradeCheck(ns, worker) {
    var currentRam = ns.getServerMaxRam(worker);
    var maxRam = ns.getPurchasedServerMaxRam();
 
    //upgrade if we can buy upgrade all 25 servers with half our money
    if (((ns.getServerMoneyAvailable("home") / 2) / 25) >= ns.getPurchasedServerCost(currentRam * 2) && currentRam != maxRam) {
        var ram = currentRam * 2;
        ram = ram > maxRam ? maxRam : ram;
 
 
        if (ns.getServerUsedRam(worker) > 0) {
            ns.killall(worker);
        }
 
        ns.deleteServer(worker);
        ns.purchaseServer(fetchServername(ram), ram);
        ns.tprint("Upgrade " + worker + " to " + ns.nFormat(ram * 1024 * 1024 * 1024, '0b') + "of ram.");
        ns.exit();
    }
}
 
// helper function for server purchasing
function fetchServername(ram) {
    var version = ""
    if (ram > 1000) {
        version = Math.round(ram / 1000) + "k";
    } else {
        version = ram;
    }
    return serverNameTemplate + version;
}