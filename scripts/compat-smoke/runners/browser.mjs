// Runs the bundled probe in a Playwright browser and prints its report.
// Copied into the smoke run's temporary project and run there with Node:
//   node runners/browser.mjs <chromium|firefox|webkit> <dist-dir>
// The page is served from an intercepted plain-http origin on purpose: the
// published packages must not need a secure context (no crypto.randomUUID).

import { readFile } from "node:fs/promises";
import { join, normalize } from "node:path";
import process from "node:process";
import { chromium, firefox, webkit } from "playwright";

const REPORT_MARKER = "COMPAT_SMOKE_REPORT ";
const REPORT_GLOBAL = "__compatSmokeReport";
const ORIGIN = "http://compat-smoke.test";
const TIMEOUT_MS = 60_000;

const [engineName, distDir] = process.argv.slice(2);
const engine = { chromium, firefox, webkit }[engineName ?? ""];
if (engine === undefined || distDir === undefined) {
	console.error(
		"usage: node runners/browser.mjs <chromium|firefox|webkit> <dist-dir>",
	);
	process.exit(2);
}

const INDEX = `<!doctype html><meta charset="utf-8"><title>compat smoke</title><script type="module" src="/entry.js"></script>`;

const browser = await engine.launch();
try {
	const page = await browser.newPage();
	const pageErrors = [];
	page.on("pageerror", (error) => pageErrors.push(String(error)));
	page.on("console", (message) =>
		console.error(`[page ${message.type()}] ${message.text()}`),
	);

	await page.route(`${ORIGIN}/**`, async (route) => {
		const { pathname } = new URL(route.request().url());
		if (pathname === "/") {
			await route.fulfill({ contentType: "text/html", body: INDEX });
			return;
		}
		const file = normalize(join(distDir, pathname));
		if (!file.startsWith(normalize(distDir))) {
			await route.fulfill({ status: 403 });
			return;
		}
		try {
			await route.fulfill({
				contentType: "text/javascript",
				body: await readFile(file),
			});
		} catch {
			await route.fulfill({ status: 404 });
		}
	});

	await page.goto(`${ORIGIN}/`);
	try {
		await page.waitForFunction(
			(name) => globalThis[name] !== undefined,
			REPORT_GLOBAL,
			{ timeout: TIMEOUT_MS },
		);
	} catch (error) {
		console.error(
			`no report from ${engineName} within ${TIMEOUT_MS} ms: ${error}`,
		);
		for (const pageError of pageErrors)
			console.error(`page error: ${pageError}`);
		process.exitCode = 1;
	}

	if (process.exitCode !== 1) {
		const report = await page.evaluate(
			(name) => globalThis[name],
			REPORT_GLOBAL,
		);
		console.log(REPORT_MARKER + JSON.stringify(report));
	}
} finally {
	await browser.close();
}
