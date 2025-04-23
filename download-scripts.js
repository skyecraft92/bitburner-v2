/** @param {NS} ns */
export async function main(ns) {
  // List of scripts to download
  const scripts = [
    "daemon-smart.js",
    "hacknet-pro.js",
    "upgrade-home.js",
    "stockmaster.js",
    "sleeve.js",
    "bladeburner.js",
    "hacknet-upgrade-manager.js",
    "daemon.js",
    "helpers.js"
  ];

  // Detect URL from local file system
  // This assumes this script is being run in the context of the current workspace
  const currentFilePath = ns.getScriptName();
  const currentDirectory = ns.getHostname();
  
  // Base URL for raw GitHub content - modify with your actual GitHub username and repository
  const baseUrl = "https://raw.githubusercontent.com/skyec/bitburnerFiles-1/main/";

  // Download each script
  ns.tprint("╔═════════════════════════════════════════════╗");
  ns.tprint("║ DOWNLOADING SCRIPTS TO BITBURNER            ║");
  ns.tprint("╠═════════════════════════════════════════════╣");
  ns.tprint(`║ Source: ${baseUrl}                  ║`);
  ns.tprint("╠═════════════════════════════════════════════╣");

  let successCount = 0;
  let failCount = 0;

  for (const script of scripts) {
    try {
      // Try to download the script
      const url = `${baseUrl}${script}`;
      const success = await ns.wget(url, script);
      
      if (success) {
        ns.tprint(`✅ Downloaded ${script}`);
        successCount++;
      } else {
        ns.tprint(`❌ Failed to download ${script}`);
        failCount++;
      }
    } catch (error) {
      ns.tprint(`❌ Error downloading ${script}: ${error}`);
      failCount++;
    }
    
    // Small delay between downloads
    await ns.sleep(300);
  }

  // Summary
  ns.tprint("╠═════════════════════════════════════════════╣");
  ns.tprint(`║ Download complete: ${successCount} success, ${failCount} failed ║`);
  ns.tprint("╚═════════════════════════════════════════════╝");
  
  // Provide instructions for running the daemon
  if (successCount > 0) {
    ns.tprint("\nTo run the smart daemon, use: run daemon-smart.js");
    ns.tprint("\nMake sure all scripts downloaded successfully!");
  }
}

// Autocomplete handler
export function autocomplete(data, args) {
  return [];
} 