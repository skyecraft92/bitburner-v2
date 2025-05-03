/** @param {NS} ns */
export async function main(ns) {
	const target = ns.args[0];

	if (!target) {
		ns.tprint("ERROR: No target specified for hack-worker.js");
		return;
	}

	try {
		// ns.print(`Executing hack() on ${target}`);
		await ns.hack(target);
	} catch (error) {
		ns.tprint(`ERROR: Failed to hack ${target}: ${error}`);
	}
} 