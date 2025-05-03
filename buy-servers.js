/** @param {NS} ns */
export async function main(ns) {
  const config = {
    reserveMoney: 1 * 1e9,     // Keep $1b reserved by default
    minRamExponent: 4,       // Minimum RAM to buy (2^4 = 16GB)
    cycleTime: 60 * 1000,    // Check every 60 seconds
    serverPrefix: "pserv-"   // Prefix for purchased server names
  };

  ns.disableLog("ALL");
  ns.tail(); // Use ns.ui.openTail() if ns.tail() is deprecated

  log(`Starting server buyer. Reserve: ${formatMoney(config.reserveMoney)}`);

  while (true) {
    try {
      const currentServers = ns.getPurchasedServers();
      const serverLimit = ns.getPurchasedServerLimit();
      const playerMoney = ns.getPlayer().money;
      const moneyAvailable = playerMoney - config.reserveMoney;

      log(`Checking servers: ${currentServers.length}/${serverLimit}. Available money: ${formatMoney(moneyAvailable)}`);

      // Check if we can buy more servers
      if (currentServers.length < serverLimit) {
        let bestRam = 0;
        let costForBestRam = 0;

        // Determine highest affordable RAM (powers of 2)
        for (let i = config.minRamExponent; i <= 20; i++) { // 2^20 = 1TB, common max
          const ram = Math.pow(2, i);
          const cost = ns.getPurchasedServerCost(ram);
          if (cost <= moneyAvailable) {
            bestRam = ram;
            costForBestRam = cost;
          } else {
            // Stop checking once RAM becomes unaffordable
            break;
          }
        }

        // If we found affordable RAM
        if (bestRam > 0) {
          log(`Best affordable RAM: ${bestRam}GB for ${formatMoney(costForBestRam)}`);
          
          // Generate a unique server name
          let serverName = "";
          for (let i = 0; i < serverLimit; i++) {
              const potentialName = `${config.serverPrefix}${i}`;
              if (!currentServers.includes(potentialName)) {
                  serverName = potentialName;
                  break;
              }
          }

          if (serverName) {
            log(`Attempting to purchase server '${serverName}' with ${bestRam}GB RAM...`);
            const purchasedHostname = ns.purchaseServer(serverName, bestRam);
            if (purchasedHostname) {
              log(`✓ Successfully purchased '${purchasedHostname}' [${bestRam}GB] for ${formatMoney(costForBestRam)}`, "success");
              ns.toast(`Purchased server '${purchasedHostname}' [${bestRam}GB]`, "success", 5000);
            } else {
              log(`✗ Failed to purchase server '${serverName}'. Unknown error.`);
            }
          } else {
             log("Could not find a unique server name (this shouldn't happen if under limit).");
          }
        } else {
          log("No affordable RAM size found for a new server.");
        }
      } else {
        log("Server limit reached.");
        // TODO: Add logic here to potentially upgrade existing servers later
      }

    } catch (error) {
      log(`ERROR: ${error}`, "error");
    }

    await ns.sleep(config.cycleTime);
  }
}

// Helper Functions (consider moving to a shared 'helpers.js' later)
function log(ns, message, type = "info") {
  const timestamp = new Date().toLocaleTimeString();
  const prefix = `[${timestamp}] [${type.toUpperCase()}]`;
  ns.print(`${prefix} ${message}`);
  if (type === "error" || type === "success") {
    ns.tprint(`${prefix} ${message}`);
  }
}

function formatMoney(ns, amount) {
    // Use ns.nFormat if available for better formatting, otherwise basic fallback
    if (ns.nFormat) {
        return ns.nFormat(amount, '$0.00a');
    } else {
        const units = ['', 'k', 'm', 'b', 't', 'q'];
        let unitIndex = 0;
        while(amount >= 1000 && unitIndex < units.length - 1) {
            amount /= 1000;
            unitIndex++;
        }
        return `$${amount.toFixed(2)}${units[unitIndex]}`;
    }
} 