/**
 * `deno task compat:test <runtime>`: bundles every package's unit tests and
 * runs them on a non-Deno runtime, then prints a per-package summary. Exits 0
 * when every test passed and every test file loaded, 1 when not, and 2 on a
 * usage error or when the runtime could not run the suite.
 *
 * @module
 */

import { isErr, unwrap, unwrapErr } from "@sekhmet/enum/result/mini";
import { fromFileUrl } from "@std/path";
import { buildBundle } from "./src/bundle.ts";
import {
	formatReport,
	parseSuiteReport,
	problemsOf,
	withHostErrors,
} from "./src/report.ts";
import { runOn } from "./src/runners.ts";
import { parseRuntime, USAGE } from "./src/runtime.ts";

const REPO_ROOT = fromFileUrl(new URL("../../", import.meta.url));

async function main(args: readonly string[]): Promise<number> {
	const runtime = parseRuntime(args);
	if (isErr(runtime)) {
		console.error(`compat:test: ${unwrapErr(runtime)}\n\n${USAGE}`);
		return 2;
	}
	const work = await Deno.makeTempDir({ prefix: "sekhmet-compat-" });
	try {
		const bundle = await buildBundle({ root: REPO_ROOT, work });
		if (isErr(bundle)) {
			console.error(unwrapErr(bundle));
			return 2;
		}
		console.log(
			`compat:test: running ${unwrap(bundle).files.length} test files on ${unwrap(
				runtime,
			)}`,
		);
		const output = await runOn({
			runtime: unwrap(runtime),
			bundle: unwrap(bundle),
		});
		if (isErr(output)) {
			console.error(`compat:test: ${unwrapErr(output)}`);
			return 2;
		}
		const { data, hostErrors } = unwrap(output);
		const parsed = parseSuiteReport(data);
		if (isErr(parsed)) {
			console.error(`compat:test: ${unwrapErr(parsed)}`);
			return 2;
		}
		const report = withHostErrors({ report: unwrap(parsed), hostErrors });
		console.log(formatReport({ runtime: unwrap(runtime), report }));
		return problemsOf(report).length === 0 ? 0 : 1;
	} finally {
		await Deno.remove(work, { recursive: true });
	}
}

if (import.meta.main) {
	Deno.exit(await main(Deno.args));
}
