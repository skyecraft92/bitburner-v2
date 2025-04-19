/** @param {NS} ns */
export async function main(ns) {
  // Configuration - GitHub repository
  const githubUsername = "skyecraft92";
  const repositoryName = "bitburner-v2";
  const branchName = "main";
  const baseUrl = `https://raw.githubusercontent.com/${githubUsername}/${repositoryName}/${branchName}/`;
  
  // Options
  const options = {
    downloadRemoteFiles: true,    // Set to false to skip Remote folder files
    overwriteExisting: true,      // Set to false to skip existing files
    createBackups: false,         // Set to true to create backups before overwriting
    useProgress: true,            // Show progress bar
    verbose: true                 // Show detailed logs
  };
  
  // Progress tracking
  let filesProcessed = 0;
  let successCount = 0;
  let failCount = 0;
  
  // File list - core files
  const coreFiles = [
    "APIBreakInfo-2.6.1.txt",
    "analyze-hack.js",
    "ascend.js",
    "autopilot.js",
    "bladeburner.js",
    "casino.js",
    "cleanup.js",
    "crime.js",
    "daemon.js",
    "dump-ns-namespace.js",
    "faction-manager.js",
    "farm-intelligence.js",
    "gangs.js",
    "git-pull.js",
    "grep.js",
    "hacknet-upgrade-manager.js",
    "helpers.js",
    "host-manager.js",
    "kill-all-scripts.js",
    "master.js",
    "optimize-stanek.js",
    "optimize-stanek.js.og.js",
    "reserve.js",
    "reserve.txt",
    "run-command.js",
    "scan.js",
    "sleeve.js",
    "spend-hacknet-hashes.js",
    "stanek.js",
    "stanek.js.create.js",
    "stats.js",
    "stockmaster.js",
    "sync-scripts.js",
    "work-for-factions.js",
    "worker.js"
  ];
  
  // File list - Remote folder files
  const remoteFiles = [
    "Remote/share.js"
  ];
  
  // Combine file lists based on options
  const filesToDownload = [...coreFiles];
  if (options.downloadRemoteFiles) {
    filesToDownload.push(...remoteFiles);
  }
  
  const totalFiles = filesToDownload.length;
  
  // Display header
  ns.tprint("╔═════════════════════════════════════════════╗");
  ns.tprint("║          GITHUB TO BITBURNER SYNC           ║");
  ns.tprint("╠═════════════════════════════════════════════╣");
  ns.tprint(`║ Repository: ${githubUsername}/${repositoryName}   ║`);
  ns.tprint(`║ Files to download: ${totalFiles}                      ║`);
  ns.tprint("╚═════════════════════════════════════════════╝");
  
  // Function to show progress bar
  function updateProgress() {
    if (!options.useProgress) return;
    
    const progress = Math.floor((filesProcessed / totalFiles) * 100);
    const progressChars = Math.floor(progress / 2);
    
    const progressBar = "[" + "=".repeat(progressChars) + " ".repeat(50 - progressChars) + "]";
    ns.clearLog();
    ns.print(`Progress: ${progressBar} ${progress}%`);
    ns.print(`Files: ${filesProcessed}/${totalFiles} (${successCount} succeeded, ${failCount} failed)`);
  }
  
  // Initialize progress display
  if (options.useProgress) {
    ns.disableLog("ALL");
    ns.tail();
  }
  
  // Download each file
  for (const file of filesToDownload) {
    const url = baseUrl + file;
    
    if (options.verbose) {
      ns.tprint(`Processing: ${file}`);
    }
    
    // Check if file exists and handle according to options
    if (ns.fileExists(file) && !options.overwriteExisting) {
      if (options.verbose) {
        ns.tprint(`SKIPPED: ${file} (already exists)`);
      }
      filesProcessed++;
      updateProgress();
      continue;
    }
    
    // Create backup if needed
    if (ns.fileExists(file) && options.createBackups) {
      const backupName = `${file}.bak`;
      if (ns.fileExists(backupName)) {
        ns.rm(backupName);
      }
      ns.write(backupName, ns.read(file), "w");
      if (options.verbose) {
        ns.tprint(`BACKUP: Created ${backupName}`);
      }
    }
    
    // Download the file
    try {
      // Add timestamp to prevent caching
      const success = await ns.wget(url + "?ts=" + new Date().getTime(), file);
      
      if (success) {
        if (options.verbose) {
          ns.tprint(`SUCCESS: Downloaded ${file}`);
        }
        successCount++;
      } else {
        if (options.verbose) {
          ns.tprint(`ERROR: Failed to download ${file}`);
        }
        failCount++;
      }
    } catch (e) {
      if (options.verbose) {
        ns.tprint(`ERROR: Exception while downloading ${file}: ${e}`);
      }
      failCount++;
    }
    
    filesProcessed++;
    updateProgress();
    
    // Small delay to avoid overwhelming requests
    await ns.sleep(100);
  }
  
  // Save this script itself for future use
  try {
    const syncScriptName = "github-sync.js";
    const currentScript = ns.getScriptName();
    
    if (currentScript !== syncScriptName) {
      ns.write(syncScriptName, ns.read(currentScript), "w");
      if (options.verbose) {
        ns.tprint(`Created ${syncScriptName} for future syncing`);
      }
    }
  } catch (e) {
    ns.tprint(`Note: Could not save sync script: ${e}`);
  }
  
  // Display summary
  ns.tprint("╔═════════════════════════════════════════════╗");
  ns.tprint("║               SYNC COMPLETE                 ║");
  ns.tprint("╠═════════════════════════════════════════════╣");
  ns.tprint(`║ Total files processed: ${filesProcessed.toString().padStart(2)}                 ║`);
  ns.tprint(`║ Successfully downloaded: ${successCount.toString().padStart(2)}                ║`);
  ns.tprint(`║ Failed to download: ${failCount.toString().padStart(2)}                     ║`);
  ns.tprint("╚═════════════════════════════════════════════╝");
  
  // Suggest next steps
  ns.tprint("\nWhat next?");
  ns.tprint("- Run 'run daemon.js' for main automation");
  ns.tprint("- Run 'run autopilot.js' for automated gameplay");
  ns.tprint("- Run 'run stockmaster.js' for stock market automation");
  ns.tprint("- Run 'run sleeve.js' for sleeve management");
  
  // Return completion status
  return {
    successful: successCount,
    failed: failCount,
    total: filesProcessed
  };
}

// Autocomplete handler
export function autocomplete(data, args) {
  return [];
} 