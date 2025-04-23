// This is a proof-of-concept script that can continuously push changes to scripts on your home server to all other servers.
// Run this script once to push the latest version of your scripts any other servers that have a copy.
// Warning: If you keep try to edit and save a file while this script is running, it will probably crash your game the first time you save a file.
const loopingMode = false;
const home = "home";

/** @param {NS} ns */
export async function main(ns) {
    // List of core scripts to sync to the game
    const scripts = [
        "daemon-smart.js",
        "hacknet-pro.js",
        "upgrade-home.js",
        "stockmaster.js",
        "sleeve.js",
        "bladeburner.js",
        "helpers.js"
    ];
    
    const port = ns.getPortHandle(1);
    if (!port) {
        ns.tprint("ERROR: Can't get port handle. Make sure you have the required source files.");
        return;
    }
    
    // Clear port
    port.clear();
    
    ns.tprint("╔════════════════════════════════════════════╗");
    ns.tprint("║        BITBURNER FILE SYNC UTILITY         ║");
    ns.tprint("╠════════════════════════════════════════════╣");
    
    let successCount = 0;
    let failCount = 0;
    
    for (const script of scripts) {
        try {
            // Get file content
            const content = ns.read(script);
            
            if (!content) {
                ns.tprint(`❌ Failed to read ${script}: File not found or empty`);
                failCount++;
                continue;
            }
            
            // Write data to port in the format expected by the game
            const data = {
                filename: script,
                content: content
            };
            
            // Push to port
            port.write(JSON.stringify(data));
            ns.tprint(`✅ Synced ${script} to game`);
            successCount++;
            
            // Small delay between operations
            await ns.sleep(100);
        } catch (error) {
            ns.tprint(`❌ Error syncing ${script}: ${error}`);
            failCount++;
        }
    }
    
    ns.tprint("╠════════════════════════════════════════════╣");
    ns.tprint(`║ Sync complete: ${successCount} success, ${failCount} failed     ║`);
    ns.tprint("╚════════════════════════════════════════════╝");
    
    if (successCount > 0) {
        ns.tprint("\nTo run the smart daemon, use: run daemon-smart.js");
    }
}