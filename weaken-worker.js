/** @param {NS} ns */
export async function main(ns) {
	const target = ns.args[0];

	if (!target) {
		ns.tprint("ERROR: No target specified for weaken-worker.js");
		return;
	}

	try {
		// ns.print(`Executing weaken() on ${target}`);
		await ns.weaken(target);
	} catch (error) {
		ns.tprint(`ERROR: Failed to weaken ${target}: ${error}`);
	}
} 