/**
 * The runtimes the suite runs on, and how each is reached.
 *
 * @module
 */

import { Err, Ok, type Result } from "@sekhmet/enum/result/mini";

/** Every runtime `compat:test` accepts, in usage order. */
export const RUNTIMES = [
	"node",
	"bun",
	"chromium",
	"firefox",
	"webkit",
	"workerd",
] as const;

/** A runtime `compat:test` runs the suite on. */
export type Runtime = (typeof RUNTIMES)[number];

/** A browser engine Playwright drives. */
export type BrowserRuntime = Extract<
	Runtime,
	"chromium" | "firefox" | "webkit"
>;

/**
 * The compatibility date of the workerd run: the release date of the pinned
 * `miniflare`'s workerd, so the newest Workers behaviour is what gets tested.
 * The smoke layer (`scripts/compat-smoke/src/plan.ts`) uses the same date;
 * `pins.test.ts` fails when they drift.
 */
export const WORKERD_COMPATIBILITY_DATE = "2026-07-30";

/** A runtime that runs the suite as a script in a child process. */
export type ProcessRuntime = Extract<Runtime, "node" | "bun">;

/** The command-line usage of `deno task compat:test`. */
export const USAGE: string = `Usage: deno task compat:test <runtime>

Runs every package's unit tests on <runtime>, one of:
  ${RUNTIMES.join(", ")}`;

function isRuntime(value: string): value is Runtime {
	return RUNTIMES.some((runtime) => runtime === value);
}

/**
 * Reads the runtime from the command-line arguments.
 *
 * @param args - The arguments after the task name
 * @returns The runtime, or an error naming what was wrong
 */
export function parseRuntime(args: readonly string[]): Result<Runtime, string> {
	const [name, ...rest] = args;
	if (name === undefined) return Err("missing <runtime>");
	if (rest.length > 0) return Err(`unexpected arguments: ${rest.join(" ")}`);
	return isRuntime(name) ? Ok(name) : Err(`unknown runtime '${name}'`);
}
