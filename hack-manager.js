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
      const homeMaxRam = ns.getServerMaxRam("home");
      // Only add home if it has more RAM than the reserve
      if (homeMaxRam > config.reserveHomeRam) { 
         // Store actual max and used RAM for home
         workerServers.push({ hostname: "home", maxRam: homeMaxRam, usedRam: ns.getServerUsedRam("home")}); 
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
    // Check for NUKE.exe first
    if (!ns.fileExists("NUKE.exe", "home")) {
      log("NUKE.exe not found on home. Cannot gain root access.", "warn");
      return false;
    }

    let openPorts = 0;
    let toolsAvailable = 0;
    const portTools = Object.keys(config.ports); // Get tool names
    
    log(`Attempting to open ports on ${target}...`, 2); // Verbose log level 2
    for (const program of portTools) {
        if (ns.fileExists(program, "home")) {
            toolsAvailable++;
            try {
                // Call the corresponding function (e.g., ns.brutessh(target))
                config.ports[program](target); 
                openPorts++;
                log(`Used ${program} successfully on ${target}.`, 2);
            } catch(e) {
                 log(`Failed to use ${program} on ${target}: ${e}`, 2);
            } 
        } else {
            // log(`Port opener ${program} not found on home.`, 2); // Might be too noisy
        }
    }
    // Make this summary log visible at normal log level
    log(`Tools found: ${toolsAvailable}/${portTools.length}. Ports opened: ${openPorts} on ${target}.`, 1); 

    try {
      const requiredPorts = ns.getServerNumPortsRequired(target);
      if (openPorts >= requiredPorts) {
        log(`Sufficient ports opened (${openPorts}/${requiredPorts}). Attempting nuke...`, 2);
        ns.nuke(target);
        log(`Nuked ${target}!`, "success");
        return true;
      } else {
        // Include tool count in the failure message
        log(`Cannot nuke ${target}. Need ${requiredPorts} ports, have ${openPorts} open (using ${toolsAvailable} tools).`, 1); 
      }
    } catch (e) {
       log(`Nuke failed for ${target}: ${e}`, "error");
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
    // Recalculate total available RAM accurately each time, considering home reserve
    let totalAvailableRam = 0;
    workerServers.forEach(s => {
        const currentUsedRam = ns.getServerUsedRam(s.hostname); // Get fresh used RAM
        s.usedRam = currentUsedRam; // Update state for sorting later
        let available = 0;
        if (s.hostname === 'home') {
            available = Math.max(0, s.maxRam - currentUsedRam - config.reserveHomeRam);
        } else {
            available = s.maxRam - currentUsedRam;
        }
        totalAvailableRam += available;
    });

    if (totalAvailableRam <= 0) {
        // log("No worker RAM available.", "warn"); // Keep this less noisy maybe
        return;
    }

    // Reset assigned RAM for targets
    managedTargets.forEach(t => t.assignedRam = 0);
    let ramAllocatedThisCycle = 0;
    // Temporary detailed logging
    // log(`Starting allocation cycle. Total Available RAM: ${totalAvailableRam.toFixed(1)}GB`);

    for (const targetInfo of managedTargets) {
      const target = targetInfo.hostname;
      let server = null; 
      try { server = ns.getServer(target); } catch { continue; } // Skip if server somehow invalid
      
      const moneyAvail = server.moneyAvailable;
      const moneyMax = server.moneyMax;
      const secLevel = server.hackDifficulty;
      const minSec = server.minDifficulty;

      const needsWeaken = secLevel > minSec + config.securityThresholdPadding;
      const needsGrow = moneyAvail < moneyMax * 0.95; // Grow if below 95% (slightly more aggressive)
      
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
        const securityDeficit = secLevel - minSec;
        threads = Math.max(1, Math.ceil(securityDeficit / ns.weakenAnalyze(1))); 
        requiredRam = scriptRamMap[action] * threads;
      } else if (needsGrow) {
        action = "grow-worker.js";
        const growMultiplier = Math.max(1.01, moneyMax / Math.max(moneyAvail, 1)); 
        try { 
            threads = Math.max(1, Math.ceil(ns.growthAnalyze(target, growMultiplier)));
        } catch (e) { threads = 1; }
        requiredRam = scriptRamMap[action] * threads;
      } else { // Ready to hack
        action = "hack-worker.js";
        const hackAmount = moneyMax * config.moneyPercentToHack;
         try {
            threads = Math.max(1, Math.floor(ns.hackAnalyzeThreads(target, hackAmount)));
         } catch (e) { threads = 1; }
        requiredRam = scriptRamMap[action] * threads;
      }
      
      if (threads <= 0 || requiredRam <= 0) {
          log(`Calculated 0 threads or RAM for ${action} on ${target}. Skipping.`); // More explicit log
          continue;
      }

      // Determine RAM to allocate for this specific action/target
      const remainingRamInPool = totalAvailableRam - ramAllocatedThisCycle;
      if (remainingRamInPool <= 0) continue; // No more RAM left in the pool for this cycle

      // Conceptual allocation based on focus factor - how much of the *remaining pool* are we willing to give?
      let poolShareLimit = remainingRamInPool; // Default: use whatever is left
      if (action === "hack-worker.js") {
          // Limit hacking allocation if prepping is still needed elsewhere (use less of the pool)
          const isAnyTargetPrepping = managedTargets.some(t => !t.prepComplete);
          if (isAnyTargetPrepping) {
             poolShareLimit = remainingRamInPool * (1 - config.prepFocusFactor); 
          }
      } else {
          // For prep tasks, allow using a larger portion of the remaining pool
           poolShareLimit = remainingRamInPool * config.prepFocusFactor; 
          // Optional: Could further divide poolShareLimit by remaining prepping targets if desired
          // const remainingPreppingTargets = managedTargets.filter(t => !t.prepComplete && t.assignedRam === 0).length || 1;
          // poolShareLimit /= remainingPreppingTargets;
      }

      // Allocate the minimum of: required RAM, the calculated share limit, and what's actually left
      const ramToAllocate = Math.min(requiredRam, poolShareLimit, remainingRamInPool);
      const threadsToRun = Math.floor(ramToAllocate / scriptRamMap[action]);
      
      // Temporary detailed logging
      // log(`Target: ${target} | Action: ${action} | Needs: ${requiredRam.toFixed(1)}GB (${threads} threads) | PoolShare: ${poolShareLimit.toFixed(1)}GB | Allocating: ${ramToAllocate.toFixed(1)}GB (${threadsToRun} threads) | Pool Remaining: ${remainingRamInPool.toFixed(1)}GB`);

      if (threadsToRun > 0 && ramToAllocate > 0) {
        targetInfo.assignedRam = ramToAllocate; // Track RAM assigned to this target
        ramAllocatedThisCycle += ramToAllocate; // Decrease overall available RAM for this cycle
        // log(`ALLOCATING ${threadsToRun} threads (${ramToAllocate.toFixed(1)}GB RAM) for ${action} on ${target}`);
        
        // Distribute and execute workers
        await distributeAndRun(action, threadsToRun, target);
      } else {
        // log(`Could not run threads for ${action} on ${target}. RAM Need: ${requiredRam.toFixed(1)}GB, Pool Share Limit: ${poolShareLimit.toFixed(1)}GB, Pool Remaining: ${remainingRamInPool.toFixed(1)}GB, Calculated Threads: ${threadsToRun}`);
      }
    }
     // log(`Finished allocation cycle. Total RAM allocated: ${ramAllocatedThisCycle.toFixed(1)}GB`);
  }

  async function distributeAndRun(script, totalThreads, target) {
    let threadsRemaining = totalThreads;
    const scriptRamCost = ns.getScriptRam(script);

    // Sort workers by available RAM (largest first) - recalculate available RAM accurately here
    workerServers.forEach(s => {
        const currentUsedRam = ns.getServerUsedRam(s.hostname); // Fresh RAM usage
        if (s.hostname === 'home') {
            s.availableRam = Math.max(0, s.maxRam - currentUsedRam - config.reserveHomeRam);
        } else {
            s.availableRam = s.maxRam - currentUsedRam;
        }
    });
    workerServers.sort((a, b) => b.availableRam - a.availableRam);

    for (const server of workerServers) {
        if (threadsRemaining <= 0) break;

        const availableRamOnServer = server.availableRam; // Use the pre-calculated available RAM for sorting

        if (availableRamOnServer < scriptRamCost) continue; // Skip if can't run even 1 thread
        
        const threadsPossible = Math.floor(availableRamOnServer / scriptRamCost);
        const threadsToRun = Math.min(threadsRemaining, threadsPossible);
        
        if (threadsToRun <= 0) continue;
        
        // Ensure worker scripts are present (only copy if needed)
        // This check can be moved outside the loop if scripts are guaranteed copied once
        let scriptsCopied = true; 
        if (server.hostname !== 'home') { // Don't scp to home from home
             for(const workerScript of config.workerScripts) {
                if (!ns.fileExists(workerScript, server.hostname)) {
                    const scpSuccess = await ns.scp(workerScript, server.hostname, "home");
                    if (!scpSuccess) {
                       log(`Failed to scp ${workerScript} to ${server.hostname}`, "error");
                       scriptsCopied = false;
                       break; // Stop trying to copy other scripts if one fails
                    }
                }
            }
        }
        
        if (!scriptsCopied) continue; // Skip this server if scp failed

        // Execute script
        const pid = ns.exec(script, server.hostname, threadsToRun, target);
        if (pid > 0) {
           // log(`Launched ${script} on ${server.hostname} (${threadsToRun} threads) for ${target}.`);
           threadsRemaining -= threadsToRun;
           // Update availableRam *immediately* for the next iteration within this function
           server.availableRam -= threadsToRun * scriptRamCost; 
           // No need to update server.usedRam here as ns.getServerUsedRam will fetch it next cycle
        } else {
           log(`Failed to exec ${script} on ${server.hostname} (${threadsToRun} threads/${(threadsToRun*scriptRamCost).toFixed(1)}GB) for ${target}. RAM Available: ${availableRamOnServer.toFixed(1)}GB`, "warn");
        }
    }
  }
  
  function displayStatus() {
    ns.clearLog(); // Clear previous log entries
    ns.print("\n--- Hack Manager Status ---");
    ns.print(`Managing ${managedTargets.length}/${config.targetCount} targets. Cycle: ${config.cycleTime/1000}s`);
    const purchasedServers = workerServers.filter(s => s.hostname !== 'home');
    const homeWorkerEntry = workerServers.find(s => s.hostname === 'home');
    ns.print(`Worker Servers: ${purchasedServers.length} purchased + ${homeWorkerEntry ? 'home' : 'home (not used)'}`);

    // Calculate True Total Max RAM
    let trueTotalMaxRam = purchasedServers.reduce((sum, s) => sum + ns.getServerMaxRam(s.hostname), 0); // Max RAM from purchased
    if (homeWorkerEntry) { 
        trueTotalMaxRam += ns.getServerMaxRam('home'); // Add home's actual max RAM
    }

    // Calculate Actual Used RAM
    let actualTotalUsedRam = purchasedServers.reduce((sum, s) => sum + ns.getServerUsedRam(s.hostname), 0); // Used RAM on purchased
    let homeUsedRam = 0;
    if (homeWorkerEntry) { 
        homeUsedRam = ns.getServerUsedRam('home');
        actualTotalUsedRam += homeUsedRam; // Add home's used RAM
    }

    // Calculate True Free RAM
    let trueTotalFreeRam = trueTotalMaxRam - actualTotalUsedRam;
    // Also consider home reserve for a more accurate 'hackable free' RAM count
    let freeRamForHacking = purchasedServers.reduce((sum, s) => sum + (ns.getServerMaxRam(s.hostname) - ns.getServerUsedRam(s.hostname)), 0);
    if (homeWorkerEntry) {
         freeRamForHacking += Math.max(0, ns.getServerMaxRam('home') - ns.getServerUsedRam('home') - config.reserveHomeRam);
    }

    ns.print(`Total Worker RAM: ${(actualTotalUsedRam / 1024).toFixed(1)}TB Used / ${(trueTotalMaxRam / 1024).toFixed(1)}TB Max | Available for Hacking: ${(freeRamForHacking / 1024).toFixed(1)}TB`);
    
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