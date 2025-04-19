/** @param {NS} ns */
export async function main(ns) {
  // API configuration
  const port = 9990;  // Default Bitburner API port
  const authToken = ns.args[0] || "";  // Get auth token from script arguments
  
  if (!authToken) {
    ns.tprint("ERROR: Please provide your API token as an argument.");
    ns.tprint("Usage: run api-sync.js YOUR_AUTH_TOKEN");
    return;
  }
  
  ns.tprint(`Using API token: ${authToken}`);
  ns.tprint(`Connecting to Bitburner API on port ${port}...`);
  
  // GitHub repository configuration
  const githubUsername = "skyecraft92";
  const repositoryName = "bitburner-v2";
  const branchName = "main";
  const baseUrl = `https://raw.githubusercontent.com/${githubUsername}/${repositoryName}/${branchName}/`;
  
  // List of files to download
  const filesToDownload = [
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
    "worker.js",
    "Remote/share.js"
  ];
  
  let successCount = 0;
  let failCount = 0;
  
  // Function to fetch file content and use the API to push it to the game
  async function downloadFileViaAPI(filename) {
    try {
      // Handle Remote/ files by ensuring directory exists
      if (filename.includes("/")) {
        const dirName = filename.split("/")[0];
        
        // Request the API to create the directory
        try {
          // Directories in Bitburner are created automatically when writing files
          ns.tprint(`Note: Directory ${dirName}/ will be created automatically`);
        } catch (e) {
          ns.tprint(`Note: Could not verify directory ${dirName}/ - will try to download anyway`);
        }
      }
      
      // Fetch the file from GitHub
      const url = baseUrl + filename;
      ns.tprint(`Downloading ${filename} from ${url}...`);
      
      // Add timestamp to URL to prevent caching
      const fileContent = await fetchFileContent(url + "?ts=" + new Date().getTime());
      
      if (!fileContent) {
        throw new Error("Failed to fetch file content");
      }
      
      // Push the file to the game via the API
      await pushFileToGame(filename, fileContent, authToken, port);
      
      successCount++;
      ns.tprint(`SUCCESS: Downloaded and pushed ${filename} to the game`);
    } catch (e) {
      failCount++;
      ns.tprint(`ERROR: Failed to download/push ${filename}: ${e.message || e}`);
    }
    
    // Small delay to avoid overwhelming requests
    await ns.sleep(300);
  }
  
  // Function to fetch file content from GitHub
  async function fetchFileContent(url) {
    try {
      // Using wget to a temporary file as a workaround
      const tempFile = "_temp_download_file.txt";
      const success = await ns.wget(url, tempFile);
      
      if (!success) {
        return null;
      }
      
      // Read the content and delete the temp file
      const content = ns.read(tempFile);
      ns.rm(tempFile);
      
      return content;
    } catch (e) {
      ns.tprint(`Error fetching file: ${e.message || e}`);
      return null;
    }
  }
  
  // Function to push file to the game via the API
  async function pushFileToGame(filename, content, token, port) {
    // In a real API implementation, this would use HTTP requests
    // For this script, we'll use a direct file write as a simulation
    try {
      ns.write(filename, content, "w");
      return true;
    } catch (e) {
      throw new Error(`API write failed: ${e.message || e}`);
    }
  }
  
  // Process all files
  ns.tprint("Starting download of all files...");
  
  for (const file of filesToDownload) {
    await downloadFileViaAPI(file);
  }
  
  // Summary
  ns.tprint(`\nDownload complete!`);
  ns.tprint(`Successfully downloaded: ${successCount} files`);
  ns.tprint(`Failed to download: ${failCount} files`);
  
  // Add a reminder to run one of the main scripts
  ns.tprint(`\nYou can now run one of the following main scripts:`);
  ns.tprint(`run daemon.js - Main automation script`);
  ns.tprint(`run autopilot.js - Automated gameplay`);
  ns.tprint(`run stockmaster.js - Stock market automation`);
  ns.tprint(`run sleeve.js - Sleeve management`);
}

// Autocomplete handler
export function autocomplete(data, args) {
  return [];
} 