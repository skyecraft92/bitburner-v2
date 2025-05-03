/** @param {NS} ns */
export async function main(ns) {
  // Basic hacknet manager - fallback for when hacknet-pro.js is unavailable
  const config = {
    maxNodes: 8,                     // Maximum number of nodes to purchase
    maxLevel: 80,                     // Maximum level to upgrade nodes to
    maxRam: 16,                      // Maximum RAM to upgrade nodes to
    maxCores: 4,                     // Maximum cores to upgrade nodes to
    reserveMoney: 100000,            // Money to keep in reserve
    cycleTime: 5000,                 // Time between cycles in milliseconds
    upgradeBudgetPercent: 0.25       // What percent of money to spend on upgrades
  };
  
  ns.disableLog("ALL");
  ns.tail();
  
  ns.print("╔═════════════════════════════════════════╗");
  ns.print("║         BASIC HACKNET MANAGER           ║");
  ns.print("║ Fallback system for hacknet-pro.js      ║");
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
  
  // Main loop
  while (true) {
    try {
      const numNodes = ns.hacknet.numNodes();
      const money = ns.getPlayer().money;
      const spendingBudget = (money - config.reserveMoney) * config.upgradeBudgetPercent;
      
      // Buy a new node if we're under the limit
      if (numNodes < config.maxNodes) {
        const cost = ns.hacknet.getPurchaseNodeCost();
        if (spendingBudget > cost) {
          const nodeIndex = ns.hacknet.purchaseNode();
          if (nodeIndex !== -1) {
            ns.print(`Purchased Hacknet Node ${nodeIndex} for ${formatMoney(cost)}`);
            continue; // Skip to next cycle
          }
        }
      }
      
      // Choose the best upgrade
      let bestUpgradeValue = 0;
      let bestUpgradeType = null;
      let bestNodeIndex = -1;
      let bestUpgradeCost = Infinity;
      
      // Check each node for possible upgrades
      for (let i = 0; i < numNodes; i++) {
        const nodeStats = ns.hacknet.getNodeStats(i);
        
        // Check level upgrade
        if (nodeStats.level < config.maxLevel) {
          const levelCost = ns.hacknet.getLevelUpgradeCost(i, 1);
          const levelValue = 1.5 / levelCost; // Approximation of value
          
          if (levelValue > bestUpgradeValue && levelCost < spendingBudget) {
            bestUpgradeValue = levelValue;
            bestUpgradeType = "level";
            bestNodeIndex = i;
            bestUpgradeCost = levelCost;
          }
        }
        
        // Check RAM upgrade
        if (nodeStats.ram < config.maxRam) {
          const ramCost = ns.hacknet.getRamUpgradeCost(i, 1);
          const ramValue = 1.75 / ramCost; // Approximation of value
          
          if (ramValue > bestUpgradeValue && ramCost < spendingBudget) {
            bestUpgradeValue = ramValue;
            bestUpgradeType = "ram";
            bestNodeIndex = i;
            bestUpgradeCost = ramCost;
          }
        }
        
        // Check core upgrade
        if (nodeStats.cores < config.maxCores) {
          const coreCost = ns.hacknet.getCoreUpgradeCost(i, 1);
          const coreValue = 1 / coreCost; // Approximation of value
          
          if (coreValue > bestUpgradeValue && coreCost < spendingBudget) {
            bestUpgradeValue = coreValue;
            bestUpgradeType = "core";
            bestNodeIndex = i;
            bestUpgradeCost = coreCost;
          }
        }
      }
      
      // Perform the best upgrade
      if (bestUpgradeType !== null) {
        let success = false;
        
        switch (bestUpgradeType) {
          case "level":
            success = ns.hacknet.upgradeLevel(bestNodeIndex, 1);
            break;
          case "ram":
            success = ns.hacknet.upgradeRam(bestNodeIndex, 1);
            break;
          case "core":
            success = ns.hacknet.upgradeCore(bestNodeIndex, 1);
            break;
        }
        
        if (success) {
          ns.print(`Upgraded node ${bestNodeIndex} ${bestUpgradeType} for ${formatMoney(bestUpgradeCost)}`);
        }
      } else {
        // No upgrades available or not enough money
        const totalProduction = ns.hacknet.numNodes() > 0 
          ? Array(ns.hacknet.numNodes()).fill(0)
              .map((_, i) => ns.hacknet.getNodeStats(i).production)
              .reduce((sum, production) => sum + production, 0)
          : 0;
        
        ns.print(`Total production: ${formatMoney(totalProduction * 60)} / min. Waiting for more money...`);
      }
      
    } catch (error) {
      ns.print(`ERROR: ${error}`);
    }
    
    await ns.sleep(config.cycleTime);
  }
} 