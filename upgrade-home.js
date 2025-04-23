/** @param {NS} ns */
export async function main(ns) {
  // Configuration options
  const config = {
    keepMoney: 100000,         // How much money to keep in reserve (100k)
    prioritizeRam: true,       // Prioritize RAM upgrades over cores
    maxRamLevel: 30,           // Max RAM level to upgrade to (2^30 = 1GB * 2^30 = 1 billion GB)
    maxCores: 8,               // Max number of cores to upgrade to
    cycleSleepTime: 5000,      // Time to wait between upgrade checks (ms)
    buyTorRouter: true,        // Whether to buy TOR router
    buyPrograms: true,         // Whether to buy hacking programs through dark web
    logLevel: 1                // 0=minimal, 1=normal, 2=verbose
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
  
  // Open a tail window
  ns.tail();
  ns.disableLog("ALL");
  
  // Display header
  ns.tprint("╔═════════════════════════════════════════╗");
  ns.tprint("║        HOME COMPUTER UPGRADER           ║");
  ns.tprint("║ Automatically upgrades RAM, cores & TOR ║");
  ns.tprint("╚═════════════════════════════════════════╝");
  
  // Get initial stats
  let homeRam = ns.getServerMaxRam("home");
  let cores = ns.getServer("home").cpuCores;
  let hasTor = ns.getPlayer().tor;
  let upgradedSomething = false;
  
  log(`Starting with ${homeRam}GB RAM and ${cores} cores`, 0);
  
  // Main upgrade loop
  while (true) {
    try {
      // Get current player money
      const money = ns.getPlayer().money;
      const reserveMoney = Math.max(config.keepMoney, 100000); // Always keep at least 100k
      
      // Update current home specs
      homeRam = ns.getServerMaxRam("home");
      cores = ns.getServer("home").cpuCores;
      hasTor = ns.getPlayer().tor;
      
      // Display status
      log(`Money: ${formatMoney(money)} | Home RAM: ${homeRam}GB | Cores: ${cores} | TOR: ${hasTor ? "Yes" : "No"}`, 1);
      
      // Buy TOR router if we don't have it and can afford it
      if (config.buyTorRouter && !hasTor && money > 200000 + reserveMoney) {
        if (ns.singularity.purchaseTor()) {
          log(`SUCCESS: Purchased TOR router for $200,000`, 0);
          hasTor = true;
          upgradedSomething = true;
          continue; // Continue to next cycle to refresh money
        } else {
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
            if (ns.singularity.purchaseProgram(program.name)) {
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
      
      // Calculate costs
      const ramUpgradeCost = ns.singularity.getUpgradeHomeRamCost();
      const coreUpgradeCost = ns.singularity.getUpgradeHomeCoresCost();
      
      // Decide what to upgrade based on priority setting
      let upgradeRam = false;
      let upgradeCore = false;
      
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
      
      // Decide what to buy
      if (config.prioritizeRam) {
        // Prioritize RAM upgrades
        if (!ramMaxedOut && money > ramUpgradeCost + reserveMoney) {
          upgradeRam = true;
        } else if (!coresMaxedOut && money > coreUpgradeCost + reserveMoney) {
          upgradeCore = true;
        }
      } else {
        // Prioritize core upgrades
        if (!coresMaxedOut && money > coreUpgradeCost + reserveMoney) {
          upgradeCore = true;
        } else if (!ramMaxedOut && money > ramUpgradeCost + reserveMoney) {
          upgradeRam = true;
        }
      }
      
      // Perform the upgrade
      if (upgradeRam) {
        const oldRam = homeRam;
        if (ns.singularity.upgradeHomeRam()) {
          const newRam = ns.getServerMaxRam("home");
          log(`SUCCESS: Upgraded RAM from ${oldRam}GB to ${newRam}GB for ${formatMoney(ramUpgradeCost)}`, 0);
          upgradedSomething = true;
        } else {
          log(`ERROR: Failed to upgrade RAM`, 1);
        }
      } else if (upgradeCore) {
        const oldCores = cores;
        if (ns.singularity.upgradeHomeCores()) {
          const newCores = ns.getServer("home").cpuCores;
          log(`SUCCESS: Upgraded cores from ${oldCores} to ${newCores} for ${formatMoney(coreUpgradeCost)}`, 0);
          upgradedSomething = true;
        } else {
          log(`ERROR: Failed to upgrade cores`, 1);
        }
      } else {
        // Not enough money for any upgrades
        const nextUpgradeCost = Math.min(
          ramMaxedOut ? Infinity : ramUpgradeCost,
          coresMaxedOut ? Infinity : coreUpgradeCost
        );
        log(`Need ${formatMoney(nextUpgradeCost)} for next upgrade (have ${formatMoney(money)})`, 1);
        log(`Waiting to accumulate more money...`, 2);
      }
      
    } catch (error) {
      log(`ERROR: ${error}`, 0);
    }
    
    // Wait before checking again
    await ns.sleep(config.cycleSleepTime);
  }
} 