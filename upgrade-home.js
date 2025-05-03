/** @param {NS} ns */
export async function main(ns) {
  // Check command line arguments
  const args = ns.flags([
    ["suppress-warnings", false]
  ]);
  
  // Configuration options
  const config = {
    keepMoney: 100000,         // How much money to keep in reserve (100k)
    prioritizeRam: true,       // Prioritize RAM upgrades over cores
    maxRamLevel: 30,           // Max RAM level to upgrade to (2^30 = 1GB * 2^30 = 1 billion GB)
    maxCores: 8,               // Max number of cores to upgrade to
    cycleSleepTime: 5000,      // Time to wait between upgrade checks (ms)
    buyTorRouter: true,        // Whether to buy TOR router
    buyPrograms: true,         // Whether to buy hacking programs through dark web
    logLevel: 1,               // 0=minimal, 1=normal, 2=verbose
    suppressWarnings: args["suppress-warnings"] // Whether to suppress Source File warnings
  };
  
  // Helper function to format money
  function formatMoney(amount) {
    const units = ['', 'k', 'm', 'b', 't', 'q'];
    let unitIndex = 0;
    
    while (amount >= 1000 && unitIndex < units.length - 1) {
      amount /= 1000;
      unitIndex++;
    }
    
    return `$${amount.toFixed(2)}${units[unitIndex]}`;
  }
  
  // Helper function for logging based on log level
  function log(message, level = 1) {
    if (level <= config.logLevel) {
      ns.print(message);
      if (level === 0) {
        ns.tprint(message);
      }
    }
  }
  
  // Function to safely call singularity functions and handle errors silently
  function safeSingularity(functionName, ...args) {
    try {
      return {
        success: true,
        result: ns.singularity[functionName](...args)
      };
    } catch (error) {
      if (!config.suppressWarnings && error.message.includes("Source-File 4")) {
        log(`Cannot use ${functionName}: Requires Source-File 4`, 2);
      }
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // Function to check if Singularity API is available
  function checkSingularityAccess() {
    try {
      // This method will throw an error if you don't have Source-File 4
      ns.singularity.getOwnedSourceFiles();
      return true;
    } catch (error) {
      return false;
    }
  }
  
  // Open a tail window
  ns.tail();
  ns.disableLog("ALL");
  
  // Display header
  ns.tprint("╔═════════════════════════════════════════╗");
  ns.tprint("║        HOME COMPUTER UPGRADER           ║");
  ns.tprint("║ Automatically upgrades RAM, cores & TOR ║");
  ns.tprint("╚═════════════════════════════════════════╝");
  
  // Check if Singularity functions are available (SF-4)
  const hasSingularityAccess = checkSingularityAccess();
  
  if (!hasSingularityAccess && !config.suppressWarnings) {
    ns.tprint("⚠️ WARNING: This script requires Source-File 4 to fully function.");
    ns.tprint("It will run in monitoring mode only until you obtain SF-4.");
    ns.tprint("The script will continue running but won't be able to perform upgrades.");
  }
  
  // Get initial stats - these are always available without Singularity
  let homeRam = ns.getServerMaxRam("home");
  let cores = ns.getServer("home").cpuCores;
  let hasTor = false;
  let upgradedSomething = false;
  
  // Try to safely get Tor status
  try {
    hasTor = ns.getPlayer().tor;
  } catch (error) {
    hasTor = false;
  }
  
  log(`Starting with ${homeRam}GB RAM and ${cores} cores`, 0);
  
  // Main upgrade loop
  while (true) {
    try {
      // Get current player money - always available
      const money = ns.getPlayer().money;
      const reserveMoney = Math.max(config.keepMoney, 100000); // Always keep at least 100k
      
      // Update current home specs - always available
      homeRam = ns.getServerMaxRam("home");
      cores = ns.getServer("home").cpuCores;
      
      // Try to safely get Tor status
      try {
        hasTor = ns.getPlayer().tor;
      } catch (error) {
        hasTor = false;
      }
      
      // Display status
      log(`Money: ${formatMoney(money)} | Home RAM: ${homeRam}GB | Cores: ${cores} | TOR: ${hasTor ? "Yes" : "No"}`, 1);
      
      // Skip upgrades if we don't have Singularity access
      if (!hasSingularityAccess) {
        log("Monitoring only mode - upgrade functions unavailable until SF-4 is obtained", 1);
        await ns.sleep(30000); // 30 seconds between checks when in monitor mode
        continue;
      }
      
      // Buy TOR router if we don't have it and can afford it
      if (config.buyTorRouter && !hasTor && money > 200000 + reserveMoney) {
        const result = safeSingularity("purchaseTor");
        if (result.success && result.result === true) {
          log(`SUCCESS: Purchased TOR router for $200,000`, 0);
          hasTor = true;
          upgradedSomething = true;
          continue; // Continue to next cycle to refresh money
        } else if (result.success && result.result === false) {
          log(`Failed to purchase TOR router`, 1);
        }
      }
      
      // Buy programs from darkweb if we have TOR
      if (config.buyPrograms && hasTor) {
        const programs = [
          { name: "BruteSSH.exe", cost: 500000 },
          { name: "FTPCrack.exe", cost: 1500000 },
          { name: "relaySMTP.exe", cost: 5000000 },
          { name: "HTTPWorm.exe", cost: 30000000 },
          { name: "SQLInject.exe", cost: 250000000 }
        ];
        
        for (const program of programs) {
          if (!ns.fileExists(program.name, "home") && money > program.cost + reserveMoney) {
            const result = safeSingularity("purchaseProgram", program.name);
            if (result.success && result.result === true) {
              log(`SUCCESS: Purchased ${program.name} for ${formatMoney(program.cost)}`, 0);
              upgradedSomething = true;
              break; // Only buy one program per cycle
            }
          }
        }
        
        // If we bought a program, continue to next cycle
        if (upgradedSomething) {
          upgradedSomething = false;
          continue;
        }
      }
      
      // Calculate costs using safe functions
      let ramUpgradeCost = Infinity;
      let coreUpgradeCost = Infinity;
      
      const ramCostResult = safeSingularity("getUpgradeHomeRamCost");
      if (ramCostResult.success) {
        ramUpgradeCost = ramCostResult.result;
      }
      
      const coreCostResult = safeSingularity("getUpgradeHomeCoresCost");
      if (coreCostResult.success) {
        coreUpgradeCost = coreCostResult.result;
      }
      
      // Check if we've hit the maximum values
      const ramMaxedOut = homeRam >= Math.pow(2, config.maxRamLevel);
      const coresMaxedOut = cores >= config.maxCores;
      
      // Early exit if everything is maxed out
      if (ramMaxedOut && coresMaxedOut) {
        log("Maximum RAM and cores reached. Nothing left to upgrade.", 0);
        log("Script will check again in 60 seconds in case settings change.", 1);
        await ns.sleep(60000); // Wait 60 seconds
        continue;
      }
      
      // Decide what to upgrade based on priority setting
      let upgradeRam = false;
      let upgradeCore = false;
      
      if (config.prioritizeRam) {
        // Prioritize RAM upgrades
        if (!ramMaxedOut && money > ramUpgradeCost + reserveMoney && ramUpgradeCost !== Infinity) {
          upgradeRam = true;
        } else if (!coresMaxedOut && money > coreUpgradeCost + reserveMoney && coreUpgradeCost !== Infinity) {
          upgradeCore = true;
        }
      } else {
        // Prioritize core upgrades
        if (!coresMaxedOut && money > coreUpgradeCost + reserveMoney && coreUpgradeCost !== Infinity) {
          upgradeCore = true;
        } else if (!ramMaxedOut && money > ramUpgradeCost + reserveMoney && ramUpgradeCost !== Infinity) {
          upgradeRam = true;
        }
      }
      
      // Perform the upgrade
      if (upgradeRam) {
        const oldRam = homeRam;
        const result = safeSingularity("upgradeHomeRam");
        if (result.success && result.result === true) {
          const newRam = ns.getServerMaxRam("home");
          log(`SUCCESS: Upgraded RAM from ${oldRam}GB to ${newRam}GB for ${formatMoney(ramUpgradeCost)}`, 0);
          upgradedSomething = true;
        } else if (result.success && result.result === false) {
          log(`ERROR: Failed to upgrade RAM`, 1);
        }
      } else if (upgradeCore) {
        const oldCores = cores;
        const result = safeSingularity("upgradeHomeCores");
        if (result.success && result.result === true) {
          const newCores = ns.getServer("home").cpuCores;
          log(`SUCCESS: Upgraded cores from ${oldCores} to ${newCores} for ${formatMoney(coreUpgradeCost)}`, 0);
          upgradedSomething = true;
        } else if (result.success && result.result === false) {
          log(`ERROR: Failed to upgrade cores`, 1);
        }
      } else {
        // Not enough money for any upgrades
        const nextUpgradeCost = Math.min(
          ramMaxedOut ? Infinity : ramUpgradeCost,
          coresMaxedOut ? Infinity : coreUpgradeCost
        );
        
        if (nextUpgradeCost !== Infinity) {
          log(`Need ${formatMoney(nextUpgradeCost)} for next upgrade (have ${formatMoney(money)})`, 1);
          log(`Waiting to accumulate more money...`, 2);
        }
      }
      
    } catch (error) {
      // Only log error if not suppressing warnings
      if (!config.suppressWarnings) {
        log(`ERROR: ${error}`, 1);
      }
    }
    
    // Wait before checking again
    await ns.sleep(config.cycleSleepTime);
  }
} 