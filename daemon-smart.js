/** @param {NS} ns */
export const DAEMON_VERSION = "1.7.0"; // Version identifier - Added backdoor manager & version alignment
const CONFIG_FILE = 'daemon-config.txt';

export async function main(ns) {
  // Get the current game options
  const options = ns.flags([
    ["download-deps", false],  // Flag to download dependencies
    ["help", false],           // Help flag
    ["suppress-warnings", false] // Suppress Source File requirement warnings
  ]);
  
  // Configuration - RAM Management
  const config = {
    reservedRam: 8,           // GB of RAM to reserve for other scripts
    minRamForTools: 2,        // Minimum RAM needed to run utility scripts
    safetyMargin: 2,          // Additional safety margin in GB
    cycleSleepTime: 10000,    // Time to sleep between cycles (ms)
    earlyGame: true,          // Set to true for early game (disables late-game features)
    processManagement: true,  // Actively manage processes to prevent duplicates
    suppressSourceFileWarnings: options["suppress-warnings"], // Whether to suppress Source File requirement warnings
    scriptConfig: {
      // Define what scripts to run and their properties
      "hacknet-pro.js": {
        enabled: true,
        singleton: true,     // Only allow one instance
        ramCheck: true,      // Check available RAM before running
        priority: 1,         // Higher priority runs first (1 is highest)
        tail: true,          // Whether to open a tail window
        args: [],             // Arguments to pass to the script
        fallback: "hacknet-basic.js" // Fallback script if this fails
      },
      "hack-manager.js": { // Added hacking controller
        enabled: true,
        singleton: true,
        ramCheck: true,
        priority: 2,        // High priority for hacking income
        tail: true,
        args: []
        // No source file requirement needed for basic hack/grow/weaken
      },
      "hacknet-basic.js": { // Added entry for fallback awareness
        enabled: false,      // Not enabled directly, only as fallback
        singleton: true,
        ramCheck: true,
        priority: 1,         // Same priority as parent
        tail: true,          // Match parent tail setting
        args: []
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
        priority: 3,        // Shifted priority down
        tail: true,
        args: [],
        sourceFileRequirement: 4, // Requires SF4
        fallback: "home-basic.js" // Fallback script
      },
      "home-basic.js": { // Added entry for fallback awareness
        enabled: false,
        singleton: true,
        ramCheck: true,
        priority: 3,        // Shifted priority down
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
        priority: 4,        // Shifted priority down
        tail: true,
        args: [],
        requiresWse: true, // Explicit flag for WSE requirement
        fallback: "stock-basic.js" // Fallback script
      },
      "stock-basic.js": { // Added entry for fallback awareness
        enabled: false,
        singleton: true,
        ramCheck: true,
        priority: 4,        // Shifted priority down
        tail: true,
        args: []
      },
      "buy-servers.js": { // Added server purchasing script
        enabled: true,      // Enable by default
        singleton: true,
        ramCheck: true,
        priority: 5,        // Shifted priority down
        tail: true,         // Useful to see purchase logs
        args: [],
        sourceFileRequirement: 4 // Requires SF4 for ns.purchaseServer
      },
      "sleeve.js": {
        enabled: false,      // Requires BN10
        singleton: true,
        ramCheck: true,
        priority: 6,        // Shifted priority down
        tail: false,
        args: [],
        sourceFileRequirement: 10  // Explicitly requires SF10
      },
      "bladeburner.js": {
        enabled: false,      // Requires SF6/SF7
        singleton: true,
        ramCheck: true,
        priority: 6,        // Shifted priority down
        tail: false,
        args: [],
        sourceFileRequirement: 6  // Explicitly requires SF6
      },
      "backdoor-manager.js": {
        priority: 70, // Run after most other things are established
        ramRequirement: 6, // Estimate RAM usage
        sourceFileRequirement: 4, // Needs Singularity (SF4) to function automatically
        enabled: true,
        args: [],
        fallback: null
      }
    }
  };
  
  // Handle special command-line options
  if (options.help) {
    ns.tprint("╔════════════════════════════════════════════╗");
    ns.tprint("║          SMART DAEMON HELP                 ║");
    ns.tprint("╠════════════════════════════════════════════╣");
    ns.tprint("║ --download-deps    : Download dependencies ║");
    ns.tprint("║ --suppress-warnings: Hide SF requirements  ║");
    ns.tprint("║ --help             : Display help message  ║");
    ns.tprint("╚════════════════════════════════════════════╝");
    return;
  }
  
  // Handle downloading dependencies
  if (options["download-deps"]) {
    await downloadDependencies(ns);
    return;
  }
  
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
  
  // Check if we have a specific Source File
  function hasSourceFile(sourceFileNumber) {
    try {
      const sourceFiles = ns.singularity.getOwnedSourceFiles();
      return sourceFiles.some(sf => sf.n === sourceFileNumber);
    } catch (error) {
      // If we get an error, we don't have access to singularity API
      // which means we definitely don't have SF4
      return false;
    }
  }
  
  // Start a script if it's not already running
  async function startScript(scriptName, scriptConfig) {
    // *** Always use the primary script name for file operations and execution ***
    const scriptToRun = scriptName; 
    let configToUse = scriptConfig;
    let isFallbackLogicActive = false; // Flag to know if fallback conditions were met

    // Check if the primary script should even be attempted
    if (!configToUse.enabled) {
      return { success: false, reason: "disabled" };
    }

    // --- Pre-checks that might trigger fallback logic --- 

    // *** DEBUG LOGGING START ***
    ns.print(`DEBUG: Checking ${scriptName}. SF Req: ${configToUse.sourceFileRequirement}, Has SF? ${hasSourceFile(configToUse.sourceFileRequirement || 0)}`);
    // *** DEBUG LOGGING END ***

    // Check for source file requirements 
    if (configToUse.sourceFileRequirement && !hasSourceFile(configToUse.sourceFileRequirement)) {
      if (!config.suppressSourceFileWarnings) {
        ns.print(`WARN: ${scriptName} requires SF ${configToUse.sourceFileRequirement}, which is missing.`);
      }
      // *** If the required SF is missing, do not proceed, even with fallback ***
      ns.print(`-> Skipping ${scriptName} due to missing required Source-File.`);
      return { success: false, reason: `missing required SF ${configToUse.sourceFileRequirement}` };
    }

    // Check for WSE requirement (Fallback IS allowed here)
    if (configToUse.requiresWse && !ns.stock.hasWSEAccount()) {
      if (!config.suppressSourceFileWarnings) {
        ns.print(`WARN: ${scriptName} needs WSE account.`);
      }
       if (configToUse.fallback) {
        ns.print(`-> Fallback logic activated for ${scriptName} due to missing WSE.`);
        isFallbackLogicActive = true;
         const fallbackConfig = config.scriptConfig[configToUse.fallback] || {};
         if (fallbackConfig.requiresWse && !ns.stock.hasWSEAccount()) {
            ns.print(`ERROR: Fallback logic for ${scriptName} also requires unavailable WSE account. Cannot run.`);
            return { success: false, reason: "fallback WSE requirement" };
         }
      } else {
        ns.print(`-> No fallback available for ${scriptName}. Skipping.`);
        return { success: false, reason: "WSE requirement" };
      }
    }
    
    // Check if the script file exists (using the primary name)
    if (!ns.fileExists(scriptToRun)) {
        ns.print(`ERROR: Script file not found: ${scriptToRun}`);
        // If the file doesn't exist, even fallback logic can't save it.
        // Bootstrap should have handled creating *some* file at this path.
        return { success: false, reason: "file not found" };
    }

    // Check if it's a singleton and already running (check by the primary name)
    // If using fallback logic, we might allow running if the *primary* isn't running,
    // but the actual fallback script *is*. This logic gets complex. 
    // Simplification: If *any* process matching scriptToRun is running, skip.
    if (configToUse.singleton && isScriptRunning(scriptToRun)) {
      return { success: true, reason: "already running" }; // Consider it success
    }
    
    // --- Specific script API checks (still apply based on primary name) ---
    if (scriptToRun === "sleeve.js") { 
      try {
        const numSleeves = ns.sleeve.getNumSleeves();
        if (numSleeves <= 0) {
          if (!config.suppressSourceFileWarnings) {
            ns.print(`WARN: ${scriptToRun} requires sleeves (BN10).`);
          }
           if (configToUse.fallback) {
               // Potentially activate fallback logic here if needed
                isFallbackLogicActive = true; 
           } else {
               ns.print(`-> No fallback. Skipping ${scriptToRun}.`);
              return { success: false, reason: "no sleeves" };
           }
        }
      } catch (e) { 
          if (!config.suppressSourceFileWarnings) {
            ns.print(`WARN: Sleeve API not available for ${scriptToRun}.`);
          }
          // If API isn't available, fallback doesn't help unless it avoids the API call
          return { success: false, reason: "sleeve API unavailable" };
      }
    }
    
    if (scriptToRun === "bladeburner.js") { 
        try {
            ns.bladeburner.getRank(); 
        } catch (e) {
            if (!config.suppressSourceFileWarnings) {
                ns.print(`WARN: Bladeburner API not available for ${scriptToRun}.`);
            }
            // Fallback unlikely to help if API is missing
            return { success: false, reason: "bladeburner API unavailable" };
        }
    }
    // --- End specific script checks ---


    // Check RAM before executing (use primary script name for cost check)
    let requiredRam = 0;
    if (configToUse.ramCheck) {
      requiredRam = getScriptRamCost(scriptToRun); // Check RAM cost of the primary file
      const availableRam = getAvailableRam();
      
      if (requiredRam === 0 && ns.fileExists(scriptToRun)) {
          // If file exists but RAM cost is 0, it might be empty or corrupted
          ns.print(`ERROR: Could not get RAM cost for existing file ${scriptToRun}. Skipping.`);
          return { success: false, reason: "RAM cost unavailable" };
      } else if (requiredRam === 0) { 
           // This case should be caught by fileExists earlier
           ns.print(`ERROR: Cannot get RAM cost for non-existent file ${scriptToRun}. Skipping.`);
           return { success: false, reason: "RAM cost unavailable / file missing" };
      }

      if (availableRam < requiredRam) {
        ns.print(`WARN: Not enough RAM for ${scriptToRun}. Need ${requiredRam.toFixed(1)}GB, have ${availableRam.toFixed(1)}GB available.`);
        // Even if fallback logic is active, if the primary script file (containing fallback code)
        // requires too much RAM, we can't run it.
         return { success: false, reason: "insufficient RAM" };
      }
    }
    
    // Execute the primary script file
    ns.print(`Starting ${scriptToRun}${(isFallbackLogicActive ? ' (using fallback logic)' : '')}...`);
    const pid = ns.exec(scriptToRun, "home", 1, ...(configToUse.args || []));
    
    if (pid > 0) {
      ns.print(`✓ Started ${scriptToRun} with PID ${pid}`);
      
      // Track the process using the primary script name
      runningProcesses.set(scriptToRun, {
        pid: pid,
        startTime: Date.now(),
        isFallbackActive: isFallbackLogicActive, // Track if fallback logic was used
        originalScript: scriptName // Keep original name for clarity maybe?
      });
      
      // Open tail window if configured - *** REMOVED ns.ui.getTailWindow check ***
      if (configToUse.tail) {
         ns.tail(pid);
      }
      return { success: true, reason: "started", pid: pid, scriptRan: scriptToRun };
    } else {
      ns.print(`✗ Failed to start ${scriptToRun} (PID=0). Possible RAM issue or script error within the file.`);
       // If exec fails, there's nothing more we can do, even with fallback logic active.
       return { success: false, reason: "exec failed" };
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
  
  // Download dependencies function
  async function downloadDependencies(ns) {
    ns.print("[INFO] Checking and downloading dependencies...");
    const scriptsToDownload = [
        "daemon-smart.js", // Download itself too for consistency
        "helpers.js", 
        "simple-bootstrap.js", // Bootstrap might need updates
        "stockmaster.js", 
        "stock-basic.js", 
        "hacknet-pro.js", 
        "hacknet-basic.js", 
        "upgrade-home.js", 
        "home-basic.js",
        "buy-servers.js",
        "hack-manager.js",
        "hack-worker.js",
        "grow-worker.js",
        "weaken-worker.js",
        "backdoor-manager.js" // Added new script
        // Add other core scripts managed by the daemon here
    ];
    // Define source/repo URL (replace with your actual repo URL)
    const baseUrl = "http://localhost:8000/"; // Or raw GitHub URL etc.

    let allDownloadsSuccessful = true;
    for (const script of scriptsToDownload) {
        const remotePath = baseUrl + script;
        const localPath = script;
        ns.print(`[INFO] Downloading ${script} from ${remotePath}...`);
        const success = await ns.wget(remotePath, localPath, "home");
        if (success) {
            ns.print(`[SUCCESS] Downloaded ${script}.`);
        } else {
            ns.print(`[ERROR] Failed to download ${script}!`);
            allDownloadsSuccessful = false;
            // Decide if failure is critical. Maybe continue for non-essential scripts?
        }
        await ns.sleep(100); // Small delay between downloads
    }

    if (allDownloadsSuccessful) {
        ns.print("[SUCCESS] All dependencies downloaded.");
        // Update the local version file upon successful download
        try {
            await ns.write('daemon-version.txt', DAEMON_VERSION, 'w');
            ns.print(`[INFO] Updated local version file to ${DAEMON_VERSION}.`);
        } catch (e) {
            ns.print(`[ERROR] Failed to write local version file: ${e}`);
        }
        ns.print("[INFO] Restarting daemon with updated dependencies...");
        // Spawn the newly downloaded daemon (which should be the current script file)
        // Use spawn to ensure it runs independently and this instance can exit cleanly.
        ns.spawn("daemon-smart.js", 1); 
    } else {
        ns.tprint("[ERROR] Failed to download one or more critical dependencies. Aborting update process.");
    }
    // This instance should exit after attempting the download/update
    ns.exit(); 
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
      try {
        const hasTixApi = ns.stock.hasWSEAccount() && ns.stock.hasTIXAPIAccess();
        config.scriptConfig["stockmaster.js"].enabled = hasTixApi;
      } catch (e) {
        // Stock API not available yet
        config.scriptConfig["stockmaster.js"].enabled = false;
      }
      
      // Check sleeves
      try {
        const numSleeves = ns.sleeve.getNumSleeves();
        config.scriptConfig["sleeve.js"].enabled = numSleeves > 0;
      } catch (e) {
        config.scriptConfig["sleeve.js"].enabled = false;
      }
      
      // Check bladeburner
      try {
        const hasBladeburner = ns.bladeburner.inBladeburner();
        config.scriptConfig["bladeburner.js"].enabled = hasBladeburner;
      } catch (e) {
        config.scriptConfig["bladeburner.js"].enabled = false;
      }
      
      // Check for Source File 4 (Singularity)
      const hasSF4 = hasSourceFile(4);
      if (!hasSF4 && config.scriptConfig["upgrade-home.js"].enabled && !config.suppressSourceFileWarnings) {
        ns.print("Source-File 4 not detected, upgrade-home.js will run with limited functionality");
      }
      
    } catch (error) {
      // If any check fails, it's likely the feature isn't available
      if (!config.suppressSourceFileWarnings) {
        ns.print(`Error checking feature availability: ${error}`);
      }
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
            if (!config.suppressSourceFileWarnings) {
              ns.print(`Insufficient RAM for ${scriptName} (need ${scriptRam.toFixed(1)}GB, have ${availableRam.toFixed(1)}GB)`);
            }
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
      if (!config.suppressSourceFileWarnings) {
        ns.print(`ERROR in daemon cycle: ${error}`);
      }
    }
    
    // Sleep until the next cycle
    await ns.sleep(config.cycleSleepTime);
  }
} 