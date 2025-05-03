/** @param {NS} ns */
export async function main(ns) {
  // Simple script to download the daemon and run it with warnings suppressed
  const daemonUrl = "https://raw.githubusercontent.com/skyecraft92/bitburner-v2/main/daemon-smart.js";
  
  // List of required files and their fallbacks
  const requiredFiles = [
    "daemon-smart.js",
    "hacknet-pro.js",
    "upgrade-home.js",
    "stockmaster.js"
  ];
  
  // Fallback scripts to create locally if download fails
  const fallbackScripts = {
    "hacknet-pro.js": "hacknet-basic.js",
    "upgrade-home.js": "home-basic.js",
    "stockmaster.js": "stock-basic.js"
  };
  
  ns.tprint("╔════════════════════════════════════════════╗");
  ns.tprint("║      BITBURNER BOOTSTRAP UTILITY           ║");
  ns.tprint("╠════════════════════════════════════════════╣");
  
  // Create fallback scripts first so they're available if needed
  ns.tprint("Creating fallback scripts...");
  await createFallbackScripts(ns);
  
  // Download the daemon script
  try {
    ns.tprint("Step 1: Downloading daemon-smart.js...");
    const success = await ns.wget(daemonUrl, "daemon-smart.js");
    if (success) {
      ns.tprint("✓ Downloaded daemon-smart.js");
      
      // Now download dependencies
      ns.tprint("\nStep 2: Downloading dependencies...");
      const depPid = ns.run("daemon-smart.js", 1, "--download-deps");
      if (depPid > 0) {
        ns.tprint("Dependencies are being downloaded...");
        
        // Wait for the download process to complete
        while (ns.isRunning(depPid)) {
          await ns.sleep(1000);
        }
        
        // Verify the files exist
        ns.tprint("\nStep 3: Verifying downloaded files...");
        let missingFiles = [];
        for (const file of requiredFiles) {
          if (!ns.fileExists(file)) {
            missingFiles.push(file);
            ns.tprint(`✗ Missing file: ${file}`);
          } else {
            ns.tprint(`✓ Found file: ${file}`);
          }
        }
        
        if (missingFiles.length > 0) {
          ns.tprint("\n⚠️ Warning: Some required files are missing!");
          ns.tprint("Attempting manual download of missing files...");
          
          // Try to download missing files directly
          for (const file of missingFiles) {
            const fileUrl = `https://raw.githubusercontent.com/skyecraft92/bitburner-v2/main/${file}`;
            ns.tprint(`Downloading ${file}...`);
            const fileSuccess = await ns.wget(fileUrl, file);
            
            if (fileSuccess) {
              ns.tprint(`✓ Downloaded ${file}`);
            } else {
              ns.tprint(`✗ Failed to download ${file}`);
              
              // If we have a fallback for this file, use it
              if (fallbackScripts[file]) {
                const fallbackFile = fallbackScripts[file];
                if (ns.fileExists(fallbackFile)) {
                  // Copy the fallback to the expected location
                  await ns.write(file, ns.read(fallbackFile), "w");
                  ns.tprint(`✓ Using fallback: ${fallbackFile} → ${file}`);
                }
              }
            }
          }
        }
        
        // Verify core files exist before starting daemon
        if (ns.fileExists("daemon-smart.js")) {
          // Now run the daemon with suppressed warnings
          ns.tprint("\nStep 4: Starting daemon with warnings suppressed...");
          const daemonPid = ns.run("daemon-smart.js", 1, "--suppress-warnings");
          if (daemonPid > 0) {
            ns.tprint("✓ Daemon started successfully with warnings suppressed!");
          } else {
            ns.tprint("✗ Failed to start the daemon - not enough RAM?");
            ns.tprint("Try running it manually with: run daemon-smart.js --suppress-warnings");
            
            // If we can't start the daemon, try to at least start the basic scripts
            ns.tprint("\nTrying to start essential services directly...");
            
            if (ns.fileExists("hacknet-pro.js") || ns.fileExists("hacknet-basic.js")) {
              const hacknetScript = ns.fileExists("hacknet-pro.js") ? "hacknet-pro.js" : "hacknet-basic.js";
              if (ns.run(hacknetScript, 1) > 0) {
                ns.tprint(`✓ Started ${hacknetScript}`);
              } else {
                ns.tprint(`✗ Failed to start ${hacknetScript} - not enough RAM?`);
              }
            }
            
            if (ns.fileExists("upgrade-home.js") || ns.fileExists("home-basic.js")) {
              const homeScript = ns.fileExists("upgrade-home.js") ? "upgrade-home.js" : "home-basic.js";
              if (ns.run(homeScript, 1, "--suppress-warnings") > 0) {
                ns.tprint(`✓ Started ${homeScript}`);
              } else {
                ns.tprint(`✗ Failed to start ${homeScript} - not enough RAM?`);
              }
            }
            
            if (ns.fileExists("stockmaster.js") || ns.fileExists("stock-basic.js")) {
              const stockScript = ns.fileExists("stockmaster.js") ? "stockmaster.js" : "stock-basic.js";
              if (ns.run(stockScript, 1) > 0) {
                ns.tprint(`✓ Started ${stockScript}`);
              } else {
                ns.tprint(`✗ Failed to start ${stockScript} - not enough RAM?`);
              }
            }
          }
        } else {
          ns.tprint("\n✗ Critical files are missing. Cannot start daemon.");
          ns.tprint("Please check your connection and try again.");
        }
      } else {
        ns.tprint("✗ Failed to download dependencies - not enough RAM?");
        ns.tprint("Try running: run daemon-smart.js --download-deps");
      }
    } else {
      ns.tprint("✗ Failed to download daemon-smart.js");
      ns.tprint("Check your internet connection and try again.");
    }
  } catch (error) {
    ns.tprint(`✗ Error during bootstrap: ${error}`);
  }
}

// Function to create fallback scripts
async function createFallbackScripts(ns) {
  // Basic hacknet manager script
  const hacknetBasic = `/** @param {NS} ns */
export async function main(ns) {
  // Basic hacknet manager - fallback for when hacknet-pro.js is unavailable
  const config = {
    maxNodes: 8,                     // Maximum number of nodes to purchase
    maxLevel: 80,                    // Maximum level to upgrade nodes to
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
    
    return \`$\${amount.toFixed(2)}\${units[unitIndex]}\`;
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
            ns.print(\`Purchased Hacknet Node \${nodeIndex} for \${formatMoney(cost)}\`);
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
          ns.print(\`Upgraded node \${bestNodeIndex} \${bestUpgradeType} for \${formatMoney(bestUpgradeCost)}\`);
        }
      } else {
        // No upgrades available or not enough money
        const totalProduction = ns.hacknet.numNodes() > 0 
          ? Array(ns.hacknet.numNodes()).fill(0)
              .map((_, i) => ns.hacknet.getNodeStats(i).production)
              .reduce((sum, production) => sum + production, 0)
          : 0;
        
        ns.print(\`Total production: \${formatMoney(totalProduction * 60)} / min. Waiting for more money...\`);
      }
      
    } catch (error) {
      ns.print(\`ERROR: \${error}\`);
    }
    
    await ns.sleep(config.cycleTime);
  }
}`;

  // Basic home upgrader script
  const homeBasic = `/** @param {NS} ns */
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
    
    return \`$\${amount.toFixed(2)}\${units[unitIndex]}\`;
  }
  
  // Log message to both log and terminal
  function log(message) {
    ns.print(message);
    ns.tprint(message);
  }
  
  // Get initial stats
  let homeRam = ns.getServerMaxRam("home");
  let cores = ns.getServer("home").cpuCores;
  
  log(\`Starting with \${homeRam}GB RAM and \${cores} cores\`);
  
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
      ns.print(\`Money: \${formatMoney(money)} | Home RAM: \${homeRam}GB | Cores: \${cores}\`);
      
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
        ns.print(\`Need more money for RAM/Core upgrade. Saving up...\`);
      }
      
    } catch (error) {
      log(\`ERROR: \${error}\`);
    }
    
    // Wait before checking again
    await ns.sleep(config.cycleTime);
  }
}`;

  // Basic stock monitor script
  const stockBasic = `/** @param {NS} ns */
export async function main(ns) {
  // Basic stock market script - fallback for stockmaster.js
  // This provides read-only functionality without TIX API
  
  const config = {
    refreshRate: 6000,       // Refresh every 6 seconds
    monitorMode: true        // Monitor only mode (no TIX API needed)
  };
  
  ns.disableLog("ALL");
  ns.tail();
  
  ns.print("╔═════════════════════════════════════════╗");
  ns.print("║         BASIC STOCK MONITOR             ║");
  ns.print("║ Fallback system for stockmaster.js      ║");
  ns.print("╚═════════════════════════════════════════╝");
  
  // Helper to format money
  function formatMoney(amount) {
    const units = ['', 'k', 'm', 'b', 't'];
    let unitIndex = 0;
    
    while (amount >= 1000 && unitIndex < units.length - 1) {
      amount /= 1000;
      unitIndex++;
    }
    
    return \`$\${amount.toFixed(2)}\${units[unitIndex]}\`;
  }
  
  // Format percentage
  function formatPercent(value) {
    return \`\${(value * 100).toFixed(2)}%\`;
  }
  
  // Get basic stock info that doesn't require TIX API
  function getStockInfo(stock) {
    const position = ns.stock.getPosition(stock);
    const price = ns.stock.getPrice(stock);
    const askPrice = ns.stock.getAskPrice(stock);
    const bidPrice = ns.stock.getBidPrice(stock);
    const maxShares = ns.stock.getMaxShares(stock);
    
    // Position information
    const sharesOwned = position[0];
    const avgPx = position[1];
    const shortShares = position[2];
    const avgShortPx = position[3];
    
    // Calculate position value
    const longValue = sharesOwned * bidPrice;
    const shortValue = shortShares * (2 * avgShortPx - askPrice);
    const totalValue = longValue + shortValue;
    
    // Calculate profit
    const longProfit = sharesOwned * (bidPrice - avgPx);
    const shortProfit = shortShares * (avgShortPx - askPrice);
    const totalProfit = longProfit + shortProfit;
    
    return {
      symbol: stock,
      price,
      askPrice,
      bidPrice,
      sharesOwned,
      shortShares,
      longValue,
      shortValue,
      totalValue,
      longProfit,
      shortProfit,
      totalProfit,
      maxShares
    };
  }
  
  function displayStocks() {
    // Get all stock symbols
    const stocks = ns.stock.getSymbols();
    
    // Get stock information
    const stocksInfo = stocks.map(stock => getStockInfo(stock));
    
    // Calculate portfolio stats
    const ownedStocks = stocksInfo.filter(s => s.sharesOwned > 0 || s.shortShares > 0);
    const totalValue = ownedStocks.reduce((sum, s) => sum + s.totalValue, 0);
    const totalProfit = ownedStocks.reduce((sum, s) => sum + s.totalProfit, 0);
    
    // Display portfolio summary
    ns.print("════════ PORTFOLIO SUMMARY ════════");
    ns.print(\`Total Holdings: \${formatMoney(totalValue)}\`);
    ns.print(\`Total Profit: \${formatMoney(totalProfit)}\`);
    ns.print(\`Owned Stocks: \${ownedStocks.length}/\${stocks.length}\`);
    
    // Display owned stocks
    if (ownedStocks.length > 0) {
      ns.print("\n════════ OWNED POSITIONS ════════");
      for (const stock of ownedStocks) {
        if (stock.sharesOwned > 0) {
          const profitPercent = stock.longProfit / (stock.sharesOwned * stock.avgPx);
          ns.print(\`\${stock.symbol} LONG: \${formatMoney(stock.longValue)} | Profit: \${formatMoney(stock.longProfit)} (\${formatPercent(profitPercent)})\`);
        }
        if (stock.shortShares > 0) {
          const profitPercent = stock.shortProfit / (stock.shortShares * stock.avgShortPx);
          ns.print(\`\${stock.symbol} SHORT: \${formatMoney(stock.shortValue)} | Profit: \${formatMoney(stock.shortProfit)} (\${formatPercent(profitPercent)})\`);
        }
      }
    }
    
    // Display top 5 stocks by price
    const topByPrice = [...stocksInfo].sort((a, b) => b.price - a.price).slice(0, 5);
    ns.print("\n════════ TOP BY PRICE ════════");
    for (const stock of topByPrice) {
      ns.print(\`\${stock.symbol}: \${formatMoney(stock.price)}\`);
    }
    
    // Show information about TIX API
    ns.print("\n════════ TIX API INFO ════════");
    ns.print("Basic TIX API costs $1b to purchase from the WSE.");
    ns.print("4S Market Data API costs $5b for advanced analysis.");
    ns.print("Visit World Stock Exchange in the city to purchase.");
    ns.print("Full functionality requires stockmaster.js.");
  }
  
  // Main loop
  while (true) {
    ns.clearLog();
    
    try {
      // Display the current stock information
      displayStocks();
    } catch (error) {
      ns.print(\`ERROR: \${error}\`);
    }
    
    await ns.sleep(config.refreshRate);
  }
}`;

  // Write the fallback scripts
  await ns.write("hacknet-basic.js", hacknetBasic, "w");
  await ns.write("home-basic.js", homeBasic, "w");
  await ns.write("stock-basic.js", stockBasic, "w");
} 