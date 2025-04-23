/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  
  // Configuration - RAM Management
  const config = {
    reservedRam: 8,           // GB of RAM to reserve for other scripts
    minRamForTools: 2,        // Minimum RAM needed to run utility scripts
    safetyMargin: 2,          // Additional safety margin in GB
    cycleSleepTime: 10000,    // Time to sleep between cycles (ms)
    earlyGame: true,          // Set to true for early game (disables late-game features)
    enabledTools: {
      // Only enable scripts that are available early game
      hacknetManager: true,
      hacking: true,          // Basic hacking scripts
      stockMarket: false,     // Requires 5b to buy TIX API access
      gangManager: false,     // Late-game feature
      bladeburner: false,     // Requires Source-File 6 or 7
      sleeve: false           // Requires Bitnode 10
    }
  };
  
  // Prevent running multiple instances
  if (ns.getRunningScript().pid !== ns.pid) {
    ns.tprint("ERROR: daemon-early.js is already running! Exiting...");
    return;
  }
  
  ns.tprint("╔══════════════════════════════════════╗");
  ns.tprint("║         EARLY GAME DAEMON STARTED     ║");
  ns.tprint("║    Basic automation for new players   ║");
  ns.tprint("╚══════════════════════════════════════╝");
  
  // Kill any other scripts that might be running
  ns.tprint("Killing any interfering scripts...");
  if (ns.isRunning("daemon.js")) {
    ns.tprint("Stopping daemon.js...");
    ns.kill("daemon.js");
  }
  if (ns.isRunning("daemon-lite.js")) {
    ns.tprint("Stopping daemon-lite.js...");
    ns.kill("daemon-lite.js");
  }
  if (ns.isRunning("stockmaster.js")) {
    ns.tprint("Stopping stockmaster.js...");
    ns.kill("stockmaster.js");
  }
  
  // Wait a moment for scripts to terminate
  await ns.sleep(500);
  
  // RAM Management
  function getAvailableRam() {
    const homeRam = ns.getServerMaxRam("home");
    const usedRam = ns.getServerUsedRam("home");
    const available = homeRam - usedRam - config.reservedRam;
    return Math.max(0, available);
  }
  
  // Basic server scanning function
  function scanServers() {
    const servers = [];
    const visited = new Set();
    const stack = ["home"];
    
    while (stack.length > 0) {
      const server = stack.pop();
      if (!visited.has(server)) {
        visited.add(server);
        
        // Skip home and purchased servers
        if (server !== "home" && !server.startsWith("pserv")) {
          servers.push(server);
        }
        
        const connections = ns.scan(server);
        for (const connection of connections) {
          if (!visited.has(connection)) {
            stack.push(connection);
          }
        }
      }
    }
    
    return servers;
  }
  
  // Function to hack a server
  async function hackServer(target) {
    try {
      // Skip if we don't have enough hacking skill
      const hackingLevel = ns.getHackingLevel();
      const serverLevel = ns.getServerRequiredHackingLevel(target);
      
      if (hackingLevel < serverLevel) {
        return false;
      }
      
      // Open ports and nuke if needed
      if (!ns.hasRootAccess(target)) {
        let openPorts = 0;
        
        if (ns.fileExists("BruteSSH.exe", "home")) {
          ns.brutessh(target);
          openPorts++;
        }
        
        if (ns.fileExists("FTPCrack.exe", "home")) {
          ns.ftpcrack(target);
          openPorts++;
        }
        
        if (ns.fileExists("relaySMTP.exe", "home")) {
          ns.relaysmtp(target);
          openPorts++;
        }
        
        if (ns.fileExists("HTTPWorm.exe", "home")) {
          ns.httpworm(target);
          openPorts++;
        }
        
        if (ns.fileExists("SQLInject.exe", "home")) {
          ns.sqlinject(target);
          openPorts++;
        }
        
        // Check if we can nuke
        if (openPorts >= ns.getServerNumPortsRequired(target)) {
          ns.nuke(target);
          ns.tprint(`NUKED: ${target}`);
          return true;
        } else {
          return false;
        }
      }
      
      return true;
    } catch (error) {
      ns.print(`ERROR hacking ${target}: ${error}`);
      return false;
    }
  }
  
  // Setup basic income
  async function setupHacking() {
    try {
      // Get all available servers
      const servers = scanServers();
      
      // Try to hack each server
      for (const server of servers) {
        const success = await hackServer(server);
        
        // If we were able to hack it, run simple hack script
        if (success) {
          // Make sure we have the basic hack script
          if (!ns.fileExists("Remote/share.js")) {
            // Create a simple share script if it doesn't exist
            const shareScript = `
/** @param {NS} ns */
export async function main(ns) {
  // Share computing power
  while (true) {
    await ns.share();
    await ns.sleep(10000);
  }
}`;
            ns.mkdir("Remote");
            ns.write("Remote/share.js", shareScript, "w");
          }
          
          // Calculate how many threads we can use
          const scriptRam = ns.getScriptRam("Remote/share.js");
          const serverRam = ns.getServerMaxRam(server);
          
          if (serverRam > 0) {
            const threads = Math.floor(serverRam / scriptRam);
            
            if (threads > 0) {
              // Kill existing scripts
              ns.killall(server);
              
              // Copy and run script
              await ns.scp("Remote/share.js", server);
              ns.exec("Remote/share.js", server, threads);
              ns.print(`Started share.js on ${server} with ${threads} threads`);
            }
          }
        }
      }
    } catch (error) {
      ns.print(`ERROR in setupHacking: ${error}`);
    }
  }
  
  // Main loop
  while (true) {
    try {
      // Get available RAM
      const availableRam = getAvailableRam();
      
      // Display status
      ns.print(`Current cycle - Available RAM: ${availableRam.toFixed(1)} GB`);
      
      // Run hacking setup
      if (config.enabledTools.hacking) {
        await setupHacking();
      }
      
      // Run critical processes if we have enough RAM
      if (availableRam >= config.minRamForTools + config.safetyMargin) {
        // Priority 1: Run hacknet manager
        if (config.enabledTools.hacknetManager) {
          const scriptRam = ns.getScriptRam("hacknet-upgrade-manager.js");
          if (availableRam >= scriptRam) {
            if (!ns.isRunning("hacknet-upgrade-manager.js")) {
              ns.run("hacknet-upgrade-manager.js", 1);
              ns.print("Started hacknet-upgrade-manager.js");
            }
            await ns.sleep(500);
          }
        }
        
        // Only run the stock market script if it's enabled and not already running
        if (config.enabledTools.stockMarket) {
          const scriptRam = ns.getScriptRam("stockmaster.js");
          if (availableRam >= scriptRam && !ns.isRunning("stockmaster.js")) {
            ns.run("stockmaster.js", 1);
            ns.print("Started stockmaster.js");
            await ns.sleep(500);
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