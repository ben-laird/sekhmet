/**
 * Runs a suite of test files one after another, each against a fresh
 * {@linkcode Harness}. The generated suite entry calls this inside each
 * runtime; it must not use Deno APIs.
 *
 * @module
 */

import { createHarness, describeError, type Harness } from "./harness.ts";
import type { FileReport, SuiteReport, TestFileLocation } from "./protocol.ts";

/** A test file in the bundle, loaded on demand. */
export interface SuiteFile extends TestFileLocation {
	/** Evaluates the file, which registers its tests through `Deno.test` */
	load: () => Promise<unknown>;
}

/**
 * Runs each file in order: installs a fresh harness as `Deno.test`, loads the
 * file, then runs what it registered. A file that throws while loading is
 * reported as `load-failed` and the run moves on.
 *
 * @param options.files - The test files, in run order
 * @param options.install - Makes `test` the global `Deno.test`
 * @returns One report per file
 */
export async function runSuite({
	files,
	install,
}: {
	files: readonly SuiteFile[];
	install: (test: Harness["test"]) => void;
}): Promise<SuiteReport> {
	const reports: FileReport[] = [];
	for (const { load, ...location } of files) {
		const harness = createHarness();
		install(harness.test);
		try {
			await load();
		} catch (caught: unknown) {
			reports.push({
				...location,
				kind: "load-failed",
				error: describeError(caught),
			});
			continue;
		}
		const { tests, usedOnly } = await harness.run();
		reports.push({ ...location, kind: "ran", tests, usedOnly });
	}
	return { files: reports };
}
