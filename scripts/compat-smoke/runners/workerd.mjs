// Runs the bundled probe as a Cloudflare Worker in workerd (via Miniflare)
// and prints its report. Copied into the smoke run's temporary project and
// run there with Node:
//   node runners/workerd.mjs <worker.js> <compatibility-date>

import process from "node:process";
import { Miniflare } from "miniflare";

const [scriptPath, compatibilityDate] = process.argv.slice(2);
if (scriptPath === undefined || compatibilityDate === undefined) {
	console.error(
		"usage: node runners/workerd.mjs <worker.js> <compatibility-date>",
	);
	process.exit(2);
}

const miniflare = new Miniflare({
	modules: true,
	scriptPath,
	compatibilityDate,
});
try {
	const response = await miniflare.dispatchFetch("https://compat-smoke.test/");
	const body = await response.text();
	if (!response.ok) {
		console.error(`the Worker answered HTTP ${response.status}:\n${body}`);
		process.exitCode = 1;
	}
	console.log(body);
} finally {
	await miniflare.dispose();
}
