/**
 * The command line: `deno task compat:smoke <runtime> [--version <v>]...
 * [--keep]`.
 *
 * @module
 */

import { Err, Ok, type Result } from "@sekhmet/enum/result/mini";
import { parseArgs } from "@std/cli";
import { isPackageName, type PackageName } from "@/src/package.ts";
import type { VersionRequests } from "@/src/registry.ts";
import { isRuntime, RUNTIMES, type Runtime } from "@/src/runtime.ts";

/** How to invoke the command, printed on a usage error. */
export const USAGE: string = [
	`usage: deno task compat:smoke <${RUNTIMES.join("|")}> [options]`,
	"",
	"  --version <version>         test every package at <version> (default: latest)",
	"  --version <name>@<version>  test one package at <version>, e.g. @sekhmet/enum@0.1.0",
	"  --keep                      keep the temporary project and print its path",
].join("\n");

/** One smoke run, as asked for on the command line. */
export interface Options {
	/** The runtime to test on */
	readonly runtime: Runtime;
	/** Which versions to test */
	readonly requests: VersionRequests;
	/** Keep the temporary project for inspection */
	readonly keep: boolean;
}

const PACKAGE_VERSION = /^(@[^@/]+\/[^@/]+)@(.+)$/;

/**
 * Parses the command line.
 *
 * @param args - The arguments after the task name
 * @returns The run's options, or a message saying what is wrong
 */
export function parseOptions(args: readonly string[]): Result<Options, string> {
	const parsed = parseArgs([...args], {
		string: ["version"],
		boolean: ["keep"],
		collect: ["version"],
	});
	const unknown = args.filter(
		(arg) => arg.startsWith("-") && !/^--(version|keep)(=|$)/.test(arg),
	);
	if (unknown.length > 0) return Err(`unknown option: ${unknown.join(" ")}`);

	const [runtime, ...extra] = parsed._.map(String);
	if (runtime === undefined) return Err("missing <runtime>");
	if (!isRuntime(runtime)) return Err(`unknown runtime: ${runtime}`);
	if (extra.length > 0) return Err(`unexpected arguments: ${extra.join(" ")}`);

	let all: string | undefined;
	const byPackage = new Map<PackageName, string>();
	for (const request of parsed.version) {
		const match = PACKAGE_VERSION.exec(request);
		if (match === null) {
			if (all !== undefined && all !== request) {
				return Err(`conflicting --version values: ${all} and ${request}`);
			}
			all = request;
			continue;
		}
		const [, name = "", version = ""] = match;
		if (!isPackageName(name)) return Err(`not a JSR package name: ${name}`);
		byPackage.set(name, version);
	}

	return Ok({ runtime, requests: { all, byPackage }, keep: parsed.keep });
}
