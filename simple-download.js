/** @param {NS} ns */
export async function main(ns) {
  // Minimal version to copy manually into the game to get started
  const url = "https://raw.githubusercontent.com/skyecraft92/bitburner-v2/main/daemon-smart.js";
  
  ns.tprint("Downloading daemon-smart.js...");
  
  try {
    const success = await ns.wget(url, "daemon-smart.js");
    
    if (success) {
      ns.tprint("✓ Downloaded daemon-smart.js successfully!");
      ns.tprint("\nNext, download the core scripts with:");
      ns.tprint("run daemon-smart.js --download-deps");
    } else {
      ns.tprint("✗ Failed to download daemon-smart.js");
    }
  } catch (error) {
    ns.tprint(`✗ Error: ${error}`);
  }
} 