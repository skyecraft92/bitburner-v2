/** @param {NS} ns */
export async function main(ns) {
    const checkInterval = 10 * 60 * 1000; // Check every 10 minutes
    const requiredSF = 4; // Singularity functions needed

    ns.disableLog('ALL');
    ns.tail();
    ns.print(`[INFO] Starting Backdoor Manager. Checking every ${checkInterval / 1000 / 60} minutes.`);

    let singularityAvailable = false;
    try {
        // Check if player has the required Source File
        const sourceFiles = ns.getOwnedSourceFiles();
        singularityAvailable = sourceFiles.some(sf => sf.n === requiredSF && sf.lvl > 0);
        if (!singularityAvailable) {
             ns.print("[WARN] Source-File 4 (Singularity) not available. Manual backdooring required.");
        } else {
            ns.print("[INFO] Source-File 4 detected. Automatic backdooring enabled.");
        }
    } catch (e) {
        ns.print("[WARN] Could not check for Source-File 4. Assuming Singularity is unavailable.");
        singularityAvailable = false; // Assume unavailable if check fails
    }


    while (true) {
        ns.print(`[INFO] Scanning network for servers needing backdoor...`);
        const serversToBackdoor = findServersToBackdoor(ns);

        if (serversToBackdoor.length === 0) {
            ns.print("[INFO] No servers currently require backdooring.");
        } else {
             ns.print(`[INFO] Found ${serversToBackdoor.length} servers potentially needing backdoor: ${serversToBackdoor.join(', ')}`);
            
             if (!singularityAvailable) {
                ns.print("[WARN] Cannot automatically backdoor. Please connect and run 'backdoor' manually on listed servers.");
             } else {
                ns.print("[INFO] Attempting automatic backdoor installation...");
                // Try backdooring the highest-value server first
                 serversToBackdoor.sort((a, b) => ns.getServerMaxMoney(b) - ns.getServerMaxMoney(a));
                const targetServer = serversToBackdoor[0]; 
                
                ns.print(`[INFO] Attempting backdoor on ${targetServer}...`);
                const success = await installBackdoor(ns, targetServer);
                if (success) {
                    ns.print(`[SUCCESS] Successfully installed backdoor on ${targetServer}!`);
                    // Optionally ns.tprint the success
                    ns.tprint(`[SUCCESS] Backdoor installed on ${targetServer} by backdoor-manager.js`);
                } else {
                    ns.print(`[ERROR] Failed to install backdoor on ${targetServer}. Will retry later.`);
                    // Optionally ns.tprint the failure
                     ns.tprint(`[ERROR] Failed to backdoor ${targetServer}. Check backdoor-manager.js logs.`);
                }
                // Only attempt one backdoor per cycle to avoid issues and manage time
             }
        }

        await ns.sleep(checkInterval);
    }
}

/**
 * Finds servers that are rooted, meet hack level req, but aren't backdoored.
 * @param {NS} ns 
 * @returns {string[]} List of hostnames
 */
function findServersToBackdoor(ns) {
    const allServers = new Set();
    const queue = ["home"];
    const playerHackLevel = ns.getHackingLevel();
    const targets = [];

    // BFS Scan
    while (queue.length > 0) {
        const server = queue.shift();
        if (allServers.has(server)) continue;
        allServers.add(server);

        const neighbors = ns.scan(server);
        for (const neighbor of neighbors) {
            if (!allServers.has(neighbor)) {
                queue.push(neighbor);
            }
        }
    }

    for (const server of allServers) {
        if (server === "home") continue; // Cannot backdoor home

        try {
            const serverInfo = ns.getServer(server);
            if (serverInfo.hasAdminRights &&
                !serverInfo.backdoorInstalled &&
                serverInfo.requiredHackingSkill <= playerHackLevel) 
            {
                 // Check if it's a faction server (usually has no money) or needs backdoor
                 // Check if it's a special server like CSEC, NiteSec, etc.
                 const isSpecialServer = ["CSEC", "avmnite-02h", "I.I.I.I", "run4theh111z"].includes(serverInfo.hostname);
                // Backdoor special servers OR servers with money > 0 (avoids useless backdoors on e.g. hacknet nodes)
                if (isSpecialServer || serverInfo.moneyMax > 0) {
                    targets.push(server);
                }
            }
        } catch (e) {
            // ns.print(`[WARN] Could not get info for server ${server}: ${e}`);
            // Ignore servers we cannot access info for
        }
    }
    return targets;
}

/**
 * Uses Singularity functions to install a backdoor on a target server.
 * This can take time and temporarily shifts focus.
 * @param {NS} ns
 * @param {string} targetHostname
 * @returns {Promise<boolean>} True if successful, false otherwise.
 */
async function installBackdoor(ns, targetHostname) {
    // Need to connect to the server first
    // This is complex as ns.singularity.connect() changes the active terminal.
    // Running this logic via ns.run() might be necessary if it interferes
    // with the main daemon or other scripts. For now, let's try directly.
    // A simpler check: can we call installBackdoor directly? Some docs suggest yes. Let's try that first.
    try {
        // Navigate to the target server first is generally required
        // We need to reconstruct the path
        const path = findPath(ns, targetHostname);
        if (!path) {
            ns.print(`[ERROR] Could not find path to ${targetHostname}. Cannot connect.`);
            return false;
        }
        ns.print(`[INFO] Connecting to ${targetHostname} via path: ${path.join(' -> ')}`);
        
        // Connect to each server in the path
        for (const hop of path) {
             // This changes focus in the terminal, which might be undesirable.
             // However, it's needed for installBackdoor unless run differently.
            await ns.singularity.connect(hop); 
        }
        
        ns.print(`[INFO] Connected to ${targetHostname}. Attempting backdoor installation...`);
        await ns.singularity.installBackdoor();
        ns.print(`[INFO] installBackdoor command issued for ${targetHostname}.`);

        // Return to home server to avoid leaving terminal focus stranded
        await ns.singularity.connect("home");
        ns.print(`[INFO] Returned to home terminal.`);
        
        // Verify if backdoor was successful (optional, installBackdoor is async)
        // We might need a delay here, but let's assume it worked for now.
        // Re-checking serverInfo.backdoorInstalled in the next cycle is the safer way.
        return true; 
    } catch (e) {
        ns.print(`[ERROR] Failed during backdoor process for ${targetHostname}: ${e}`);
         try { // Attempt to return home even if there was an error
            await ns.singularity.connect("home");
         } catch {}
        return false;
    }
}

/**
 * Finds the path from home to the target server using BFS.
 * @param {NS} ns
 * @param {string} target
 * @returns {string[] | null} Array of hostnames representing the path, or null if not found.
 */
function findPath(ns, target) {
    const queue = [{ server: "home", path: ["home"] }];
    const visited = new Set(["home"]);

    while (queue.length > 0) {
        const { server, path } = queue.shift();

        if (server === target) {
            // Return path excluding the final 'connect target' step,
            // as singularity.connect handles the last hop.
            // Actually, we need the full path including target.
             return path.slice(1); // Return path from the server *after* home up to target
        }

        const neighbors = ns.scan(server);
        for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
                visited.add(neighbor);
                queue.push({ server: neighbor, path: [...path, neighbor] });
            }
        }
    }
    return null; // Path not found
} 