/**
 * The generated sources around the bundled suite: the suite entry that wires
 * each test file to `runSuite` (`suite.ts`), and the small per-runtime launchers
 * that run it and hand the report back.
 *
 * @module
 */

import { relative, SEPARATOR, toFileUrl } from "@std/path";
import type { TestFileLocation } from "./protocol.ts";

/** The bundled suite module every launcher imports: it exports `run()`. */
export const SUITE_MODULE = "suite.js";

/** The launcher Node and Bun execute: `run.mjs <report.json>`. */
export const PROCESS_LAUNCHER = "run.mjs";

/** The Workers module whose `fetch` runs the suite and returns its report. */
export const WORKER_LAUNCHER = "worker.mjs";

/**
 * Locates a test file under the repository root.
 *
 * @param options.root - The absolute repository root
 * @param options.file - The absolute path of a file under `packages/<name>/`
 * @returns Its package and repository-relative path (always `/`-separated)
 */
export function locateTestFile({
	root,
	file,
}: {
	root: string;
	file: string;
}): TestFileLocation {
	const path = relative(root, file).split(SEPARATOR).join("/");
	const [top, name] = path.split("/");
	if (top !== "packages" || name === undefined) {
		throw new RangeError(`not a package test file: ${path}`);
	}
	return { package: name, path };
}

/**
 * Renders the suite entry: it exports `run()`, which installs a fresh
 * `Deno.test` shim per file and runs every file in the given order.
 *
 * @param options.suite - The absolute path of `src/suite.ts`
 * @param options.root - The absolute repository root
 * @param options.files - The test files, as repository-relative locations
 * @returns TypeScript source for `deno bundle`
 */
export function renderSuiteEntry({
	suite,
	root,
	files,
}: {
	suite: string;
	root: string;
	files: readonly TestFileLocation[];
}): string {
	const entries = files.map(({ package: name, path }) => {
		const url = toFileUrl(`${root}/${path}`).href;
		return `\t\t{ package: ${JSON.stringify(name)}, path: ${JSON.stringify(
			path,
		)}, load: () => import(${JSON.stringify(url)}) },`;
	});
	return [
		`import { runSuite } from ${JSON.stringify(toFileUrl(suite).href)};`,
		"",
		"export function run() {",
		"\treturn runSuite({",
		"\t\tinstall: (test) => {",
		"\t\t\tObject.assign(globalThis, { Deno: { test, noColor: true } });",
		"\t\t},",
		"\t\tfiles: [",
		...entries,
		"\t\t],",
		"\t});",
		"}",
		"",
	].join("\n");
}

/** The source of {@linkcode PROCESS_LAUNCHER}, for Node and Bun. */
export const PROCESS_LAUNCHER_SOURCE: string = `import { writeFile } from "node:fs/promises";
import { run } from "./${SUITE_MODULE}";

const report = await run();
await writeFile(process.argv[2], JSON.stringify(report));
process.exit(0);
`;

/** The source of {@linkcode WORKER_LAUNCHER}, for workerd. */
export const WORKER_LAUNCHER_SOURCE: string = `import { run } from "./${SUITE_MODULE}";

export default {
	async fetch() {
		return Response.json(await run());
	},
};
`;
