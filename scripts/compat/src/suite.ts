/**
 * Runs a suite of test files one after another, each against a fresh
 * {@linkcode Harness}, and records every uncaught error against what was
 * running when it surfaced. The generated suite entry calls this inside each
 * runtime; it must not use Deno APIs.
 *
 * @module
 */

import { createHarness, describeError, type Harness } from "./harness.ts";
import type {
	FileReport,
	SuiteReport,
	TestFileLocation,
	UncaughtReport,
	UncaughtScope,
} from "./protocol.ts";
import type { UncaughtListener, Unwatch } from "./uncaught.ts";

/** A test file in the bundle, loaded on demand. */
export interface SuiteFile extends TestFileLocation {
	/** Evaluates the file, which registers its tests through `Deno.test` */
	load: () => Promise<unknown>;
}

/**
 * Waits two tasks, so an uncaught error a file left behind (an unhandled
 * rejection, a zero-delay timer that throws) surfaces while that file is
 * still the one running. One is not enough: Chromium and Firefox fire
 * `unhandledrejection` after a zero-delay timer queued at the same time.
 */
async function drainTasks(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 0));
	await new Promise((resolve) => setTimeout(resolve, 0));
}

async function runFile({
	file: { load, ...location },
	install,
	enter,
}: {
	file: SuiteFile;
	install: (test: Harness["test"]) => void;
	enter: (scope: UncaughtScope) => void;
}): Promise<FileReport> {
	const { path } = location;
	enter({ kind: "file", path });
	const harness = createHarness();
	install(harness.test);
	try {
		await load();
	} catch (caught: unknown) {
		await drainTasks();
		return { ...location, kind: "load-failed", error: describeError(caught) };
	}
	const { tests, usedOnly } = await harness.run({
		onTest: (test) =>
			enter(
				test === undefined
					? { kind: "file", path }
					: { kind: "test", path, test },
			),
	});
	await drainTasks();
	return { ...location, kind: "ran", tests, usedOnly };
}

/**
 * Runs each file in order: installs a fresh harness as `Deno.test`, loads the
 * file, then runs what it registered. A file that throws while loading is
 * reported as `load-failed` and the run moves on.
 *
 * While it runs, `watch` reports every uncaught error, which is recorded with
 * the test or file running at the time (or the run, between files). After each
 * file it waits two tasks, so errors the file left pending surface while it is
 * still current.
 *
 * @param options.files - The test files, in run order
 * @param options.install - Makes `test` the global `Deno.test`
 * @param options.watch - Starts reporting uncaught errors to a listener and
 * returns how to stop
 * @returns One report per file, and every uncaught error
 */
export async function runSuite({
	files,
	install,
	watch,
}: {
	files: readonly SuiteFile[];
	install: (test: Harness["test"]) => void;
	watch: (listener: UncaughtListener) => Unwatch;
}): Promise<SuiteReport> {
	const reports: FileReport[] = [];
	const uncaught: UncaughtReport[] = [];
	let scope: UncaughtScope = { kind: "run" };
	const unwatch = watch((error) => {
		uncaught.push({ scope, error: describeError(error) });
	});
	try {
		for (const file of files) {
			reports.push(
				await runFile({
					file,
					install,
					enter: (next) => {
						scope = next;
					},
				}),
			);
			scope = { kind: "run" };
		}
	} finally {
		unwatch();
	}
	return { files: reports, uncaught };
}
