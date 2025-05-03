/** @param {NS} ns */
export async function main(ns) {
  const REMOTE_DAEMON_URL = "https://raw.githubusercontent.com/skyecraft92/bitburner-v2/main/daemon-smart.js";
  const LOCAL_DAEMON_FILE = "daemon-smart.js";
  const LOCAL_VERSION_FILE = "daemon-version.txt";
  const REMOTE_VERSION_REGEX = /export const DAEMON_VERSION = "([^\"]+)";/; // Regex to find version
  
  // List of required files and their fallbacks (primary file first)
  const requiredFiles = [
    LOCAL_DAEMON_FILE, // Ensure daemon is listed first
    "hacknet-pro.js",
    "upgrade-home.js",
    "stockmaster.js"
  ];
  
  // Fallback scripts to create locally if download fails or main script can't run
  const fallbackScripts = {
    "hacknet-pro.js": "hacknet-basic.js",
    "upgrade-home.js": "home-basic.js",
    "stockmaster.js": "stock-basic.js"
  };
  
  ns.tprint("╔════════════════════════════════════════════╗");
  ns.tprint("║      BITBURNER BOOTSTRAP UTILITY v1.6      ║"); // Bumped bootstrap version
  ns.tprint("╠════════════════════════════════════════════╣");
  
  // Create fallback script content first (doesn't write files yet)
  ns.tprint("Preparing fallback scripts definitions...");
  const fallbackContent = createFallbackScriptsDefinitions(ns); // Renamed function
  
  // --- Version Check --- 
  ns.tprint("\nStep 1: Checking for updates...");
  const localVersion = await getLocalVersion(ns);
  const remoteVersionResult = await getRemoteVersion(ns); 
  const remoteVersion = remoteVersionResult.version;

  ns.tprint(` -> Local version: ${localVersion || 'Not found'}`);
  ns.tprint(` -> Remote version: ${remoteVersion || 'Could not fetch'}`);

  let needsUpdate = false;
  if (!remoteVersion) {
      ns.tprint("⚠️ Could not fetch remote version. Will use local if available.");
  } else {
      needsUpdate = (!localVersion || localVersion !== remoteVersion);
  }

  let daemonDownloaded = false;
  let dependenciesDownloaded = false;
  let initialDownloadFailed = false;

  if (needsUpdate && remoteVersion) {
    ns.tprint(`Updating daemon from ${localVersion || 'none'} to ${remoteVersion}...`);
    try {
      const downloadSuccess = await ns.wget(REMOTE_DAEMON_URL, LOCAL_DAEMON_FILE);
      if (downloadSuccess) {
        ns.tprint(`✓ Downloaded ${LOCAL_DAEMON_FILE}`);
        await saveLocalVersion(ns, remoteVersion);
        daemonDownloaded = true;

        // Trigger dependency download after updating daemon
        ns.tprint("\nStep 2: Downloading dependencies for new version...");
        const depPid = ns.run(LOCAL_DAEMON_FILE, 1, "--download-deps");
        if (depPid > 0) {
          ns.tprint(" -> Dependency download process started...");
          while (ns.isRunning(depPid)) {
            await ns.sleep(1000);
          }
          ns.tprint("✓ Dependency download process finished.");
          dependenciesDownloaded = true;
        } else {
          ns.tprint("✗ Failed to start dependency download - not enough RAM?");
          ns.tprint("   Run manually: run daemon-smart.js --download-deps");
        }
      } else {
        ns.tprint(`✗ Failed to download ${LOCAL_DAEMON_FILE}. Will try to use local version if available.`);
        initialDownloadFailed = true;
      }
    } catch (error) {
        ns.tprint(`✗ Error during daemon download: ${error}`);
        initialDownloadFailed = true;
    }
  } else if (localVersion) {
      ns.tprint(`✓ Daemon is up-to-date (Version: ${localVersion})`);
  } else {
      // No local version, and couldn't fetch remote version - try downloading anyway
      ns.tprint("No local version found. Attempting initial download...");
      try {
          const downloadSuccess = await ns.wget(REMOTE_DAEMON_URL, LOCAL_DAEMON_FILE);
          if (downloadSuccess) {
              ns.tprint(`✓ Downloaded ${LOCAL_DAEMON_FILE} (version unknown)`);
              // We don't know the version, so can't save it
              daemonDownloaded = true;
              // Attempt dependency download
              ns.tprint("\nStep 2: Downloading dependencies...");
              const depPid = ns.run(LOCAL_DAEMON_FILE, 1, "--download-deps");
              if (depPid > 0) { /* ... wait ... */ while (ns.isRunning(depPid)) await ns.sleep(1000); dependenciesDownloaded = true; } 
              else ns.tprint("✗ Failed to start dependency download.");
          } else {
              ns.tprint(`✗ Failed to download ${LOCAL_DAEMON_FILE}.`);
              initialDownloadFailed = true;
          }
      } catch (error) {
          ns.tprint(`✗ Error during initial download: ${error}`);
          initialDownloadFailed = true;
      }
  }

  // --- Verification and Fallback Handling --- 
  ns.tprint("\nStep 3: Verifying required files...");
  
  // First, ensure daemon exists if we didn't just download it or if download failed
  if (!ns.fileExists(LOCAL_DAEMON_FILE)) {
       ns.tprint(`✗ CRITICAL: ${LOCAL_DAEMON_FILE} is missing and download failed. Cannot continue.`);
       // Try to write a basic version file as last resort? No, too complex.
       return; 
  }
  
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
      ns.tprint("\n⚠️ Some required files are missing!");
      // Only try manual download if dependency download didn't run or failed
      if (!dependenciesDownloaded) {
          ns.tprint("Attempting manual download of missing files...");
          for (const file of missingFiles) {
              if (file === LOCAL_DAEMON_FILE) continue; // Already handled daemon download
              const fileUrl = `https://raw.githubusercontent.com/skyecraft92/bitburner-v2/main/${file}`;
              ns.tprint(`Downloading ${file}...`);
              const fileSuccess = await ns.wget(fileUrl, file);
              if (fileSuccess) {
                  ns.tprint(`✓ Downloaded ${file}`);
                  // Remove from missing list if successful
                  missingFiles = missingFiles.filter(f => f !== file);
              } else {
                  ns.tprint(`✗ Failed to download ${file}`);
              }
          }
      } else {
          ns.tprint("Dependency download ran, assuming files should exist or have fallbacks.");
      }

      // Apply fallbacks for any *still* missing files
      if (missingFiles.length > 0) {
          ns.tprint("\nApplying fallbacks for remaining missing files...");
          for (const missingFile of missingFiles) {
              if (fallbackScripts[missingFile]) {
                  const fallbackName = fallbackScripts[missingFile];
                  if (fallbackContent[fallbackName]) { // Check if fallback content exists
                      try {
                          ns.tprint(`Writing fallback content from '${fallbackName}' into -> ${missingFile}`);
                          // Ensure we write the fallback content INTO the missing primary file
                          await ns.write(missingFile, fallbackContent[fallbackName], "w"); 
                          ns.tprint(`✓ Applied fallback for ${missingFile}`);
                          // Verify the file was written
                           if (!ns.fileExists(missingFile)) { 
                               ns.tprint(`✗ ERROR: Failed to write fallback file ${missingFile}`);
                           } else {
                              // If fallback was applied successfully, remove from missing list
                              missingFiles = missingFiles.filter(f => f !== missingFile);
                              ns.tprint(` -> ${missingFile} now exists.`);
                           }
                      } catch (error) {
                           ns.tprint(`✗ ERROR writing fallback for ${missingFile}: ${error}`);
                      }
                  } else {
                      ns.tprint(`✗ Fallback content definition missing for ${fallbackName}`);
                  }
              } else {
                  ns.tprint(`- No fallback defined for ${missingFile}`);
              }
          }
      }
  }

  // Final check for essential daemon file
  if (!ns.fileExists(LOCAL_DAEMON_FILE)) {
      ns.tprint("\n✗ CRITICAL: Daemon file is still missing after all attempts. Exiting.");
      return;
  }

  // --- Start Daemon --- 
  ns.tprint("\nStep 4: Starting daemon...");
  // Run with suppressed warnings if daemon handles them (check daemon version?)
  // For now, assume modern daemon handles suppression via its own config
  const daemonPid = ns.run(LOCAL_DAEMON_FILE, 1); 
  if (daemonPid > 0) {
      ns.tprint(`✓ Daemon started successfully (PID: ${daemonPid})!`);
  } else {
      ns.tprint("✗ Failed to start the daemon - likely not enough RAM.");
      ns.tprint("   Try running manually: run daemon-smart.js");
      
      // If daemon fails, try to start essential *fallback* services directly
      ns.tprint("\nAttempting to start essential fallback services...");
      for (const primaryScript in fallbackScripts) {
          const fallbackScript = fallbackScripts[primaryScript];
          if (ns.fileExists(fallbackScript)) {
              const scriptRam = ns.getScriptRam(fallbackScript);
              if (ns.getServerMaxRam('home') - ns.getServerUsedRam('home') >= scriptRam) {
                   if (ns.run(fallbackScript, 1) > 0) {
                       ns.tprint(`✓ Started fallback ${fallbackScript}`);
                   } else {
                       ns.tprint(`✗ Failed to start fallback ${fallbackScript} (RAM: ${scriptRam}GB)`);
                   }
              } else {
                    ns.tprint(`✗ Not enough RAM for fallback ${fallbackScript} (needs ${scriptRam}GB)`);
              }
          } else {
               ns.tprint(`- Fallback script ${fallbackScript} not found.`);
          }
           await ns.sleep(200); // Small delay between starts
      }
  }
  ns.tprint("\nBootstrap finished.");
}

// --- Helper Functions ---

async function getLocalVersion(ns) {
    const versionFile = "daemon-version.txt";
    if (ns.fileExists(versionFile)) {
        try {
            return ns.read(versionFile).trim();
        } catch (e) {
            ns.tprint(`Error reading local version file: ${e}`);
            return null;
        }
    } 
    return null;
}

async function saveLocalVersion(ns, version) {
    const versionFile = "daemon-version.txt";
    try {
        await ns.write(versionFile, version, "w");
    } catch (e) {
        ns.tprint(`Error writing local version file: ${e}`);
    }
}

async function getRemoteVersion(ns) {
    const url = "https://raw.githubusercontent.com/skyecraft92/bitburner-v2/main/daemon-smart.js";
    const regex = /export const DAEMON_VERSION = "([^\"]+)";/;
    let content = null;
    try {
        // Use wget to fetch content into a variable - create a unique filename
        const tempFile = `/temp/remote-daemon-${Date.now()}.js.txt`; 
        const success = await ns.wget(url, tempFile);
        if (success) {
            content = ns.read(tempFile);
            ns.rm(tempFile); // Clean up temporary file
            if (content) {
                const match = regex.exec(content);
                if (match && match[1]) {
                    return { version: match[1], content: content }; // Return version and content
                }
            }
        } else {
             ns.tprint(`wget failed for remote version check from ${url}`);
        }
    } catch (e) {
        ns.tprint(`Error fetching/reading remote version: ${e}`);
    }
    return { version: null, content: null }; // Return nulls if fetching/parsing fails
}

// Function to define fallback scripts content (DOES NOT WRITE FILES)
function createFallbackScriptsDefinitions(ns) {
    const definitions = {};

    // Basic hacknet manager script
    definitions["hacknet-basic.js"] = `/** @param {NS} ns */
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
    definitions["home-basic.js"] = `/** @param {NS} ns */
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
    definitions["stock-basic.js"] = `/** @param {NS} ns */
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

    return definitions;
}

// Ensure the old function name isn't called accidentally if script is run mid-edit
// async function createFallbackScripts(ns) { /* ... old code ... */ } 