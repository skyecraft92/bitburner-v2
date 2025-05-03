/** @param {NS} ns */
export async function main(ns) {
    const maxServers = ns.getPurchasedServerLimit();
    const ramSizes = Array.from({ length: 20 }, (_, i) => 2 ** (i + 1)); // RAM sizes from 2GB to 1PB (2^1 to 2^20)
    const checkInterval = 60 * 1000; // Check every 60 seconds
    const hostnamePrefix = "pserv-";
    const statusPort = 1; // Port to check hack-manager status
    const aggressiveBuyMultiplier = 0.5; // Buy threshold (e.g., 50% of current money) when RAM_NEEDED

    ns.disableLog('ALL');
    ns.tail();
    ns.print(`[INFO] Starting Server Buyer. Limit: ${maxServers}. Checking every ${checkInterval / 1000}s.`);

    while (true) {
        const ownedServers = ns.getPurchasedServers();
        const currentMoney = ns.getPlayer().money;
        let purchasedThisCycle = false;
        let replacedThisCycle = false;

        // --- Determine Buying Strategy --- 
        let isRamNeeded = false;
        try {
            const portData = ns.peek(statusPort);
            if (portData === "RAM_NEEDED") {
                isRamNeeded = true;
                ns.print("[INFO] Hack Manager signals RAM_NEEDED. Activating aggressive buying.");
            }
        } catch (e) { ns.print("[WARN] Could not read status port."); }

        // --- Purchase Phase --- 
        if (ownedServers.length < maxServers) {
            ns.print(`[INFO] Currently own ${ownedServers.length}/${maxServers}. Looking to buy...`);
            let ramToBuy = 0;
            let purchaseCost = 0;

            // Find the largest affordable RAM size
            for (let i = ramSizes.length - 1; i >= 0; i--) {
                const ram = ramSizes[i];
                const cost = ns.getPurchasedServerCost(ram);
                if (currentMoney >= cost) {
                    // Standard Strategy: Buy largest affordable
                    if (!isRamNeeded) {
                        ramToBuy = ram;
                        purchaseCost = cost;
                        break; 
                    }
                    // Aggressive Strategy: Buy if cost < threshold * money 
                    else if (cost <= currentMoney * aggressiveBuyMultiplier) {
                        ramToBuy = ram;
                        purchaseCost = cost;
                        ns.print(`[AGGRO] Found affordable RAM ${ram}GB at ${formatMoney(cost)} (within ${aggressiveBuyMultiplier*100}% threshold).`);
                        break; 
                    } else {
                         ns.print(`[AGGRO] RAM ${ram}GB costs ${formatMoney(cost)}, above aggressive threshold (${formatMoney(currentMoney * aggressiveBuyMultiplier)}). Checking smaller...`);
                    }
                }
            }

            if (ramToBuy > 0) {
                const hostname = hostnamePrefix + ownedServers.length;
                ns.print(`[ATTEMPT] Purchasing ${hostname} with ${ramToBuy}GB RAM for ${formatMoney(purchaseCost)}.`);
                const newHostname = ns.purchaseServer(hostname, ramToBuy);
                if (newHostname) {
                    ns.print(`[SUCCESS] Purchased ${newHostname} with ${ramToBuy}GB RAM.`);
                    purchasedThisCycle = true;
                } else {
                    ns.print(`[ERROR] Failed to purchase server ${hostname}. (Not enough money? Name conflict?)`);
                }
            } else {
                ns.print("[INFO] Cannot afford any new server RAM size currently.");
            }
        }

        // --- Upgrade/Replacement Phase --- 
        // Only run if we didn't just buy a new server and have max servers
        if (!purchasedThisCycle && ownedServers.length === maxServers && maxServers > 0) {
            ns.print(`[INFO] Max servers reached (${maxServers}). Looking for upgrades...`);
            let worstServer = null;
            let minRam = Infinity;

            // Find the server with the lowest RAM
            for (const server of ownedServers) {
                const ram = ns.getServerMaxRam(server);
                if (ram < minRam) {
                    minRam = ram;
                    worstServer = server;
                }
            }

            if (worstServer) {
                 ns.print(`[INFO] Smallest server: ${worstServer} (${minRam}GB).`);
                let upgradeRam = 0;
                let upgradeCost = 0;

                // Find the smallest RAM size that's larger than minRam and affordable
                for (const ram of ramSizes) {
                    if (ram > minRam) {
                        const cost = ns.getPurchasedServerCost(ram);
                        if (currentMoney >= cost) {
                             // Standard Strategy: Find largest affordable upgrade > minRam
                            if (!isRamNeeded) {
                                upgradeRam = ram;
                                upgradeCost = cost;
                                // Keep checking larger affordable sizes
                            } 
                            // Aggressive Strategy: Take the *first* affordable upgrade > minRam if cost < threshold * money
                            else if (isRamNeeded && cost <= currentMoney * aggressiveBuyMultiplier) {
                                upgradeRam = ram;
                                upgradeCost = cost;
                                ns.print(`[AGGRO] Found first affordable upgrade RAM ${ram}GB at ${formatMoney(cost)} (within ${aggressiveBuyMultiplier*100}% threshold).`);
                                break; // Take the first affordable option in aggressive mode
                            }
                            // If standard mode or aggressive check failed, keep track of largest affordable found so far
                             if (!isRamNeeded || cost > currentMoney * aggressiveBuyMultiplier) {
                                 // Update potential upgrade if this RAM is better than the last found
                                 if (ram > upgradeRam) { 
                                     upgradeRam = ram;
                                     upgradeCost = cost;
                                     // In standard mode, continue looking for even larger affordable options
                                     // In aggressive mode, if we got here, this is largest affordable but > threshold, so keep looking smaller (which won't happen as we iterate up) - effectively means we wait for standard logic if no cheap upgrade found.
                                 } 
                             }
                        } else {
                            // If we hit a size we can't afford, stop checking larger sizes for standard mode
                            if (!isRamNeeded) break; 
                        }
                    }
                }

                if (upgradeRam > minRam) {
                    ns.print(`[ATTEMPT] Upgrading ${worstServer} (${minRam}GB) to ${upgradeRam}GB for ${formatMoney(upgradeCost)}.`);
                    // Delete the old server
                    if (ns.deleteServer(worstServer)) {
                        ns.print(`[INFO] Deleted ${worstServer}.`);
                        // Buy the new server with the same hostname (optional)
                         ns.print(`[ATTEMPT] Purchasing replacement ${worstServer} with ${upgradeRam}GB RAM.`);
                        const newHostname = ns.purchaseServer(worstServer, upgradeRam);
                        if (newHostname) {
                            ns.print(`[SUCCESS] Replaced ${worstServer} with ${upgradeRam}GB RAM.`);
                            replacedThisCycle = true;
                        } else {
                            ns.print(`[ERROR] Failed to purchase replacement server ${worstServer}! Max servers potentially exceeded temporarily?`);
                            // This state is bad - we deleted a server but couldn't replace it.
                            // Maybe try buying with a default name? ns.purchaseServer(hostnamePrefix + "upgrade-fail", upgradeRam);
                            // For now, just log the error.
                        }
                    } else {
                        ns.print(`[ERROR] Failed to delete server ${worstServer} for upgrade.`);
                    }
                } else {
                    ns.print("[INFO] Cannot afford any upgrades for the smallest server currently.");
                }
            } else if (maxServers > 0) {
                 ns.print("[WARN] Could not identify a server to upgrade.");
            }
        }

        // --- Final Output --- 
        if (!purchasedThisCycle && !replacedThisCycle) {
            ns.print("[INFO] No server purchase or upgrade performed this cycle.");
        }
        ns.print(`[INFO] Current money: ${formatMoney(currentMoney)}. Sleeping for ${checkInterval / 1000}s...`);
        await ns.sleep(checkInterval);
    }
}

// Helper to format money (consider moving to a shared helpers.js)
function formatMoney(amount) {
    const units = ['', 'k', 'm', 'b', 't', 'q'];
    let unitIndex = 0;
    while (amount >= 1000 && unitIndex < units.length - 1) {
        amount /= 1000;
        unitIndex++;
    }
    return `$${amount.toFixed(2)}${units[unitIndex]}`;
} 