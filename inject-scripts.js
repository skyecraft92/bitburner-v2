/** @param {NS} ns */
export async function main(ns) {
  // List of scripts to inject into the game
  const scriptFiles = [
    "daemon-smart.js",
    "hacknet-pro.js",
    "upgrade-home.js",
    "stockmaster.js", 
    "sleeve.js",
    "bladeburner.js"
  ];
  
  ns.tprint("╔════════════════════════════════════════════╗");
  ns.tprint("║       INJECTING SCRIPTS INTO GAME          ║");
  ns.tprint("╠════════════════════════════════════════════╣");
  
  let successCount = 0;
  
  for (const scriptFile of scriptFiles) {
    try {
      // Read the file content directly
      const fileContent = ns.read(scriptFile);
      
      if (!fileContent || fileContent.length === 0) {
        ns.tprint(`❌ Could not read ${scriptFile} or file is empty`);
        continue;
      }
      
      // Write the file to the game
      await ns.write(scriptFile, fileContent, "w");
      ns.tprint(`✅ Injected ${scriptFile}`);
      successCount++;
    } catch (error) {
      ns.tprint(`❌ Error injecting ${scriptFile}: ${error}`);
    }
  }
  
  ns.tprint("╠════════════════════════════════════════════╣");
  ns.tprint(`║ ${successCount}/${scriptFiles.length} scripts injected successfully   ║`);
  ns.tprint("╚════════════════════════════════════════════╝");
  
  // Instructions
  if (successCount > 0) {
    ns.tprint("\nTo run the daemon, use: run daemon-smart.js");
  } else {
    ns.tprint("\nNo scripts were successfully injected. Please check file paths.");
  }
} 