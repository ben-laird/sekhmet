/**
 * The report a runtime sends back after running the bundled suite: plain JSON
 * data, so it crosses a process, page or worker boundary unchanged.
 *
 * @module
 */

/** How one test or step ended. */
export type TestOutcome =
	| { kind: "passed" }
	| { kind: "failed"; error: string }
	| { kind: "ignored" };

/** One `Deno.test` registration or `t.step` call, with its nested steps. */
export interface TestReport {
	/** The test or step name */
	name: string;
	/** How it ended */
	outcome: TestOutcome;
	/** The steps it ran, in order */
	steps: TestReport[];
}

/** Where a test file lives: its package and its repository-relative path. */
export interface TestFileLocation {
	/** The package directory name under `packages/`, e.g. `enum` */
	package: string;
	/** The path from the repository root, e.g. `packages/enum/mod.test.ts` */
	path: string;
}

/** One test file's result: it either loaded and ran, or failed to load. */
export type FileReport =
	| (TestFileLocation & {
			kind: "ran";
			tests: TestReport[];
			/** A test used `only`, which Deno treats as a failing run */
			usedOnly: boolean;
	  })
	| (TestFileLocation & { kind: "load-failed"; error: string });

/** Every test file's result, in run order. */
export interface SuiteReport {
	/** One entry per test file */
	files: FileReport[];
}
