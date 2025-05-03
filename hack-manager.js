/** @param {NS} ns */
export async function main(ns) {
  // --- Configuration ---
  const config = {
    targetCount: 3,                // Number of targets to manage simultaneously
    moneyPercentToHack: 0.5,     // Target % of server money to hack (e.g., 0.5 = 50%)
    securityThresholdPadding: 3, // Keep security this much above minimum
    reserveHomeRam: 16,          // Keep this much RAM free on home
    minTargetMoney: 1 * 1e6,     // Minimum $1m cash on target to consider it
    scanDepth: 10,               // How deep to scan from home
    cycleTime: 5 * 1000,         // Re-evaluate targets every 5 seconds
    prepFocusFactor: 0.75,       // Allocate 75% of RAM to prep (grow/weaken), 25% to hack
    useHomeServer: true,         // Utilize home RAM for hacking
    workerScripts: [             // Worker scripts to copy to servers
      "hack-worker.js",
      "grow-worker.js",
      "weaken-worker.js"
    ],
    ports: {                     // Required port opening programs
      "BruteSSH.exe": ns.brutessh,
      "FTPCrack.exe": ns.ftpcrack,
      "relaySMTP.exe": ns.relaysmtp,
      "HTTPWorm.exe": ns.httpworm,
      "SQLInject.exe": ns.sqlinject
    }
  };

  // --- Script State ---
  let managedTargets = []; // Array of {hostname, prepComplete, assignedRam}
  let workerServers = [];  // Array of {hostname, maxRam, usedRam}

  // --- Initialization ---
  ns.disableLog("ALL");
  ns.tail();
  log("Starting Hack Manager...");

  // --- Main Loop ---
  while (true) {
    try {
      // 1. Update Worker Server List
      updateWorkerServers();

      // 2. Scan and Find Potential Targets
      const potentialTargets = findPotentialTargets();

      // 3. Select and Prioritize Targets
      selectAndManageTargets(potentialTargets);

      // 4. Assign Workers to Targets
      await assignWorkersToTargets();
      
      // 5. Display Status (Optional)
      displayStatus();

    } catch (e) {
      log(`ERROR in main loop: ${e}`, "error");
    }
    await ns.sleep(config.cycleTime);
  }

  // --- Helper Functions ---

  function updateWorkerServers() {
    workerServers = ns.getPurchasedServers().map(s => ({ hostname: s, maxRam: ns.getServerMaxRam(s), usedRam: ns.getServerUsedRam(s) }));
    if (config.useHomeServer) {
      const homeRam = ns.getServerMaxRam("home");
      const homeUsed = ns.getServerUsedRam("home");
      const homeAvailable = Math.max(0, homeRam - homeUsed - config.reserveHomeRam);
      if (homeAvailable > 0) {
         // Treat available home RAM as a worker server
         workerServers.push({ hostname: "home", maxRam: homeAvailable, usedRam: 0}); 
      }
    }
    // log(`Found ${workerServers.length} worker servers.`);
  }

  function findPotentialTargets() {
    const allServers = new Set(["home"]);
    const queue = ["home"];
    let depth = 0;

    // Basic breadth-first scan
    while (queue.length > 0 && depth < config.scanDepth) {
      const currentLevelSize = queue.length;
      for (let i = 0; i < currentLevelSize; i++) {
        const server = queue.shift();
        const neighbors = ns.scan(server);
        for (const neighbor of neighbors) {
          if (!allServers.has(neighbor)) {
            allServers.add(neighbor);
            queue.push(neighbor);
          }
        }
      }
      depth++;
    }

    const potential = [];
    const playerHackLevel = ns.getHackingLevel();
    for (const server of allServers) {
      if (server === "home" || ns.getPurchasedServers().includes(server)) continue;
      
      try {
        let serverInfo = ns.getServer(server);
        if (!serverInfo.hasAdminRights) {
          if (!gainRootAccess(server)) {
            // log(`Could not gain root access to ${server}. Skipping.`);
            continue; // Skip if we can't root it
          }
          // Re-fetch info after gaining root
          serverInfo = ns.getServer(server); 
        }

        // Basic filtering
        if (serverInfo.requiredHackingSkill <= playerHackLevel && 
            serverInfo.moneyMax > config.minTargetMoney &&
            serverInfo.serverGrowth > 0) { // Ensure it can be grown
          potential.push(server);
        }
      } catch (e) {
         // ns.print(`Could not get info for ${server}: ${e}`);
      }
    }
    // log(`Found ${potential.length} potential targets.`);
    return potential;
  }

  function gainRootAccess(target) {
    let openPorts = 0;
    for (const program in config.ports) {
        if (ns.fileExists(program, "home")) {
            try {
                config.ports[program](target);
                openPorts++;
            } catch(e) {/* Ignore errors if port opener fails */} 
        }
    }

    try {
      const requiredPorts = ns.getServerNumPortsRequired(target);
      if (openPorts >= requiredPorts) {
        ns.nuke(target);
        log(`Nuked ${target}! (${openPorts}/${requiredPorts} ports opened)`, "success");
        return true;
      } else {
        // log(`Cannot nuke ${target}. Need ${requiredPorts} ports, have ${openPorts}.`);
      }
    } catch (e) {
       // log(`Nuke failed for ${target}: ${e}`);
    }
    return false;
  }

  function selectAndManageTargets(potentialTargets) {
    // Sort potential targets (e.g., by max money, adjust later)
    potentialTargets.sort((a, b) => ns.getServerMaxMoney(b) - ns.getServerMaxMoney(a));

    // Remove completed/invalid targets from managed list
    managedTargets = managedTargets.filter(t => {
        try {
            ns.getServerMaxMoney(t.hostname); // Check if server still exists/accessible
            return true;
        } catch { 
            log(`Removing invalid target ${t.hostname} from managed list.`);
            return false; 
        }
    });

    // Add new targets if needed
    let added = 0;
    for (const target of potentialTargets) {
      if (managedTargets.length >= config.targetCount) break;
      if (!managedTargets.some(t => t.hostname === target)) {
        managedTargets.push({ hostname: target, prepComplete: false, assignedRam: 0 });
        added++;
      }
    }
    // if (added > 0) log(`Added ${added} new targets. Managing: ${managedTargets.map(t=>t.hostname).join(', ')}`);

    // Trim excess targets if any (e.g., if config.targetCount decreased)
    if (managedTargets.length > config.targetCount) {
        managedTargets.splice(config.targetCount);
    }
  }

  async function assignWorkersToTargets() {
    let totalAvailableRam = workerServers.reduce((sum, s) => sum + s.maxRam - s.usedRam, 0);
    if (totalAvailableRam <= 0) {
        log("No worker RAM available.", "warn");
        return;
    }

    // Reset assigned RAM for targets & update worker server used RAM accurately
    managedTargets.forEach(t => t.assignedRam = 0);
    workerServers.forEach(s => s.usedRam = (s.hostname === 'home' ? Math.max(0, ns.getServerMaxRam('home') - config.reserveHomeRam) - s.maxRam : ns.getServerUsedRam(s.hostname)) ); // Correctly get used RAM
    totalAvailableRam = workerServers.reduce((sum, s) => sum + s.maxRam - s.usedRam, 0); // Recalculate available
    let ramAllocatedThisCycle = 0;

    for (const targetInfo of managedTargets) {
      const target = targetInfo.hostname;
      let server = null; 
      try { server = ns.getServer(target); } catch { continue; } // Skip if server somehow invalid
      
      const moneyAvail = server.moneyAvailable;
      const moneyMax = server.moneyMax;
      const secLevel = server.hackDifficulty;
      const minSec = server.minDifficulty;

      const needsWeaken = secLevel > minSec + config.securityThresholdPadding;
      const needsGrow = moneyAvail < moneyMax * 0.9; // Grow if below 90% max money
      
      targetInfo.prepComplete = !needsWeaken && !needsGrow;

      let requiredRam = 0;
      let action = null;
      let threads = 0;
      const scriptRamMap = {
          "weaken-worker.js": ns.getScriptRam("weaken-worker.js"),
          "grow-worker.js": ns.getScriptRam("grow-worker.js"),
          "hack-worker.js": ns.getScriptRam("hack-worker.js")
      };

      // Determine required action: Weaken > Grow > Hack
      if (needsWeaken) {
        action = "weaken-worker.js";
        // Calculate weaken threads needed based on security difference
        const securityDeficit = secLevel - minSec;
        // ns.weakenAnalyze(1) returns how much security 1 thread reduces
        threads = Math.max(1, Math.ceil(securityDeficit / ns.weakenAnalyze(1))); 
        requiredRam = scriptRamMap[action] * threads;
      } else if (needsGrow) {
        action = "grow-worker.js";
        // Calculate grow threads needed to reach max money
        const growMultiplier = Math.max(1.01, moneyMax / Math.max(moneyAvail, 1)); // Ensure > 1, target max money
        try { 
            threads = Math.max(1, Math.ceil(ns.growthAnalyze(target, growMultiplier)));
        } catch (e) { threads = 1; /* Avoid errors on 0 money servers */ }
        requiredRam = scriptRamMap[action] * threads;
      } else { // Ready to hack
        action = "hack-worker.js";
        // Calculate hack threads needed to take configured percentage
        const hackAmount = moneyMax * config.moneyPercentToHack;
         try {
            threads = Math.max(1, Math.floor(ns.hackAnalyzeThreads(target, hackAmount)));
         } catch (e) { threads = 1; /* Avoid errors */ }
        requiredRam = scriptRamMap[action] * threads;
      }
      
      if (threads <= 0) {
          // log(`Calculated 0 threads for ${action} on ${target}. Skipping.`);
          continue;
      }

      // Allocate RAM from the total pool for this target
      // Prioritize prep tasks (Weaken/Grow) 
      let ramShare = 0;
      if (action === "hack-worker.js") {
          ramShare = totalAvailableRam * (1 - config.prepFocusFactor); // Allocate smaller share for hacking
      } else { 
          ramShare = totalAvailableRam * config.prepFocusFactor; // Allocate larger share for prep
          // Distribute prep RAM somewhat evenly among prepping targets?
          const preppingTargets = managedTargets.filter(t => !t.prepComplete).length || 1;
          ramShare /= preppingTargets; // Divide prep RAM share among prepping targets
      }
      
      const ramToAllocate = Math.min(requiredRam, ramShare, totalAvailableRam - ramAllocatedThisCycle); // Limit by needed, share, and remaining total
      const threadsToRun = Math.floor(ramToAllocate / scriptRamMap[action]);

      if (threadsToRun > 0) {
        targetInfo.assignedRam = ramToAllocate; // Track RAM assigned to this target
        ramAllocatedThisCycle += ramToAllocate; // Decrease overall available RAM for this cycle
        // log(`Allocating ${threadsToRun} threads (${ramToAllocate.toFixed(1)}GB RAM) for ${action} on ${target}`);
        
        // Distribute and execute workers
        await distributeAndRun(action, threadsToRun, target);
      } else {
        // log(`Not enough RAM to allocate any threads for ${action} on ${target}`);
      }
    }
  }

  async function distributeAndRun(script, totalThreads, target) {
    let threadsRemaining = totalThreads;
    const scriptRamCost = ns.getScriptRam(script);

    // Sort workers by available RAM (largest first) to fill big servers first
    workerServers.sort((a,b) => (b.maxRam - b.usedRam) - (a.maxRam - a.usedRam));

    for (const server of workerServers) {
        if (threadsRemaining <= 0) break;

        // Calculate *true* available RAM on this server for this allocation pass
        let currentUsedRam = 0;
        if (server.hostname === 'home') {
            // For home, 'maxRam' is already the calculated available space, 'usedRam' starts at 0 for this cycle
            currentUsedRam = server.usedRam; 
        } else {
             currentUsedRam = ns.getServerUsedRam(server.hostname);
        }
        const availableRamOnServer = server.maxRam - currentUsedRam;

        if (availableRamOnServer < scriptRamCost) continue; // Skip if can't run even 1 thread
        
        const threadsPossible = Math.floor(availableRamOnServer / scriptRamCost);
        const threadsToRun = Math.min(threadsRemaining, threadsPossible);
        
        if (threadsToRun <= 0) continue;
        
        // Ensure worker scripts are present (only copy if needed)
        for(const workerScript of config.workerScripts) {
            if (!ns.fileExists(workerScript, server.hostname)) {
                if (server.hostname === 'home') continue; // Don't scp to home from home
                const scpSuccess = await ns.scp(workerScript, server.hostname, "home");
                if (!scpSuccess) {
                   log(`Failed to scp ${workerScript} to ${server.hostname}`, "error");
                   continue; // Skip this server if scp failed
                }
            }
        }

        // Execute script
        const pid = ns.exec(script, server.hostname, threadsToRun, target);
        if (pid > 0) {
           // log(`Launched ${script} on ${server.hostname} with ${threadsToRun} threads for target ${target}.`);
           // Update the temporary usedRam state for *this cycle's allocation* on home server
           if (server.hostname === 'home') { 
               server.usedRam += threadsToRun * scriptRamCost; 
           }
           threadsRemaining -= threadsToRun;
        } else {
           log(`Failed to exec ${script} on ${server.hostname} with ${threadsToRun} threads for ${target}. RAM issue?`, "warn");
        }
    }

    if (threadsRemaining > 0) {
        log(`Could not allocate all required threads for ${script} on ${target}. ${threadsRemaining} remaining.`, "warn");
    }
  }
  
  function displayStatus() {
    ns.clearLog(); // Clear previous log entries
    ns.print("\n--- Hack Manager Status ---");
    ns.print(`Managing ${managedTargets.length}/${config.targetCount} targets. Cycle: ${config.cycleTime/1000}s`);
    ns.print(`Worker Servers: ${workerServers.filter(s => s.hostname !== 'home').length} purchased + home`);
    let totalMaxRam = workerServers.reduce((sum, s) => sum + s.maxRam, 0);
    let actualTotalUsedRam = 0;
    workerServers.forEach(s => actualTotalUsedRam += (s.hostname === 'home' ? ns.getServerUsedRam('home') : ns.getServerUsedRam(s.hostname)));
    // Calculate available RAM more accurately for display
    let totalAvailableRam = totalMaxRam - actualTotalUsedRam; 
    ns.print(`Total Worker RAM: ${(actualTotalUsedRam / 1024).toFixed(1)}TB Used / ${(totalMaxRam / 1024).toFixed(1)}TB Max (${(totalAvailableRam / 1024).toFixed(1)}TB Free)`);
    
    ns.print("\n--- Targets ---");
    managedTargets.sort((a,b) => {
        // Sort by prep status first (prepping targets first), then by max money
        if (!a.prepComplete && b.prepComplete) return -1;
        if (a.prepComplete && !b.prepComplete) return 1;
        return ns.getServerMaxMoney(b.hostname) - ns.getServerMaxMoney(a.hostname);
    }); 
    for (const targetInfo of managedTargets) {
        let server = null;
        try { server = ns.getServer(targetInfo.hostname); } catch { continue; }
        const money = server.moneyAvailable;
        const maxMoney = server.moneyMax;
        const security = server.hackDifficulty;
        const minSecurity = server.minDifficulty;
        const prep = targetInfo.prepComplete ? "READY" : "PREPPING"; // Changed label
        ns.print(` ${targetInfo.hostname.padEnd(18)} | $${formatMoney(money)}/$${formatMoney(maxMoney)} (${(money/maxMoney*100).toFixed(1)}%) | Sec ${security.toFixed(1)}/${minSecurity.toFixed(1)} | ${prep.padEnd(8)} | RAM: ${targetInfo.assignedRam.toFixed(1)}GB`);
    }
    ns.print("-------------------------------------------------------------------");
  }
  
  // --- Logging and Formatting Helpers (Duplicate from buy-servers, move to helpers.js later) ---
  function log(message, type = "info") {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = `[${timestamp}] [${type.toUpperCase()}]`;
    ns.print(`${prefix} ${message}`);
    if (type === "error" || type === "success" || type === "warn") {
      ns.tprint(`${prefix} ${message}`);
    }
  }

  function formatMoney(amount) {
      if (ns.nFormat) {
          return ns.nFormat(amount, '$0.00a');
      } else {
          const units = ['', 'k', 'm', 'b', 't', 'q'];
          let unitIndex = 0;
          while(amount >= 1000 && unitIndex < units.length - 1) {
              amount /= 1000;
              unitIndex++;
          }
          return `$${amount.toFixed(2)}${units[unitIndex]}`;
      }
  }
} 