/** @param {NS} ns */
export const DAEMON_VERSION = "1.1.0"; // Version identifier

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
        priority: 2,
        tail: true,
        args: [],
        sourceFileRequirement: 4, // Requires SF4
        fallback: "home-basic.js" // Fallback script
      },
      "home-basic.js": { // Added entry for fallback awareness
        enabled: false,
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
        args: [],
        requiresWse: true, // Explicit flag for WSE requirement
        fallback: "stock-basic.js" // Fallback script
      },
      "stock-basic.js": { // Added entry for fallback awareness
        enabled: false,
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
        args: [],
        sourceFileRequirement: 10  // Explicitly requires SF10
      },
      "bladeburner.js": {
        enabled: false,      // Requires SF6/SF7
        singleton: true,
        ramCheck: true,
        priority: 5,
        tail: false,
        args: [],
        sourceFileRequirement: 6  // Explicitly requires SF6
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
    let scriptToRun = scriptName;
    let configToUse = scriptConfig;
    let isFallback = false;

    // Check if the primary script should even be attempted
    if (!configToUse.enabled) {
      return { success: false, reason: "disabled" };
    }

    // Check for source file requirements BEFORE attempting primary
    if (configToUse.sourceFileRequirement && !hasSourceFile(configToUse.sourceFileRequirement)) {
      if (!config.suppressSourceFileWarnings) {
        ns.print(`WARN: ${scriptName} needs SF ${configToUse.sourceFileRequirement}.`);
      }
      if (configToUse.fallback) {
        ns.print(`-> Attempting fallback: ${configToUse.fallback}`);
        scriptToRun = configToUse.fallback;
        // Ensure the daemon knows about the fallback's config
        configToUse = config.scriptConfig[scriptToRun] || {}; // Use fallback config if defined
        isFallback = true;
        // If the fallback *also* has requirements (unlikely but possible), check them
        if (configToUse.sourceFileRequirement && !hasSourceFile(configToUse.sourceFileRequirement)) {
           ns.print(`ERROR: Fallback ${scriptToRun} also needs SF ${configToUse.sourceFileRequirement}. Cannot run.`);
           return { success: false, reason: `fallback SF requirement (${configToUse.sourceFileRequirement})` };
        }
      } else {
        ns.print(`-> No fallback available for ${scriptName}. Skipping.`);
        return { success: false, reason: `SF requirement (${configToUse.sourceFileRequirement})` };
      }
    }

    // Check for WSE requirement BEFORE attempting primary (specifically for stockmaster)
    if (configToUse.requiresWse && !ns.stock.hasWSEAccount()) {
      if (!config.suppressSourceFileWarnings) {
        ns.print(`WARN: ${scriptName} needs WSE account.`);
      }
       if (configToUse.fallback) {
        ns.print(`-> Attempting fallback: ${configToUse.fallback}`);
        scriptToRun = configToUse.fallback;
        configToUse = config.scriptConfig[scriptToRun] || {};
        isFallback = true;
         // Check fallback WSE req (unlikely)
         if (configToUse.requiresWse && !ns.stock.hasWSEAccount()) {
            ns.print(`ERROR: Fallback ${scriptToRun} also needs WSE account. Cannot run.`);
            return { success: false, reason: "fallback WSE requirement" };
         }
      } else {
        ns.print(`-> No fallback available for ${scriptName}. Skipping.`);
        return { success: false, reason: "WSE requirement" };
      }
    }
    
    // Check if the script file exists (could be primary or fallback)
    if (!ns.fileExists(scriptToRun)) {
        ns.print(`ERROR: Script file not found: ${scriptToRun}`);
        // If the *primary* failed file check and has a fallback, try the fallback file check
        if (!isFallback && scriptConfig.fallback && ns.fileExists(scriptConfig.fallback)) {
            ns.print(`-> Found fallback script: ${scriptConfig.fallback}. Attempting to run it.`);
            scriptToRun = scriptConfig.fallback;
            configToUse = config.scriptConfig[scriptToRun] || {};
            isFallback = true;
        } else {
            return { success: false, reason: "file not found" };
        }
    }


    // Check if it's a singleton and already running (check by the name we intend to run)
    if (configToUse.singleton && isScriptRunning(scriptToRun)) {
      // ns.print(`${scriptToRun} is already running, skipping (singleton mode)`); // Too noisy
      return { success: true, reason: "already running" }; // Consider it success if it's running
    }
    
    // --- Specific script checks --- (kept from original, apply to scriptToRun)
    if (scriptToRun === "sleeve.js") { // Check remains specific to sleeve.js
      try {
        const numSleeves = ns.sleeve.getNumSleeves();
        if (numSleeves <= 0) {
          if (!config.suppressSourceFileWarnings) {
            ns.print(`WARN: ${scriptToRun} requires sleeves (BN10).`);
          }
          // Decide if fallback is appropriate here (currently no fallback defined for sleeve)
           if (configToUse.fallback) {
               // Fallback logic if sleeve gets one
           } else {
               ns.print(`-> No fallback. Skipping ${scriptToRun}.`);
              return { success: false, reason: "no sleeves" };
           }
        }
      } catch (e) { /* sleeves not available */ 
          if (!config.suppressSourceFileWarnings) {
            ns.print(`WARN: Sleeve API not available for ${scriptToRun}.`);
          }
          return { success: false, reason: "sleeve API unavailable" };
      }
    }
    
    if (scriptToRun === "bladeburner.js") { // Check remains specific to bladeburner.js
        try {
            ns.bladeburner.getRank(); // Check if API is available
        } catch (e) {
            if (!config.suppressSourceFileWarnings) {
                ns.print(`WARN: Bladeburner API not available for ${scriptToRun}.`);
            }
            // Decide if fallback is appropriate here
            return { success: false, reason: "bladeburner API unavailable" };
        }
    }
    // --- End specific script checks ---


    // Check RAM before executing
    let requiredRam = 0;
    if (configToUse.ramCheck) {
      requiredRam = getScriptRamCost(scriptToRun);
      const availableRam = getAvailableRam();
      
      if (requiredRam === 0) {
          ns.print(`ERROR: Could not get RAM cost for ${scriptToRun}. Skipping.`);
          return { success: false, reason: "RAM cost unavailable" };
      }

      if (availableRam < requiredRam) {
        ns.print(`WARN: Not enough RAM for ${scriptToRun}. Need ${requiredRam.toFixed(1)}GB, have ${availableRam.toFixed(1)}GB available.`);
        
        // If primary fails RAM check, should we try fallback?
        // Fallbacks usually have lower RAM costs, so yes.
        if (!isFallback && scriptConfig.fallback) {
             ns.print(`-> Checking fallback: ${scriptConfig.fallback}`);
             const fallbackScript = scriptConfig.fallback;
             const fallbackConfig = config.scriptConfig[fallbackScript] || {};
             const fallbackRam = getScriptRamCost(fallbackScript);
             
             if (fallbackRam > 0 && availableRam >= fallbackRam) {
                 ns.print(`-> Attempting to run fallback ${fallbackScript} (${fallbackRam.toFixed(1)}GB) instead.`);
                 scriptToRun = fallbackScript;
                 configToUse = fallbackConfig;
                 requiredRam = fallbackRam; // Update required RAM for exec check
                 isFallback = true;
             } else {
                 ns.print(`-> Fallback ${fallbackScript} also needs too much RAM (${fallbackRam.toFixed(1)}GB) or unavailable. Skipping.`);
                 return { success: false, reason: "insufficient RAM for primary and fallback" };
             }
        } else {
            // Either already fallback or no fallback defined, or fallback too expensive
             return { success: false, reason: "insufficient RAM" };
        }
      }
    }
    
    // Execute the script (either primary or fallback)
    ns.print(`Starting ${scriptToRun}...`);
    const pid = ns.exec(scriptToRun, "home", 1, ...(configToUse.args || []));
    
    if (pid > 0) {
      ns.print(`✓ Started ${scriptToRun} with PID ${pid}`);
      
      // Track the process using the name it was actually run with
      runningProcesses.set(scriptToRun, {
        pid: pid,
        startTime: Date.now(),
        isFallback: isFallback, // Track if it's a fallback
        originalScript: isFallback ? scriptName : null // Track original if fallback
      });
      
      // Open tail window if configured
      if (configToUse.tail && !ns.ui.getTailWindow(pid)) {
         ns.tail(pid);
      }
      return { success: true, reason: "started", pid: pid, scriptRan: scriptToRun };
    } else {
      ns.print(`✗ Failed to start ${scriptToRun} (PID=0). Possible RAM issue or script error.`);
      // If exec failed for the *primary* script, try the fallback *now*
       if (!isFallback && scriptConfig.fallback) {
           ns.print(`-> Attempting fallback ${scriptConfig.fallback} due to exec failure.`);
           const fallbackScript = scriptConfig.fallback;
           const fallbackConfig = config.scriptConfig[fallbackScript] || {};
           
           // Re-check file existence and RAM for fallback before trying exec
           if (ns.fileExists(fallbackScript)) {
               const fallbackRam = getScriptRamCost(fallbackScript);
               const availableRam = getAvailableRam();
               if (fallbackRam > 0 && availableRam >= fallbackRam) {
                   const fallbackPid = ns.exec(fallbackScript, "home", 1, ...(fallbackConfig.args || []));
                   if (fallbackPid > 0) {
                       ns.print(`✓ Started fallback ${fallbackScript} with PID ${fallbackPid}`);
                       runningProcesses.set(fallbackScript, {
                           pid: fallbackPid,
                           startTime: Date.now(),
                           isFallback: true,
                           originalScript: scriptName
                       });
                       if (fallbackConfig.tail && !ns.ui.getTailWindow(fallbackPid)) {
                           ns.tail(fallbackPid);
                       }
                       return { success: true, reason: "started fallback", pid: fallbackPid, scriptRan: fallbackScript };
                   } else {
                       ns.print(`✗ Failed to start fallback ${fallbackScript} (PID=0).`);
                       return { success: false, reason: "fallback exec failed" };
                   }
               } else {
                    ns.print(`-> Fallback ${fallbackScript} RAM check failed (${fallbackRam.toFixed(1)}GB needed, ${availableRam.toFixed(1)}GB available). Cannot start.`);
                    return { success: false, reason: "fallback RAM check failed" };
               }
           } else {
               ns.print(`-> Fallback script ${fallbackScript} not found. Cannot start.`);
               return { success: false, reason: "fallback file not found" };
           }
       } else {
           // Exec failed, and it was either already the fallback or no fallback exists.
           return { success: false, reason: "exec failed" };
       }
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
    const githubUrl = "https://raw.githubusercontent.com/skyecraft92/bitburner-v2/main/";
    
    const dependencies = [
      "hacknet-pro.js",
      "upgrade-home.js", 
      "stockmaster.js",
      "sleeve.js",
      "bladeburner.js",
      "helpers.js"
    ];
    
    ns.tprint("╔════════════════════════════════════════════╗");
    ns.tprint("║       DOWNLOADING DEPENDENCIES             ║");
    ns.tprint("╠════════════════════════════════════════════╣");
    
    let successCount = 0;
    let failCount = 0;
    
    for (const file of dependencies) {
      const url = githubUrl + file;
      try {
        ns.tprint(`Downloading ${file}...`);
        const success = await ns.wget(url, file);
        
        if (success) {
          ns.tprint(`✓ Downloaded ${file}`);
          successCount++;
        } else {
          ns.tprint(`✗ Failed to download ${file}`);
          failCount++;
        }
      } catch (error) {
        ns.tprint(`✗ Error downloading ${file}: ${error}`);
        failCount++;
      }
      
      // Small delay between downloads
      await ns.sleep(300);
    }
    
    ns.tprint("╠════════════════════════════════════════════╣");
    ns.tprint(`║ ${successCount}/${dependencies.length} files downloaded     ║`);
    ns.tprint("╚════════════════════════════════════════════╝");
    
    if (successCount > 0) {
      ns.tprint("\nNow run daemon-smart.js without parameters to start the daemon");
      ns.tprint("Or use --suppress-warnings to hide Source File requirement warnings");
    }
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