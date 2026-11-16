/**
 * Runs a built {@linkcode Bundle} on each runtime and returns the raw report
 * it sends back, with any uncaught errors the host saw outside the suite: Node and Bun run a launcher script that writes the report to
 * a file; browsers load the suite into a Playwright page; workerd runs it in a
 * Miniflare worker's `fetch` handler.
 *
 * Every failure to reach a runtime (not installed, crashed, timed out) is
 * returned as an error value; test failures travel inside the report.
 *
 * @module
 */

import { Err, Ok, type Result } from "@sekhmet/enum/result/mini";
import { extname, join } from "@std/path";
import { Miniflare } from "miniflare";
import { type Browser, chromium, firefox, webkit } from "playwright";
import type { Bundle } from "./bundle.ts";
import { PROCESS_LAUNCHER, SUITE_MODULE, WORKER_LAUNCHER } from "./entry.ts";
import {
	type BrowserRuntime,
	type ProcessRuntime,
	type Runtime,
	WORKERD_COMPATIBILITY_DATE,
} from "./runtime.ts";

/**
 * How long one runtime may take to run the whole suite: 5 minutes. Deno runs
 * it in seconds, so this only trips on a hang.
 */
export const SUITE_TIMEOUT_MS: number = 5 * 60 * 1000;

/** Plain HTTP on purpose: the packages must not need a secure context. */
const PAGE_ORIGIN = "http://compat.test";

const BROWSERS = { chromium, firefox, webkit } as const;

/** What a runtime handed back from one suite run. */
export interface RuntimeOutput {
	/** The suite report, still to be validated */
	data: unknown;
	/**
	 * Uncaught errors the host saw outside the suite's own watch (a browser's
	 * page errors), described; each one fails the run
	 */
	hostErrors: string[];
}

function reason(caught: unknown): string {
	return caught instanceof Error ? caught.message : String(caught);
}

/**
 * Settles `work` into a result: its value, its rejection as an error, or a
 * timeout error after {@linkcode SUITE_TIMEOUT_MS}.
 */
async function settleWithin<T>({
	work,
	label,
}: {
	work: Promise<T>;
	label: string;
}): Promise<Result<T, string>> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const deadline = new Promise<Result<T, string>>((resolve) => {
		timer = setTimeout(
			() =>
				resolve(Err(`${label} timed out after ${SUITE_TIMEOUT_MS / 1000}s`)),
			SUITE_TIMEOUT_MS,
		);
	});
	try {
		return await Promise.race([
			work.then(
				(value): Result<T, string> => Ok(value),
				(caught: unknown) => Err(`${label} failed: ${reason(caught)}`),
			),
			deadline,
		]);
	} finally {
		clearTimeout(timer);
	}
}

async function runProcess({
	runtime,
	bundle,
}: {
	runtime: ProcessRuntime;
	bundle: Bundle;
}): Promise<Result<RuntimeOutput, string>> {
	const reportPath = join(bundle.dir, "report.json");
	let status: Deno.CommandStatus;
	try {
		status = await new Deno.Command(runtime, {
			args: [PROCESS_LAUNCHER, reportPath],
			cwd: bundle.dir,
			stdin: "null",
			stdout: "inherit",
			stderr: "inherit",
			signal: AbortSignal.timeout(SUITE_TIMEOUT_MS),
		}).output();
	} catch (caught: unknown) {
		return Err(
			caught instanceof Deno.errors.NotFound
				? `'${runtime}' is not installed or not on PATH`
				: `${runtime} could not run: ${reason(caught)}`,
		);
	}
	try {
		return Ok({
			data: JSON.parse(await Deno.readTextFile(reportPath)),
			hostErrors: [],
		});
	} catch (caught: unknown) {
		return Err(
			`${runtime} exited with code ${status.code} without a readable report: ${reason(
				caught,
			)}`,
		);
	}
}

async function runInPage({
	runtime,
	browser,
	bundle,
}: {
	runtime: BrowserRuntime;
	browser: Browser;
	bundle: Bundle;
}): Promise<RuntimeOutput> {
	const page = await browser.newPage();
	const hostErrors: string[] = [];
	page.on("console", (message) => {
		console.log(`[${runtime}] ${message.text()}`);
	});
	page.on("pageerror", (error) => {
		hostErrors.push(`page error: ${error.stack ?? error.message}`);
	});
	await page.route(`${PAGE_ORIGIN}/**`, (route) => {
		const { pathname } = new URL(route.request().url());
		return pathname === "/"
			? route.fulfill({ contentType: "text/html", body: "<!doctype html>" })
			: route.fulfill({ path: join(bundle.dir, pathname) });
	});
	await page.goto(`${PAGE_ORIGIN}/`);
	const data = await page.evaluate(
		async (module: string) => (await import(module)).run(),
		`/${SUITE_MODULE}`,
	);
	return { data, hostErrors };
}

async function runBrowser({
	runtime,
	bundle,
}: {
	runtime: BrowserRuntime;
	bundle: Bundle;
}): Promise<Result<RuntimeOutput, string>> {
	let browser: Browser;
	try {
		browser = await BROWSERS[runtime].launch();
	} catch (caught: unknown) {
		return Err(`${runtime} could not launch: ${reason(caught)}`);
	}
	try {
		return await settleWithin({
			work: runInPage({ runtime, browser, bundle }),
			label: runtime,
		});
	} finally {
		await browser.close();
	}
}

async function workerModules(
	dir: string,
): Promise<{ type: "ESModule"; path: string; contents: string }[]> {
	const names = [WORKER_LAUNCHER];
	for await (const entry of Deno.readDir(dir)) {
		if (entry.isFile && extname(entry.name) === ".js") names.push(entry.name);
	}
	return await Promise.all(
		names.map(async (name) => ({
			type: "ESModule" as const,
			path: join(dir, name),
			contents: await Deno.readTextFile(join(dir, name)),
		})),
	);
}

async function runWorkerd(
	bundle: Bundle,
): Promise<Result<RuntimeOutput, string>> {
	let miniflare: Miniflare;
	try {
		miniflare = new Miniflare({
			modules: await workerModules(bundle.dir),
			modulesRoot: bundle.dir,
			compatibilityDate: WORKERD_COMPATIBILITY_DATE,
		});
		await miniflare.ready;
	} catch (caught: unknown) {
		return Err(`workerd could not start: ${reason(caught)}`);
	}
	try {
		return await settleWithin({
			work: miniflare
				.dispatchFetch("http://compat.test/")
				.then(async (response) => ({
					data: await response.json(),
					hostErrors: [],
				})),
			label: "workerd",
		});
	} finally {
		await miniflare.dispose();
	}
}

/**
 * Runs the bundled suite on `runtime`.
 *
 * @param options.runtime - The runtime to run on
 * @param options.bundle - The built bundle
 * @returns What the runtime sent back (the report still to be validated, and
 * any uncaught errors its host saw), or why it could not run the suite
 */
export function runOn({
	runtime,
	bundle,
}: {
	runtime: Runtime;
	bundle: Bundle;
}): Promise<Result<RuntimeOutput, string>> {
	switch (runtime) {
		case "node":
		case "bun":
			return runProcess({ runtime, bundle });
		case "chromium":
		case "firefox":
		case "webkit":
			return runBrowser({ runtime, bundle });
		case "workerd":
			return runWorkerd(bundle);
	}
}
