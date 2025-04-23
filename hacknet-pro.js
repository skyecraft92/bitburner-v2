/** @param {NS} ns */
export async function main(ns) {
  // Configuration options
  const config = {
    maxPayoffTime: 60 * 60,    // Maximum payoff time in seconds (default: 1 hour)
    runContinuously: true,     // Whether to run continuously
    interval: 1000,            // Milliseconds between upgrade checks when running continuously
    maxSpend: Number.MAX_VALUE, // Maximum amount to spend on upgrades (default: unlimited)
    showToasts: true,          // Show toast notifications for purchases
    reserveMoney: 100000,      // Keep this much money in reserve
    priorityThreshold: 5 * 60, // Threshold in seconds for high-priority upgrades (default: 5 minutes)
    autoSellHashes: true,      // Automatically sell hashes for money
    upgradeStrategy: "balanced", // Can be "level", "ram", "cores", "balanced", or "optimal"
    targetNodes: 8,            // Aim to get this many nodes before focusing on upgrades
    logLevel: 1                // 0=minimal, 1=normal, 2=verbose
  };
  
  // Formatting helper functions
  function formatMoney(amount) {
    const units = ['', 'k', 'm', 'b', 't', 'q'];
    let unitIndex = 0;
    
    while (amount >= 1000 && unitIndex < units.length - 1) {
      amount /= 1000;
      unitIndex++;
    }
    
    return `$${amount.toFixed(2)}${units[unitIndex]}`;
  }
  
  function formatTime(seconds) {
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  }
  
  // Helper function for logging based on log level
  function log(message, level = 1) {
    if (level <= config.logLevel) {
      ns.print(message);
      if (level === 0) {
        ns.tprint(message);
      }
    }
  }
  
  // Function to calculate node production
  function calculateNodeProduction(level, ram, cores) {
    const levelMult = level * 1.5;
    const ramMult = Math.pow(1.035, ram - 1);
    const coresMult = (cores + 5) / 6;
    return levelMult * ramMult * coresMult;
  }
  
  // Function to get all possible upgrades for all nodes
  function getUpgrades() {
    const nodeCount = ns.hacknet.numNodes();
    const upgrades = [];
    
    // Consider purchasing a new node
    if (nodeCount < ns.hacknet.maxNumNodes()) {
      const cost = ns.hacknet.getPurchaseNodeCost();
      // Estimate production based on a level 1 node
      const production = calculateNodeProduction(1, 1, 1);
      upgrades.push({
        type: "purchase",
        node: nodeCount,
        cost: cost,
        production: production,
        payoffTime: cost / (production * hashValue()),
        priority: nodeCount < config.targetNodes ? "high" : "normal"
      });
    }
    
    // Consider upgrading existing nodes
    for (let i = 0; i < nodeCount; i++) {
      const nodeStats = ns.hacknet.getNodeStats(i);
      
      // Level upgrade
      const levelCost = ns.hacknet.getLevelUpgradeCost(i, 1);
      if (levelCost !== Infinity) {
        const currentProduction = calculateNodeProduction(nodeStats.level, nodeStats.ram, nodeStats.cores);
        const newProduction = calculateNodeProduction(nodeStats.level + 1, nodeStats.ram, nodeStats.cores);
        const levelProduction = newProduction - currentProduction;
        
        upgrades.push({
          type: "level",
          node: i,
          cost: levelCost,
          production: levelProduction,
          payoffTime: levelCost / (levelProduction * hashValue()),
          priority: (config.upgradeStrategy === "level" || config.upgradeStrategy === "balanced") ? "high" : "normal"
        });
      }
      
      // RAM upgrade
      const ramCost = ns.hacknet.getRamUpgradeCost(i, 1);
      if (ramCost !== Infinity) {
        const currentProduction = calculateNodeProduction(nodeStats.level, nodeStats.ram, nodeStats.cores);
        const newProduction = calculateNodeProduction(nodeStats.level, nodeStats.ram * 2, nodeStats.cores);
        const ramProduction = newProduction - currentProduction;
        
        upgrades.push({
          type: "ram",
          node: i,
          cost: ramCost,
          production: ramProduction,
          payoffTime: ramCost / (ramProduction * hashValue()),
          priority: (config.upgradeStrategy === "ram" || config.upgradeStrategy === "balanced") ? "high" : "normal"
        });
      }
      
      // Cores upgrade
      const coresCost = ns.hacknet.getCoreUpgradeCost(i, 1);
      if (coresCost !== Infinity) {
        const currentProduction = calculateNodeProduction(nodeStats.level, nodeStats.ram, nodeStats.cores);
        const newProduction = calculateNodeProduction(nodeStats.level, nodeStats.ram, nodeStats.cores + 1);
        const coresProduction = newProduction - currentProduction;
        
        upgrades.push({
          type: "cores",
          node: i,
          cost: coresCost,
          production: coresProduction,
          payoffTime: coresCost / (coresProduction * hashValue()),
          priority: (config.upgradeStrategy === "cores" || config.upgradeStrategy === "balanced") ? "high" : "normal"
        });
      }
    }
    
    return upgrades;
  }
  
  // Function to get the value of hashes
  function hashValue() {
    // The typical conversion is about $1M per 4 hashes when selling for money
    return 250000; // $250k per hash per second
  }
  
  // Function to sell hashes for money
  async function sellHashes() {
    if (!config.autoSellHashes) return;
    
    try {
      // Check if we have hashes to sell
      const currentHashes = ns.hacknet.numHashes();
      const hashCapacity = ns.hacknet.hashCapacity();
      
      // If we're over 90% capacity, sell hashes
      if (currentHashes > hashCapacity * 0.9) {
        const amountToSell = Math.floor((currentHashes - hashCapacity * 0.5) / 4); // Keep 50% capacity
        
        if (amountToSell > 0) {
          // Try to sell hashes for money
          for (let i = 0; i < amountToSell; i++) {
            ns.hacknet.spendHashes("Sell for Money");
          }
          
          log(`Sold ${amountToSell * 4} hashes for approximately ${formatMoney(amountToSell * 1000000)}`, 1);
        }
      }
    } catch (error) {
      // This will happen if we're not in BitNode 9 or don't have hacknet servers yet
      // Just ignore the error
    }
  }
  
  // Function to buy the best upgrade
  async function buyBestUpgrade() {
    const upgrades = getUpgrades();
    
    if (upgrades.length === 0) {
      log("No available upgrades", 1);
      return false;
    }
    
    // Sort upgrades by payoff time (best to worst)
    upgrades.sort((a, b) => {
      // First prioritize by priority
      if (a.priority === "high" && b.priority !== "high") return -1;
      if (a.priority !== "high" && b.priority === "high") return 1;
      
      // Then by payoff time
      return a.payoffTime - b.payoffTime;
    });
    
    // Get the best upgrade
    const bestUpgrade = upgrades[0];
    
    // Skip if payoff time is too long
    if (bestUpgrade.payoffTime > config.maxPayoffTime) {
      log(`Best upgrade (${bestUpgrade.type} for node-${bestUpgrade.node}) has payoff time ${formatTime(bestUpgrade.payoffTime)}, which exceeds limit`, 1);
      return false;
    }
    
    // Skip if cost exceeds max spend
    if (bestUpgrade.cost > config.maxSpend) {
      log(`Best upgrade costs ${formatMoney(bestUpgrade.cost)}, which exceeds spending limit`, 1);
      return false;
    }
    
    // Skip if we don't have enough money
    const availableMoney = ns.getPlayer().money - config.reserveMoney;
    if (bestUpgrade.cost > availableMoney) {
      log(`Cannot afford best upgrade: ${formatMoney(bestUpgrade.cost)} (have ${formatMoney(availableMoney)})`, 1);
      return false;
    }
    
    // Purchase the upgrade
    let success = false;
    if (bestUpgrade.type === "purchase") {
      const nodeIndex = ns.hacknet.purchaseNode();
      success = nodeIndex !== -1;
      if (success) {
        log(`Purchased new hacknet node (node-${nodeIndex}) for ${formatMoney(bestUpgrade.cost)}`, 0);
        if (config.showToasts) {
          ns.toast(`Purchased hacknet node-${nodeIndex} for ${formatMoney(bestUpgrade.cost)}`, "success");
        }
      }
    } else if (bestUpgrade.type === "level") {
      success = ns.hacknet.upgradeLevel(bestUpgrade.node, 1);
      if (success) {
        const nodeStats = ns.hacknet.getNodeStats(bestUpgrade.node);
        log(`Upgraded level of hacknet node-${bestUpgrade.node} to ${nodeStats.level} for ${formatMoney(bestUpgrade.cost)}`, 0);
        if (config.showToasts) {
          ns.toast(`Upgraded hacknet node-${bestUpgrade.node} level to ${nodeStats.level}`, "success");
        }
      }
    } else if (bestUpgrade.type === "ram") {
      success = ns.hacknet.upgradeRam(bestUpgrade.node, 1);
      if (success) {
        const nodeStats = ns.hacknet.getNodeStats(bestUpgrade.node);
        log(`Upgraded RAM of hacknet node-${bestUpgrade.node} to ${nodeStats.ram}GB for ${formatMoney(bestUpgrade.cost)}`, 0);
        if (config.showToasts) {
          ns.toast(`Upgraded hacknet node-${bestUpgrade.node} RAM to ${nodeStats.ram}GB`, "success");
        }
      }
    } else if (bestUpgrade.type === "cores") {
      success = ns.hacknet.upgradeCore(bestUpgrade.node, 1);
      if (success) {
        const nodeStats = ns.hacknet.getNodeStats(bestUpgrade.node);
        log(`Upgraded cores of hacknet node-${bestUpgrade.node} to ${nodeStats.cores} for ${formatMoney(bestUpgrade.cost)}`, 0);
        if (config.showToasts) {
          ns.toast(`Upgraded hacknet node-${bestUpgrade.node} cores to ${nodeStats.cores}`, "success");
        }
      }
    }
    
    return success ? bestUpgrade.cost : false;
  }
  
  // Display Hacknet Stats in a nice format
  function displayHacknetStats() {
    const nodeCount = ns.hacknet.numNodes();
    let totalProduction = 0;
    let totalMoney = 0;
    
    ns.print("╔═══════════════════════════════════════════╗");
    ns.print("║           HACKNET NETWORK STATUS           ║");
    ns.print("╠═══════╦════════╦══════╦═══════╦════════════╣");
    ns.print("║ NODE  ║ LEVEL  ║ RAM  ║ CORES ║ PRODUCTION ║");
    ns.print("╠═══════╬════════╬══════╬═══════╬════════════╣");
    
    for (let i = 0; i < nodeCount; i++) {
      const stats = ns.hacknet.getNodeStats(i);
      totalProduction += stats.production;
      totalMoney += stats.totalProduction;
      
      ns.print(`║ ${i.toString().padStart(5)} ║ ${stats.level.toString().padStart(6)} ║ ${stats.ram.toString().padStart(4)} ║ ${stats.cores.toString().padStart(5)} ║ ${stats.production.toFixed(2).padStart(10)} ║`);
    }
    
    ns.print("╠═══════╩════════╩══════╩═══════╩════════════╣");
    ns.print(`║ TOTAL PRODUCTION: ${totalProduction.toFixed(2).padStart(21)} ║`);
    ns.print(`║ LIFETIME HASHES:  ${totalMoney.toFixed(2).padStart(21)} ║`);
    
    // If we have hash capacity, show hash info
    try {
      const currentHashes = ns.hacknet.numHashes();
      const hashCapacity = ns.hacknet.hashCapacity();
      ns.print(`║ CURRENT HASHES:   ${currentHashes.toFixed(2).padStart(21)} ║`);
      ns.print(`║ HASH CAPACITY:    ${hashCapacity.toFixed(2).padStart(21)} ║`);
      ns.print(`║ CAPACITY USED:    ${(currentHashes / hashCapacity * 100).toFixed(1).padStart(20)}% ║`);
    } catch (e) {
      // If this fails, we're probably not in a Hacknet Servers bitnode
    }
    
    ns.print("╚═══════════════════════════════════════════╝");
  }
  
  // Initialize
  ns.disableLog("ALL");
  ns.tail();
  
  // Display header
  ns.tprint("╔═════════════════════════════════════════╗");
  ns.tprint("║        HACKNET PRO MANAGER STARTED      ║");
  ns.tprint("║      Optimal hacknet node management    ║");
  ns.tprint("╚═════════════════════════════════════════╝");
  
  let totalSpent = 0;
  let lastDisplayTime = 0;
  
  // Main loop
  while (true) {
    try {
      // Sell hashes if needed
      await sellHashes();
      
      // Display stats periodically (every 10 seconds)
      const currentTime = Date.now();
      if (currentTime - lastDisplayTime >= 10000) {
        displayHacknetStats();
        lastDisplayTime = currentTime;
      }
      
      // Buy best upgrade
      const spent = await buyBestUpgrade();
      
      // If we bought something, adjust variables
      if (spent !== false) {
        totalSpent += spent;
        config.maxSpend -= spent;
        
        // If we can't spend any more, exit continuous mode
        if (config.maxSpend <= 0) {
          log(`Reached maximum spending limit of ${formatMoney(totalSpent)}. Exiting.`, 0);
          break;
        }
      } else if (!config.runContinuously) {
        // If nothing to buy and not running continuously, exit
        log(`No more upgrades within payoff time limit. Total spent: ${formatMoney(totalSpent)}`, 0);
        break;
      }
      
      // Sleep between checks
      await ns.sleep(config.interval);
    } catch (error) {
      log(`ERROR: ${error}`, 0);
      await ns.sleep(5000);
    }
  }
  
  return totalSpent;
} 