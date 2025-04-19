/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  
  // Configuration - RAM Management
  const config = {
    reservedRam: 8,           // GB of RAM to reserve for other scripts
    minRamForTools: 2,        // Minimum RAM needed to run utility scripts
    safetyMargin: 2,          // Additional safety margin in GB
    cycleSleepTime: 10000,    // Time to sleep between cycles (ms)
    enabledTools: {
      // Set to false to disable specific tools that use too much RAM
      contractor: false,      // Disable contractor.js initially (enable when you have more RAM)
      hacknetManager: true,
      stockMarket: true,
      gangManager: true,
      bladeburner: true,
      sleeve: true
    }
  };
  
  ns.tprint("╔══════════════════════════════════════╗");
  ns.tprint("║          DAEMON LITE STARTED          ║");
  ns.tprint("║ Low-RAM version of the daemon script  ║");
  ns.tprint("╚══════════════════════════════════════╝");
  
  // RAM Management
  function getAvailableRam() {
    const homeRam = ns.getServerMaxRam("home");
    const usedRam = ns.getServerUsedRam("home");
    const available = homeRam - usedRam - config.reservedRam;
    return Math.max(0, available);
  }
  
  // Main loop
  while (true) {
    try {
      // Get available RAM
      const availableRam = getAvailableRam();
      
      // Display status
      ns.print(`Current cycle - Available RAM: ${availableRam.toFixed(1)} GB`);
      
      // Run critical processes if we have enough RAM
      if (availableRam >= config.minRamForTools + config.safetyMargin) {
        // Priority 1: Run money-making scripts
        if (config.enabledTools.hacknetManager) {
          const scriptRam = ns.getScriptRam("hacknet-upgrade-manager.js");
          if (availableRam >= scriptRam) {
            ns.run("hacknet-upgrade-manager.js", 1);
            await ns.sleep(500);
          }
        }
        
        // Priority 2: Run stock market scripts if enabled
        if (config.enabledTools.stockMarket) {
          const scriptRam = ns.getScriptRam("stockmaster.js");
          if (availableRam >= scriptRam) {
            ns.run("stockmaster.js", 1);
            await ns.sleep(500);
          }
        }
        
        // Priority 3: Run gang management if enabled
        if (config.enabledTools.gangManager) {
          const scriptRam = ns.getScriptRam("gangs.js");
          if (availableRam >= scriptRam) {
            ns.run("gangs.js", 1);
            await ns.sleep(500);
          }
        }
        
        // Priority 4: Run sleeve management if enabled
        if (config.enabledTools.sleeve) {
          const scriptRam = ns.getScriptRam("sleeve.js");
          if (availableRam >= scriptRam) {
            ns.run("sleeve.js", 1);
            await ns.sleep(500);
          }
        }
        
        // Priority 5: Run Bladeburner scripts if enabled
        if (config.enabledTools.bladeburner) {
          const scriptRam = ns.getScriptRam("bladeburner.js");
          if (availableRam >= scriptRam) {
            ns.run("bladeburner.js", 1);
            await ns.sleep(500);
          }
        }
        
        // Priority 6: Run contract solver if enabled (high RAM usage)
        if (config.enabledTools.contractor) {
          const scriptRam = ns.getScriptRam("Tasks/contractor.js");
          if (availableRam >= scriptRam) {
            ns.run("Tasks/contractor.js", 1);
            await ns.sleep(500);
          } else {
            ns.print(`Not enough RAM for contractor.js (needs ${scriptRam} GB)`);
          }
        }
      } else {
        ns.print(`Insufficient RAM to run tools (have ${availableRam.toFixed(1)} GB, need ${config.minRamForTools + config.safetyMargin} GB)`);
      }
    } catch (error) {
      ns.print(`ERROR in daemon cycle: ${error}`);
    }
    
    // Sleep until the next cycle
    await ns.sleep(config.cycleSleepTime);
  }
} 