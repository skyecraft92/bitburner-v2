/** @param {NS} ns */
export async function main(ns) {
	const target = ns.args[0];

	if (!target) {
		ns.tprint("ERROR: No target specified for grow-worker.js");
		return;
	}

	try {
		// ns.print(`Executing grow() on ${target}`);
		await ns.grow(target);
	} catch (error) {
		ns.tprint(`ERROR: Failed to grow ${target}: ${error}`);
	}
} 