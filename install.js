/** @param {NS} ns */
export async function main(ns) {
  // Configuration - GitHub information
  const githubUsername = "skyecraft92";
  const repositoryName = "bitburner-v2"; 
  const branchName = "main";
  
  // Files to download initially
  const filesToDownload = [
    "git-pull.js",
    "download-scripts.js",
    "cleanup.js"
  ];
  
  // Base URL for raw GitHub content
  const baseUrl = `https://raw.githubusercontent.com/${githubUsername}/${repositoryName}/${branchName}/`;
  
  // Download each file
  let downloadSuccess = true;
  for (const file of filesToDownload) {
    const url = baseUrl + file;
    ns.tprint(`Downloading ${file} from ${url}...`);
    
    // Add timestamp to URL to prevent caching
    const success = await ns.wget(url + "?ts=" + new Date().getTime(), file);
    
    if (success) {
      ns.tprint(`SUCCESS: Downloaded ${file}`);
    } else {
      downloadSuccess = false;
      ns.tprint(`ERROR: Failed to download ${file} from ${url}`);
    }
  }
  
  if (downloadSuccess) {
    ns.tprint("Initial download complete!");
    ns.tprint("Run 'run download-scripts.js' to download all your scripts from GitHub.");
  } else {
    ns.tprint("There were errors during download. Please check your GitHub details.");
  }
}

// Autocomplete handler
export function autocomplete(data, args) {
  return [];
} 