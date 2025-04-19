import { getFilePath, getNsDataThroughFile, disableLogs, scanAllServers } from './helpers.js'
const scriptSolver = getFilePath("/Tasks/contractor.js.solver.js");

/** @param {NS} ns **/
export async function main(ns) {
    // Import helper functions
    const { getFilePath: getFilePathHelper, log, getConfiguration, disableLogs: disableLogsHelper } = ns.args[0] ? 
        JSON.parse(ns.args[0]) : { 
            getFilePath: (file) => file, 
            log: (...args) => ns.tprint(...args),
            getConfiguration: () => ({}),
            disableLogs: () => ns.disableLog("ALL") 
        };
    
    // Disable logs to reduce spam
    disableLogsHelper();
    
    // Get configuration
    const config = getConfiguration("contractor") || {};
    const attemptSolve = config.attemptSolve !== undefined ? config.attemptSolve : true;
    const logContracts = config.logContracts !== undefined ? config.logContracts : true;
    
    // Minimum RAM needed: 1.6 GB for base + minimal operations
    const requiredRam = 1.6; 
    
    // Check if we have enough RAM
    const homeRam = ns.getServerMaxRam("home");
    const usedRam = ns.getServerUsedRam("home");
    const availableRam = homeRam - usedRam;
    
    if (availableRam < requiredRam) {
        log(`WARNING: Not enough RAM available (have ${availableRam.toFixed(1)}GB, need ${requiredRam}GB). Skipping contract solver.`);
        return;
    }
    
    // Simple function to find contracts
    function findContracts() {
        const contracts = [];
        const servers = scanAllServers();
        
        for (const server of servers) {
            const serverContracts = ns.ls(server, ".cct");
            for (const contract of serverContracts) {
                contracts.push({
                    server: server,
                    filename: contract,
                    type: ns.codingcontract.getContractType(contract, server),
                    data: ns.codingcontract.getData(contract, server),
                    didSolve: false,
                    reward: "unknown"
                });
            }
        }
        
        return contracts;
    }
    
    // Helper function to scan all servers
    function scanAllServers() {
        const servers = [];
        const visited = new Set();
        const stack = ["home"];
        
        while (stack.length > 0) {
            const server = stack.pop();
            if (!visited.has(server)) {
                visited.add(server);
                servers.push(server);
                const connections = ns.scan(server);
                for (const connection of connections) {
                    if (!visited.has(connection)) {
                        stack.push(connection);
                    }
                }
            }
        }
        
        return servers;
    }
    
    // Find all contracts
    const contracts = findContracts();
    
    // Log found contracts
    if (logContracts) {
        if (contracts.length === 0) {
            log("No contracts found.");
        } else {
            log(`Found ${contracts.length} contracts:`);
            for (const contract of contracts) {
                log(`[${contract.server}] ${contract.filename} (${contract.type})`);
            }
        }
    }
    
    // This is a simplified version - actual contract solving would be more complex
    // For now, we just acknowledge finding the contracts
    
    // Return contract information
    return contracts;
}

// Add autocomplete support
export function autocomplete(data, args) {
    return [];
}