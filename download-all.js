/** @param {NS} ns */
export async function main(ns) {
  // List of scripts to download
  const scripts = [
    "daemon-smart.js",
    "hacknet-pro.js",
    "upgrade-home.js",
    "stockmaster.js",
    "sleeve.js",
    "bladeburner.js"
  ];
  
  // GitHub raw content URL prefix (update this if needed)
  const githubPrefix = "https://raw.githubusercontent.com/yourusername/bitburnerFiles/main/";
  
  // Download each script
  let successCount = 0;
  
  ns.tprint("╔════════════════════════════════════════╗");
  ns.tprint("║       DOWNLOADING SCRIPT PACKAGE       ║");
  ns.tprint("╠════════════════════════════════════════╣");
  
  for (const script of scripts) {
    const url = githubPrefix + script;
    
    try {
      await ns.wget(url, script);
      ns.tprint(`✓ Downloaded ${script}`);
      successCount++;
    } catch (error) {
      ns.tprint(`✗ Failed to download ${script}: ${error}`);
    }
    
    // Wait a bit between downloads
    await ns.sleep(300);
  }
  
  ns.tprint("╠════════════════════════════════════════╣");
  ns.tprint(`║ ${successCount}/${scripts.length} scripts downloaded successfully   ║`);
  ns.tprint("╚════════════════════════════════════════╝");
  
  // Instructions for using the daemon
  if (successCount > 0) {
    ns.tprint("\nTo start the smart daemon system:");
    ns.tprint("run daemon-smart.js");
  }
} 