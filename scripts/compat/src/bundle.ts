/**
 * Builds the suite bundle: finds every package test file, renders the suite
 * entry, bundles it to plain ESM with `deno bundle` (which honours the
 * workspace import maps) and writes the launchers beside it.
 *
 * @module
 */

import { Err, Ok, type Result } from "@sekhmet/enum/result/mini";
import { expandGlob } from "@std/fs";
import { fromFileUrl, join } from "@std/path";
import {
	locateTestFile,
	PROCESS_LAUNCHER,
	PROCESS_LAUNCHER_SOURCE,
	renderSuiteEntry,
	WORKER_LAUNCHER,
	WORKER_LAUNCHER_SOURCE,
} from "./entry.ts";
import type { TestFileLocation } from "./protocol.ts";

const SUITE_SOURCE = fromFileUrl(new URL("./suite.ts", import.meta.url));

/**
 * Lists every `*.test.ts` file under `packages/`, sorted by path.
 *
 * @param root - The absolute repository root
 * @returns The test files' locations
 */
export async function discoverTestFiles(
	root: string,
): Promise<TestFileLocation[]> {
	const files: TestFileLocation[] = [];
	const matches = expandGlob("packages/*/**/*.test.ts", {
		root,
		includeDirs: false,
		exclude: ["**/node_modules/**"],
	});
	for await (const { path } of matches) {
		files.push(locateTestFile({ root, file: path }));
	}
	return files.sort((a, b) => a.path.localeCompare(b.path));
}

/** A built bundle: the directory every launcher runs from. */
export interface Bundle {
	/** The directory holding `suite.js`, its chunks and the launchers */
	dir: string;
	/** The test files it contains, in run order */
	files: TestFileLocation[];
}

/**
 * Bundles the whole package test suite into a fresh directory under `work`.
 *
 * @param options.root - The absolute repository root
 * @param options.work - A scratch directory the bundle may be written into
 * @returns The bundle, or `deno bundle`'s output when it failed
 */
export async function buildBundle({
	root,
	work,
}: {
	root: string;
	work: string;
}): Promise<Result<Bundle, string>> {
	const files = await discoverTestFiles(root);
	const entry = join(work, "suite.ts");
	const dir = join(work, "out");
	await Deno.writeTextFile(
		entry,
		renderSuiteEntry({ suite: SUITE_SOURCE, root, files }),
	);
	const output = await new Deno.Command(Deno.execPath(), {
		args: [
			"bundle",
			"--quiet",
			"--platform=browser",
			"--format=esm",
			"--code-splitting",
			"--keep-names",
			"--outdir",
			dir,
			entry,
		],
		cwd: root,
		stdin: "null",
		stdout: "piped",
		stderr: "piped",
	}).output();
	if (!output.success) {
		const decoder = new TextDecoder();
		return Err(
			`deno bundle failed:\n${decoder.decode(output.stdout)}${decoder.decode(
				output.stderr,
			)}`,
		);
	}
	await Deno.writeTextFile(
		join(dir, PROCESS_LAUNCHER),
		PROCESS_LAUNCHER_SOURCE,
	);
	await Deno.writeTextFile(join(dir, WORKER_LAUNCHER), WORKER_LAUNCHER_SOURCE);
	return Ok({ dir, files });
}
