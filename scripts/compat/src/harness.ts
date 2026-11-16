/**
 * A `Deno.test` stand-in for runtimes without Deno. Test files register into a
 * harness as they load; {@linkcode Harness.run} then runs every registration in
 * order and reports each outcome as plain data.
 *
 * It honours what the suite uses: every `Deno.test` call form, `ignore`,
 * `only`, and `t.step` (nested, async, `ignore`), and it fails a test whose
 * step failed or was not awaited, as Deno does. Deno's sanitizers
 * (`sanitizeOps`, `sanitizeResources`, `sanitizeExit`) and `permissions` are
 * accepted and ignored: no runtime here can check them the way Deno does.
 *
 * This module is bundled into every runtime, so it must not use Deno APIs.
 *
 * @module
 */

import type { TestOutcome, TestReport } from "./protocol.ts";

/** The body of a test or step. */
export type TestFn = (t: TestContext) => void | Promise<void>;

/** What a test or step body receives, a subset of `Deno.TestContext`. */
export interface TestContext {
	/** The test or step name */
	name: string;
	/**
	 * Runs a nested step. Resolves `true` when it passed, `false` when it
	 * failed or was ignored.
	 */
	step: (...args: unknown[]) => Promise<boolean>;
}

/** A normalized test or step registration. */
export interface TestDefinition {
	/** The test or step name */
	name: string;
	/** The body */
	fn: TestFn;
	/** Skip it and report it ignored */
	ignore: boolean;
	/** Run only the registrations that set it (tests only) */
	only: boolean;
}

/** The outcome of {@linkcode Harness.run}. */
export interface HarnessRun {
	/** One report per registered test, in registration order */
	tests: TestReport[];
	/** Some test set `only`: the others were skipped, and Deno fails such a run */
	usedOnly: boolean;
}

/** A per-file registry of tests: `test` is installed as `Deno.test`. */
export interface Harness {
	/** Registers a test, accepting every `Deno.test` call form */
	test: (...args: unknown[]) => void;
	/** Runs every registered test in order */
	run: () => Promise<HarnessRun>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isTestFn(value: unknown): value is TestFn {
	return typeof value === "function";
}

function fromOptions({
	options,
	name,
	fn,
}: {
	options: Record<string, unknown>;
	name: unknown;
	fn: unknown;
}): TestDefinition {
	const body = fn ?? options.fn;
	if (!isTestFn(body)) {
		throw new TypeError("Deno.test shim: the test has no function");
	}
	const label = name ?? options.name ?? body.name;
	if (typeof label !== "string" || label === "") {
		throw new TypeError("Deno.test shim: the test has no name");
	}
	return {
		name: label,
		fn: body,
		ignore: options.ignore === true,
		only: options.only === true,
	};
}

/**
 * Normalizes the arguments of any `Deno.test` or `t.step` call form:
 * `(fn)`, `(name, fn)`, `(name, options, fn)`, `(options)` and
 * `(options, fn)`.
 *
 * Throws on a malformed call: that is a bug in the test file, as in Deno.
 *
 * @param args - The arguments as passed to `Deno.test` or `t.step`
 * @returns The registration they describe
 */
export function normalizeDefinition(args: readonly unknown[]): TestDefinition {
	const [first, second, third] = args;
	if (isTestFn(first)) {
		return fromOptions({ options: {}, name: undefined, fn: first });
	}
	if (typeof first === "string") {
		return isRecord(second) && !isTestFn(second)
			? fromOptions({ options: second, name: first, fn: third })
			: fromOptions({ options: {}, name: first, fn: second });
	}
	if (isRecord(first)) {
		return fromOptions({ options: first, name: undefined, fn: second });
	}
	throw new TypeError("Deno.test shim: unrecognized call form");
}

/**
 * Describes a thrown value with its message and, where the runtime gives one,
 * its stack. V8 stacks start with the message; Firefox and WebKit stacks do
 * not, so the message is prepended when missing.
 *
 * @param caught - The thrown value
 * @returns A readable description
 */
export function describeError(caught: unknown): string {
	if (!(caught instanceof Error)) return String(caught);
	const headline = `${caught.name}: ${caught.message}`;
	const stack = caught.stack ?? "";
	if (stack === "") return headline;
	return stack.startsWith(headline) ? stack : `${headline}\n${stack}`;
}

async function runDefinition(definition: TestDefinition): Promise<TestReport> {
	const steps: TestReport[] = [];
	if (definition.ignore) {
		return { name: definition.name, outcome: { kind: "ignored" }, steps };
	}
	let running = 0;
	const context: TestContext = {
		name: definition.name,
		step: async (...args) => {
			const step = normalizeDefinition(args);
			running += 1;
			const report = await runDefinition(step);
			running -= 1;
			steps.push(report);
			return report.outcome.kind === "passed";
		},
	};
	const outcome = await settle(definition.fn, context);
	return {
		name: definition.name,
		outcome: judge({ outcome, running, steps }),
		steps,
	};
}

async function settle(fn: TestFn, context: TestContext): Promise<TestOutcome> {
	try {
		await fn(context);
		return { kind: "passed" };
	} catch (caught: unknown) {
		return { kind: "failed", error: describeError(caught) };
	}
}

function judge({
	outcome,
	running,
	steps,
}: {
	outcome: TestOutcome;
	running: number;
	steps: readonly TestReport[];
}): TestOutcome {
	if (outcome.kind === "failed") return outcome;
	if (running > 0) {
		return {
			kind: "failed",
			error: `${running} step(s) were not awaited before the test ended`,
		};
	}
	const failed = steps.filter((step) => step.outcome.kind === "failed").length;
	return failed > 0
		? { kind: "failed", error: `${failed} step(s) failed` }
		: outcome;
}

/**
 * Creates an empty harness for one test file.
 *
 * @returns The harness: install its `test` as `Deno.test`, load the file,
 * then `run` it
 */
export function createHarness(): Harness {
	const definitions: TestDefinition[] = [];
	return {
		test: (...args) => {
			definitions.push(normalizeDefinition(args));
		},
		run: async () => {
			const usedOnly = definitions.some((definition) => definition.only);
			const tests: TestReport[] = [];
			for (const definition of definitions) {
				tests.push(
					usedOnly && !definition.only
						? { name: definition.name, outcome: { kind: "ignored" }, steps: [] }
						: await runDefinition(definition),
				);
			}
			return { tests, usedOnly };
		},
	};
}
