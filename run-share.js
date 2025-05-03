/** @param {NS} ns */
export async function main(ns) {
    // This script simply calls ns.share() indefinitely.
    // It's designed to be run with multiple threads by share-manager.js
    // to utilize available RAM for faction reputation gain.
    await ns.share();
} 