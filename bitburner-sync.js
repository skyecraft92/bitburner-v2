/** @param {NS} ns */
export async function main(ns) {
  // Configuration - GitHub information
  const githubUsername = "skyecraft92";
  const repositoryName = "bitburner-v2"; 
  const branchName = "main";
  
  // Base URL for raw GitHub content
  const baseUrl = `https://raw.githubusercontent.com/${githubUsername}/${repositoryName}/${branchName}/`;
  
  // Get a list of files from the repository
  ns.tprint("Attempting to download files from GitHub repository...");
  
  // List of files to download (based on your GitHub repository)
  const filesToDownload = [
    "APIBreakInfo-2.6.1.txt",
    "README.md",
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
  
  // Download each file
  let successCount = 0;
  let failCount = 0;
  
  for (const file of filesToDownload) {
    const url = baseUrl + file;
    ns.tprint(`Downloading ${file} from ${url}...`);
    
    // Add timestamp to URL to prevent caching
    const success = await ns.wget(url + "?ts=" + new Date().getTime(), file);
    
    if (success) {
      successCount++;
      ns.tprint(`SUCCESS: Downloaded ${file}`);
    } else {
      failCount++;
      ns.tprint(`ERROR: Failed to download ${file} from ${url}`);
    }
    
    // Small delay to avoid overwhelming requests
    await ns.sleep(300);
  }
  
  // Download files from Remote folder if it exists
  ns.tprint("Attempting to download files from Remote folder...");
  
  // Common files in the Remote folder - add or remove based on your repository
  const remoteFiles = [
    "Remote/hack.js",
    "Remote/grow.js",
    "Remote/weaken.js",
    "Remote/share.js"
  ];
  
  // Create Remote directory if it doesn't exist
  if (!ns.fileExists("Remote/")) {
    try {
      // In Bitburner, we can create a directory by writing a file to it
      ns.write("Remote/.placeholder", "", "w");
      ns.tprint("Created Remote directory");
    } catch (e) {
      ns.tprint(`ERROR: Could not create Remote directory: ${e}`);
    }
  }
  
  // Download Remote folder files
  for (const file of remoteFiles) {
    const url = baseUrl + file;
    ns.tprint(`Downloading ${file} from ${url}...`);
    
    // Add timestamp to URL to prevent caching
    const success = await ns.wget(url + "?ts=" + new Date().getTime(), file);
    
    if (success) {
      successCount++;
      ns.tprint(`SUCCESS: Downloaded ${file}`);
    } else {
      failCount++;
      ns.tprint(`ERROR: Failed to download ${file} from ${url}`);
    }
    
    // Small delay to avoid overwhelming requests
    await ns.sleep(300);
  }
  
  // Summary
  ns.tprint(`Download complete!`);
  ns.tprint(`Successfully downloaded: ${successCount} files`);
  ns.tprint(`Failed to download: ${failCount} files`);
  ns.tprint(`Some files may fail to download if they don't exist in the repository.`);
}

// Autocomplete handler
export function autocomplete(data, args) {
  return [];
} 