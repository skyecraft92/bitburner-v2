/** @param {NS} ns */
export async function main(ns) {
  // The URL to your GitHub repository (raw files)
  // This is the correct URL for your repository
  const githubUrl = "https://raw.githubusercontent.com/skyecraft92/bitburner-v2/main/";
  
  // The critical files to get the system running
  const files = [
    "daemon-smart.js",
    "hacknet-pro.js",
    "upgrade-home.js"
  ];
  
  // Optional advanced files
  const advancedFiles = [
    "stockmaster.js",
    "sleeve.js",
    "bladeburner.js",
    "helpers.js"
  ];
  
  ns.tprint("╔════════════════════════════════════════════╗");
  ns.tprint("║       BOOTSTRAP SCRIPT DOWNLOADER          ║");
  ns.tprint("╠════════════════════════════════════════════╣");
  ns.tprint(`║ Source: ${githubUrl}       ║`);
  ns.tprint("╠════════════════════════════════════════════╣");
  
  ns.tprint("Downloading core files...");
  await downloadFiles(ns, files, githubUrl);
  
  ns.tprint("Downloading advanced files...");
  await downloadFiles(ns, advancedFiles, githubUrl);
  
  ns.tprint("╠════════════════════════════════════════════╣");
  ns.tprint("║             BOOTSTRAP COMPLETE             ║");
  ns.tprint("╚════════════════════════════════════════════╝");
  
  ns.tprint("\nRun the daemon with: run daemon-smart.js");
}

/**
 * Download multiple files from GitHub
 * @param {NS} ns - The NetScript API
 * @param {string[]} fileList - List of files to download
 * @param {string} baseUrl - Base URL for GitHub raw content
 */
async function downloadFiles(ns, fileList, baseUrl) {
  for (const file of fileList) {
    const url = baseUrl + file;
    
    try {
      const success = await ns.wget(url, file);
      
      if (success) {
        ns.tprint(`✓ Downloaded ${file}`);
      } else {
        ns.tprint(`✗ Failed to download ${file}`);
      }
    } catch (error) {
      ns.tprint(`✗ Error downloading ${file}: ${error}`);
    }
    
    // Small delay between downloads
    await ns.sleep(300);
  }
} 