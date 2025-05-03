/** @param {NS} ns */
export async function main(ns) {
    const shareScriptName = 'run-share.js';
    const checkInterval = 60 * 1000; // Check every 60 seconds
    const homeReserveRam = 16; // Keep this much RAM free on home (sync with hack-manager?)
    const targetFaction = "Sector-12"; // Faction to prioritize sharing for
    // Consider getting reserve RAM from hack-manager config or a shared config file later.

    ns.disableLog('ALL');
    ns.tail();
    ns.print("[INFO] Starting Share Manager...");

    let shareScriptRam = 0;
    try {
        shareScriptRam = ns.getScriptRam(shareScriptName, 'home');
        if (shareScriptRam <= 0) {
            throw new Error("Could not get RAM cost for run-share.js, or it's 0.");
        }
        ns.print(`[INFO] ${shareScriptName} RAM cost: ${shareScriptRam}GB`);
    } catch (e) {
        ns.print(`[ERROR] Failed to get RAM cost for ${shareScriptName}: ${e}. Exiting.`);
        ns.tprint(`[ERROR] Share Manager failed to get RAM cost for ${shareScriptName}. Exiting.`);
        return;
    }

    while (true) {
        ns.print(`[INFO] Share Manager Cycle Start. Checking work status for ${targetFaction}...`);
        
        // Check current player work status
        const player = ns.getPlayer();
        const workingForTargetFaction = player.isWorking && player.currentWorkFactionName === targetFaction;
        
        if (!workingForTargetFaction) {
             ns.print(`[WARN] Player is not currently working for ${targetFaction}. Stopping all share processes.`);
             // Kill all existing share processes if not working for the target faction
             const allServers = getAllRootedServers(ns); // Get all servers again
             for (const server of allServers) {
                 const runningProcesses = ns.ps(server).filter(p => p.filename === shareScriptName);
                 if (runningProcesses.length > 0) {
                      ns.print(` -> Stopping ${runningProcesses.length} share process(es) on ${server}...`);
                      for (const proc of runningProcesses) {
                          ns.kill(proc.pid);
                      }
                 }
             }
             ns.print(`[INFO] Share processes halted. Waiting for player to work for ${targetFaction}.`);
        } else {
            // Proceed with managing share threads only if working for the target faction
            ns.print(`[INFO] Player is working for ${targetFaction}. Scanning network and adjusting share processes...`);
            const servers = getAllRootedServers(ns); // Reuse the function
            let totalThreads = 0;
            let totalPossibleThreads = 0;

            for (const server of servers) {
                let freeRam = 0;
                try {
                    const maxRam = ns.getServerMaxRam(server);
                    const usedRam = ns.getServerUsedRam(server);
                    freeRam = maxRam - usedRam;
                    if (server === 'home') {
                        freeRam = Math.max(0, freeRam - homeReserveRam);
                    }
                } catch (e) {
                    ns.print(`[WARN] Could not get RAM info for ${server}. Skipping.`);
                    continue;
                }

                const possibleThreads = Math.floor(freeRam / shareScriptRam);
                totalPossibleThreads += possibleThreads;

                const runningProcesses = ns.ps(server).filter(p => p.filename === shareScriptName);
                const currentThreads = runningProcesses.reduce((sum, p) => sum + p.threads, 0);
                totalThreads += currentThreads;

                // Adjust threads
                if (possibleThreads > currentThreads) {
                    // Need to start more threads
                    const threadsToStart = possibleThreads - currentThreads;
                    if (threadsToStart > 0) {
                        if (!ns.fileExists(shareScriptName, server)) {
                            const scpSuccess = await ns.scp(shareScriptName, server, 'home');
                            if (!scpSuccess) {
                                 ns.print(`[ERROR] Failed to copy ${shareScriptName} to ${server}. Cannot start threads.`);
                                 continue;
                            }
                        }
                        const pid = ns.exec(shareScriptName, server, threadsToStart);
                        if (pid > 0) {
                             ns.print(`[INFO] Started ${threadsToStart} share threads on ${server}.`);
                        } else {
                             ns.print(`[WARN] Failed to start ${threadsToStart} share threads on ${server} (exec returned 0). RAM calculation mismatch?`);
                        }
                    }
                } else if (possibleThreads < currentThreads) {
                    // Need to kill excess threads
                    let threadsToKill = currentThreads - possibleThreads;
                    ns.print(`[INFO] Reducing share threads on ${server} by ${threadsToKill}.`);
                    // Kill oldest processes first (lower PID)
                     runningProcesses.sort((a, b) => a.pid - b.pid);
                     for (const process of runningProcesses) {
                         if (threadsToKill <= 0) break;
                         const killThreads = Math.min(threadsToKill, process.threads);
                         if (killThreads === process.threads) {
                             if (ns.kill(process.pid)) {
                                 ns.print(` -> Killed PID ${process.pid} (${process.threads} threads) on ${server}`);
                                 threadsToKill -= process.threads;
                             } else {
                                 ns.print(` -> Failed to kill PID ${process.pid} on ${server}`);
                             }
                         } else {
                             // Cannot partially kill threads with ns.kill, so skip this process if we can't kill all its threads
                              ns.print(` -> Skipping PID ${process.pid} (${process.threads} threads), need to kill ${threadsToKill}. Cannot partially kill.`);
                              // Alternative: kill the whole process anyway? Simpler.
                              // if (ns.kill(process.pid)) { ... threadsToKill -= process.threads; ...}
                         }
                     }
                } 
                // else: possibleThreads === currentThreads, do nothing

                 await ns.sleep(50); // Small delay between servers
            }
            
             ns.print(`[INFO] Share Status: Running ${totalThreads} threads across ${servers.length} servers. (Potentially ${totalPossibleThreads} possible)`);
        } // End of the main 'else' block (workingForTargetFaction)

        await ns.sleep(checkInterval);
    }
}

/**
 * Scans the network and returns a list of all servers with root access.
 * @param {NS} ns
 * @returns {string[]}
 */
function getAllRootedServers(ns) {
    const servers = new Set();
    const queue = ['home'];
    servers.add('home'); // Always include home

    while(queue.length > 0) {
        const current = queue.shift();
        const neighbors = ns.scan(current);

        for (const neighbor of neighbors) {
            if (!servers.has(neighbor)) {
                servers.add(neighbor);
                queue.push(neighbor);
            }
        }
    }

    const rootedServers = [];
    for (const server of servers) {
        try {
            if (ns.hasRootAccess(server)) {
                 rootedServers.push(server);
            }
        } catch { /* Ignore servers we can't access */ }
    }
    return rootedServers;
} 