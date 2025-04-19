/** @param {NS} ns */
export async function main(ns) {
  // GitHub repository details
  const githubUsername = "skyecraft92"; 
  const repositoryName = "bitburner-v2"; 
  const branchName = "main"; 
  
  // Run the git-pull.js script with your GitHub details
  ns.tprint("Downloading files from GitHub repository...");
  ns.exec("git-pull.js", "home", 1, 
    "--github", githubUsername,
    "--repository", repositoryName, 
    "--branch", branchName);
  
  ns.tprint("Download process started. Check logs for details.");
}

// Autocomplete handler
export function autocomplete(data, args) {
  return [];
} 