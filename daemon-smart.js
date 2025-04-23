/** @param {NS} ns */
export async function main(ns) {
  // Configuration - RAM Management
  const config = {
    reservedRam: 8,           // GB of RAM to reserve for other scripts
    minRamForTools: 2,        // Minimum RAM needed to run utility scripts
    safetyMargin: 2,          // Additional safety margin in GB
    cycleSleepTime: 10000,    // Time to sleep between cycles (ms)
    earlyGame: true,          // Set to true for early game (disables late-game features)
    processManagement: true,  // Actively manage processes to prevent duplicates
    scriptConfig: {
      // Define what scripts to run and their properties
      "hacknet-pro.js": {
        enabled: true,
        singleton: true,     // Only allow one instance
        ramCheck: true,      // Check available RAM before running
        priority: 1,         // Higher priority runs first (1 is highest)
        tail: true,          // Whether to open a tail window
        args: []             // Arguments to pass to the script
      },
      "hacknet-upgrade-manager.js": {
        enabled: false,      // Disabled as hacknet-pro.js is the preferred script
        singleton: true,
        ramCheck: true,
        priority: 1,
        tail: false,
        args: []
      },
      "upgrade-home.js": {
        enabled: true,
        singleton: true,
        ramCheck: true,
        priority: 2,
        tail: true,
        args: []
      },
      "daemon.js": {
        enabled: false,       // Disabled by default
        singleton: true,
        ramCheck: true,
        priority: 10,         // Low priority
        tail: false,
        args: []
      },
      "stockmaster.js": {
        enabled: false,       // Disable until we have TIX API
        singleton: true,
        ramCheck: true,
        priority: 3,
        tail: true,
        args: []
      },
      "sleeve.js": {
        enabled: false,      // Requires BN10
        singleton: true,
        ramCheck: true,
        priority: 5,
        tail: false,
        args: []
      },
      "bladeburner.js": {
        enabled: false,      // Requires SF6/SF7
        singleton: true,
        ramCheck: true,
        priority: 5,
        tail: false,
        args: []
      }
    }
  };
  
  // Prevent running multiple instances
  if (ns.isRunning("daemon-smart.js", "home") && ns.getRunningScript().pid !== ns.pid) {
    ns.tprint("ERROR: daemon-smart.js is already running! Exiting...");
    return;
  }
  
  ns.disableLog("ALL");
  ns.tail(); // Open a tail window for this script
  
  // Display header
  ns.tprint("╔══════════════════════════════════════════╗");
  ns.tprint("║          SMART DAEMON STARTED            ║");
  ns.tprint("║  Intelligent script and process manager  ║");
  ns.tprint("╚══════════════════════════════════════════╝");
  
  // Kill conflicting processes at startup
  ns.print("Killing potentially conflicting processes...");
  const conflictingScripts = ["daemon.js", "daemon-lite.js", "daemon-early.js"];
  for (const script of conflictingScripts) {
    if (ns.isRunning(script, "home") && script !== ns.getScriptName()) {
      ns.print(`Killing ${script}...`);
      ns.kill(script, "home");
    }
  }
  
  // Kill any running hacknet manager scripts to avoid conflicts
  const hacknetScripts = ["hacknet-upgrade-manager.js"];
  for (const script of hacknetScripts) {
    if (ns.isRunning(script, "home")) {
      ns.print(`Killing ${script} to prevent conflicts with hacknet-pro.js...`);
      ns.kill(script, "home");
    }
  }
  
  // Wait for processes to terminate
  await ns.sleep(500);
  
  // Track running processes to avoid spawning duplicates
  const runningProcesses = new Map();
  
  // RAM Management
  function getAvailableRam() {
    const homeRam = ns.getServerMaxRam("home");
    const usedRam = ns.getServerUsedRam("home");
    const available = homeRam - usedRam - config.reservedRam;
    return Math.max(0, available);
  }
  
  // Script Management - Process tracking and PID validation
  function isScriptRunning(scriptName) {
    // Get all running processes on home
    const processes = ns.ps("home");
    
    // Check if script is in our tracking map
    if (runningProcesses.has(scriptName)) {
      const pid = runningProcesses.get(scriptName).pid;
      
      // Verify if the process with this PID still exists
      const matchingProcess = processes.find(p => p.filename === scriptName && p.pid === pid);
      if (matchingProcess) {
        return true;
      }
      
      // If we don't find it by PID, check if there's another instance running
      const anyInstanceRunning = processes.some(p => p.filename === scriptName);
      if (anyInstanceRunning) {
        // Update our tracking with the first instance we find
        const newPid = processes.find(p => p.filename === scriptName).pid;
        runningProcesses.set(scriptName, {
          pid: newPid,
          startTime: Date.now() // Reset start time
        });
        return true;
      }
      
      // No instances running, remove from tracking
      runningProcesses.delete(scriptName);
      return false;
    }
    
    // Not in our map, check if it's running at all
    const isRunning = processes.some(p => p.filename === scriptName);
    
    // If it's running but not in our map, add it to our tracking
    if (isRunning) {
      const pid = processes.find(p => p.filename === scriptName).pid;
      runningProcesses.set(scriptName, {
        pid: pid,
        startTime: Date.now()
      });
    }
    
    return isRunning;
  }
  
  function getScriptRamCost(scriptName) {
    return ns.getScriptRam(scriptName, "home");
  }
  
  // Start a script if it's not already running
  async function startScript(scriptName, scriptConfig) {
    // Check if the script should be run
    if (!scriptConfig.enabled) {
      return false;
    }
    
    // Check if it's a singleton and already running
    if (scriptConfig.singleton && isScriptRunning(scriptName)) {
      ns.print(`${scriptName} is already running, skipping (singleton mode)`);
      return false;
    }
    
    // Special validation for scripts with known startup checks
    if (scriptName === "stockmaster.js" && !ns.stock.hasWSEAccount()) {
      ns.print(`${scriptName} requires WSE Account, skipping`);
      return false;
    }
    
    if (scriptName === "sleeve.js") {
      try {
        const numSleeves = ns.sleeve.getNumSleeves();
        if (numSleeves <= 0) {
          ns.print(`${scriptName} requires sleeves from BN10, skipping`);
          return false;
        }
      } catch {
        ns.print(`${scriptName} requires sleeves from BN10, skipping`);
        return false;
      }
    }
    
    if (scriptName === "bladeburner.js") {
      try {
        const hasBladeburner = ns.bladeburner.inBladeburner();
        if (!hasBladeburner) {
          ns.print(`${scriptName} requires SF6/SF7 and joining Bladeburners, skipping`);
          return false;
        }
      } catch {
        ns.print(`${scriptName} requires SF6/SF7, skipping`);
        return false;
      }
    }
    
    // Check RAM requirements
    const scriptRam = getScriptRamCost(scriptName);
    const availableRam = getAvailableRam();
    
    if (scriptConfig.ramCheck && scriptRam > availableRam) {
      ns.print(`Not enough RAM to run ${scriptName} (needs ${scriptRam.toFixed(1)}GB, have ${availableRam.toFixed(1)}GB)`);
      return false;
    }
    
    // Run the script
    try {
      const pid = ns.run(scriptName, 1, ...scriptConfig.args);
      
      if (pid > 0) {
        ns.print(`Started ${scriptName} (PID: ${pid})`);
        // Update our tracking with the new process
        runningProcesses.set(scriptName, {
          pid: pid,
          startTime: Date.now()
        });
        
        // Open tail window if configured
        if (scriptConfig.tail) {
          ns.tail(scriptName);
        }
        
        return true;
      } else {
        ns.print(`Failed to start ${scriptName}`);
        return false;
      }
    } catch (error) {
      ns.print(`Error starting ${scriptName}: ${error}`);
      return false;
    }
  }
  
  // Stop a script if it's running
  function stopScript(scriptName) {
    // First check our tracking map
    if (runningProcesses.has(scriptName)) {
      const pid = runningProcesses.get(scriptName).pid;
      try {
        if (ns.kill(pid)) {
          runningProcesses.delete(scriptName);
          ns.print(`Stopped ${scriptName} (PID: ${pid})`);
          return true;
        }
      } catch (e) {
        // PID might be invalid, try killing by name
      }
    }
    
    // Fall back to killing by name
    if (ns.isRunning(scriptName, "home")) {
      ns.kill(scriptName, "home");
      runningProcesses.delete(scriptName);
      ns.print(`Stopped ${scriptName}`);
      return true;
    }
    
    return false;
  }
  
  // Display system status
  function displayStatus() {
    const homeRam = ns.getServerMaxRam("home");
    const usedRam = ns.getServerUsedRam("home");
    const availableRam = getAvailableRam();
    const money = ns.getPlayer().money;
    
    // Format money
    function formatMoney(amount) {
      const units = ['', 'k', 'm', 'b', 't', 'q'];
      let unitIndex = 0;
      
      while (amount >= 1000 && unitIndex < units.length - 1) {
        amount /= 1000;
        unitIndex++;
      }
      
      return `$${amount.toFixed(2)}${units[unitIndex]}`;
    }
    
    ns.print("╔══════════════════════════════════════════╗");
    ns.print("║              SYSTEM STATUS               ║");
    ns.print("╠══════════════════════════════════════════╣");
    ns.print(`║ Money: ${formatMoney(money).padStart(29)} ║`);
    ns.print(`║ Total RAM: ${homeRam.toString().padStart(24)}GB ║`);
    ns.print(`║ Used RAM: ${usedRam.toFixed(1).padStart(25)}GB ║`);
    ns.print(`║ Available RAM: ${availableRam.toFixed(1).padStart(20)}GB ║`);
    ns.print("╠══════════════════════════════════════════╣");
    ns.print("║            MANAGED PROCESSES             ║");
    ns.print("╠════════════════════╦═════════╦═══════════╣");
    ns.print("║       SCRIPT       ║ STATUS  ║ RAM USAGE ║");
    ns.print("╠════════════════════╬═════════╬═══════════╣");
    
    // Get all configured scripts
    const scripts = Object.entries(config.scriptConfig)
      .sort(([, configA], [, configB]) => configA.priority - configB.priority);
    
    for (const [scriptName, scriptConfig] of scripts) {
      const isRunning = isScriptRunning(scriptName);
      const status = isRunning ? "RUNNING" : (scriptConfig.enabled ? "STOPPED" : "DISABLED");
      const ramUsage = getScriptRamCost(scriptName);
      
      ns.print(`║ ${scriptName.padEnd(18)} ║ ${status.padEnd(7)} ║ ${ramUsage.toFixed(1).padStart(8)}GB ║`);
    }
    
    ns.print("╚════════════════════╩═════════╩═══════════╝");
  }
  
  // Periodically clean up any orphaned processes
  function cleanupProcesses() {
    // Get current processes running on home
    const currentProcesses = ns.ps("home");
    const processesByName = new Map();
    
    // Group processes by filename
    for (const process of currentProcesses) {
      if (!processesByName.has(process.filename)) {
        processesByName.set(process.filename, []);
      }
      processesByName.get(process.filename).push(process);
    }
    
    // Check for singleton scripts with multiple instances
    for (const [scriptName, processes] of processesByName.entries()) {
      // Check if this is a script we're supposed to manage and it's a singleton
      if (config.scriptConfig[scriptName]?.singleton && processes.length > 1) {
        // Sort by PID (lower PID typically means it started earlier)
        processes.sort((a, b) => a.pid - b.pid);
        
        // Keep the oldest, kill the rest
        const keepProcess = processes[0];
        ns.print(`Found ${processes.length} instances of ${scriptName}, keeping PID ${keepProcess.pid}`);
        
        // Kill duplicates
        for (let i = 1; i < processes.length; i++) {
          ns.kill(processes[i].pid);
          ns.print(`Killed duplicate ${scriptName} (PID: ${processes[i].pid})`);
        }
        
        // Update our tracking
        runningProcesses.set(scriptName, {
          pid: keepProcess.pid,
          startTime: Date.now() // Reset the start time
        });
      }
    }
    
    // Check which scripts in our tracking are no longer running
    for (const [scriptName, processInfo] of runningProcesses.entries()) {
      if (!processesByName.has(scriptName)) {
        // Script is no longer running at all
        runningProcesses.delete(scriptName);
        ns.print(`Removed ${scriptName} from process tracking (no longer running)`);
        continue;
      }
      
      // Check if our PID is still valid
      const matchingProcess = processesByName.get(scriptName).find(p => p.pid === processInfo.pid);
      if (!matchingProcess && processesByName.get(scriptName).length > 0) {
        // Update our tracking to the first instance
        const newProcess = processesByName.get(scriptName)[0];
        runningProcesses.set(scriptName, {
          pid: newProcess.pid,
          startTime: Date.now()
        });
        ns.print(`Updated PID for ${scriptName} to ${newProcess.pid}`);
      }
    }
  }
  
  // Check the unlocks/features available to the player
  function updateFeatureAvailability() {
    try {
      // Check if player has TIX API access
      const hasTixApi = ns.stock.hasWSEAccount() && ns.stock.hasTIXAPIAccess();
      config.scriptConfig["stockmaster.js"].enabled = hasTixApi;
      
      // Check sleeves
      try {
        const numSleeves = ns.sleeve.getNumSleeves();
        config.scriptConfig["sleeve.js"].enabled = numSleeves > 0;
      } catch {
        config.scriptConfig["sleeve.js"].enabled = false;
      }
      
      // Check bladeburner
      try {
        const hasBladeburner = ns.bladeburner.inBladeburner();
        config.scriptConfig["bladeburner.js"].enabled = hasBladeburner;
      } catch {
        config.scriptConfig["bladeburner.js"].enabled = false;
      }
    } catch (error) {
      // If any check fails, it's likely the feature isn't available
      ns.print(`Error checking feature availability: ${error}`);
    }
  }
  
  // Main loop
  let lastStatusUpdate = 0;
  
  // Initial cleanup for all processes
  cleanupProcesses();
  
  // Initial check for hacknet manager scripts
  for (const [scriptName, scriptConfig] of Object.entries(config.scriptConfig)) {
    if (scriptName !== "hacknet-pro.js" && scriptName.includes("hacknet") && ns.isRunning(scriptName, "home")) {
      ns.print(`Killing conflicting hacknet script: ${scriptName}`);
      ns.kill(scriptName, "home");
    }
  }
  
  while (true) {
    try {
      // Update current time
      const currentTime = Date.now();
      
      // Check for orphaned processes
      cleanupProcesses();
      
      // Display status every 10 seconds
      if (currentTime - lastStatusUpdate >= 10000) {
        displayStatus();
        updateFeatureAvailability();
        lastStatusUpdate = currentTime;
      }
      
      // Get available RAM
      const availableRam = getAvailableRam();
      
      // Sort scripts by priority
      const scriptsByPriority = Object.entries(config.scriptConfig)
        .sort(([, configA], [, configB]) => configA.priority - configB.priority);
      
      // Process scripts in priority order
      for (const [scriptName, scriptConfig] of scriptsByPriority) {
        if (scriptConfig.enabled) {
          // Double-check that the script isn't already running
          if (scriptConfig.singleton && isScriptRunning(scriptName)) {
            continue; // Skip if it's already running
          }
          
          // Get script RAM requirements
          const scriptRam = getScriptRamCost(scriptName);
          
          // Check if we have enough RAM
          if (scriptConfig.ramCheck && scriptRam > availableRam) {
            ns.print(`Insufficient RAM for ${scriptName} (need ${scriptRam.toFixed(1)}GB, have ${availableRam.toFixed(1)}GB)`);
            continue;
          }
          
          // Run the script
          await startScript(scriptName, scriptConfig);
          
          // Small delay between script starts
          await ns.sleep(500);
        } else if (isScriptRunning(scriptName)) {
          // If script is disabled but running, stop it
          stopScript(scriptName);
        }
      }
    } catch (error) {
      ns.print(`ERROR in daemon cycle: ${error}`);
    }
    
    // Sleep until the next cycle
    await ns.sleep(config.cycleSleepTime);
  }
} 