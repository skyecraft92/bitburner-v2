/** @param {NS} ns */
export async function main(ns) {
  // Basic home computer upgrade script - fallback for upgrade-home.js
  const config = {
    keepMoney: 100000,    // How much money to keep in reserve (100k)
    cycleTime: 5000       // Time to wait between upgrade checks (ms)
  };
  
  ns.disableLog("ALL");
  ns.tail();
  
  ns.print("╔═════════════════════════════════════════╗");
  ns.print("║       BASIC HOME UPGRADER               ║");
  ns.print("║ Fallback system for upgrade-home.js     ║");
  ns.print("╚═════════════════════════════════════════╝");
  
  // Helper to format money
  function formatMoney(amount) {
    const units = ['', 'k', 'm', 'b', 't'];
    let unitIndex = 0;
    
    while (amount >= 1000 && unitIndex < units.length - 1) {
      amount /= 1000;
      unitIndex++;
    }
    
    return `$${amount.toFixed(2)}${units[unitIndex]}`;
  }
  
  // Log message to both log and terminal
  function log(message) {
    ns.print(message);
    ns.tprint(message);
  }
  
  // Get initial stats
  let homeRam = ns.getServerMaxRam("home");
  let cores = ns.getServer("home").cpuCores;
  
  log(`Starting with ${homeRam}GB RAM and ${cores} cores`);
  
  // Main loop
  while (true) {
    try {
      // Get current player money
      const money = ns.getPlayer().money;
      const reserveMoney = config.keepMoney;
      
      // Update current home specs
      homeRam = ns.getServerMaxRam("home");
      cores = ns.getServer("home").cpuCores;
      
      // Display status
      ns.print(`Money: ${formatMoney(money)} | Home RAM: ${homeRam}GB | Cores: ${cores}`);
      
      // ===== BASIC FUNCTIONALITY - NO SINGULARITY API NEEDED =====
      // This only provides information, it doesn't perform upgrades
      // The Singularity API (SF-4) is required for actual upgrades
      
      // Calculate what would be possible if we had Singularity API
      const possibleRamUpgrade = money > reserveMoney + 200000;
      const possibleCoreUpgrade = money > reserveMoney + 1000000;
      
      if (possibleRamUpgrade || possibleCoreUpgrade) {
        ns.print("You appear to have enough money for an upgrade!");
        ns.print("Upgrades require Source-File 4 (Singularity API) to perform automatically.");
        ns.print("You can manually upgrade RAM and cores in the City > Alpha Enterprises.");
      } else {
        // Not enough money for any upgrades
        ns.print(`Need more money for RAM/Core upgrade. Saving up...`);
      }
      
    } catch (error) {
      log(`ERROR: ${error}`);
    }
    
    // Wait before checking again
    await ns.sleep(config.cycleTime);
  }
} 