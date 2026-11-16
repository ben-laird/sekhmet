/**
 * Reading the probe's report back and judging it: every export path must
 * load, every exercise must pass, and every package must be installed at the
 * version under test.
 *
 * @module
 */

import { z } from "zod";
import { REPORT_MARKER, type Report } from "@/probe/probe.ts";
import {
	exportPaths,
	type PackageName,
	type PublishedPackage,
} from "@/src/package.ts";
import { err, ok, type Result } from "@/src/result.ts";

const Failure = z.object({ ok: z.literal(false), error: z.string() });

const ReportSchema = z.object({
	runtime: z.string(),
	loads: z.array(
		z.intersection(
			z.object({ package: z.string(), specifier: z.string() }),
			z.discriminatedUnion("ok", [
				z.object({ ok: z.literal(true), exports: z.number() }),
				Failure,
			]),
		),
	),
	exercises: z.array(
		z.intersection(
			z.object({ package: z.string() }),
			z.discriminatedUnion("ok", [z.object({ ok: z.literal(true) }), Failure]),
		),
	),
}) satisfies z.ZodType<Report>;

/**
 * Finds the report in the probe's output: the last line that starts with
 * {@linkcode REPORT_MARKER}.
 *
 * @param output - Everything the probe wrote to stdout
 * @returns The report, or why there is none
 */
export function findReport(output: string): Result<Report, string> {
	const line = output
		.split(/\r?\n/)
		.findLast((candidate) => candidate.startsWith(REPORT_MARKER));
	if (line === undefined) return err("the probe printed no report");

	let json: unknown;
	try {
		json = JSON.parse(line.slice(REPORT_MARKER.length));
	} catch (error: unknown) {
		return err(`the report is not JSON: ${String(error)}`);
	}
	const parsed = ReportSchema.safeParse(json);
	return parsed.success
		? ok(parsed.data)
		: err(`the report is malformed: ${z.prettifyError(parsed.error)}`);
}

/** The judgement of one run. */
export interface Verdict {
	/** The per-package, per-export-path summary to print */
	readonly lines: readonly string[];
	/** How many checks failed; the run passes at zero */
	readonly failures: number;
}

function judgePackage({
	pkg,
	installed,
	report,
}: {
	pkg: PublishedPackage;
	installed: string | undefined;
	report: Report;
}): Verdict {
	const lines: string[] = [];
	let failures = 0;
	const fail = (line: string): void => {
		failures++;
		lines.push(`  FAIL ${line}`);
	};

	lines.push(`${pkg.name}@${pkg.version}`);
	if (installed !== pkg.version) {
		fail(
			`installed version is ${installed ?? "missing"}, expected ${pkg.version}`,
		);
	}

	for (const { specifier } of exportPaths(pkg)) {
		const load = report.loads.find((entry) => entry.specifier === specifier);
		if (load === undefined) fail(`${specifier}: never imported`);
		else if (load.ok)
			lines.push(`  ok   ${specifier} (${load.exports} exports)`);
		else fail(`${specifier}: ${load.error}`);
	}

	const exercise = report.exercises.find((entry) => entry.package === pkg.name);
	if (exercise === undefined) fail("exercise: never run");
	else if (exercise.ok) lines.push("  ok   exercise");
	else fail(`exercise: ${exercise.error}`);

	return { lines, failures };
}

/**
 * Judges a run against what was published: each package's installed
 * version, each of its export paths and its exercise.
 *
 * @param params - The packages under test, the versions found installed and
 *   the probe's report
 * @returns The summary and the failure count
 */
export function judge({
	packages,
	installed,
	report,
}: {
	packages: readonly PublishedPackage[];
	installed: ReadonlyMap<PackageName, string>;
	report: Report;
}): Verdict {
	const verdicts = packages.map((pkg) =>
		judgePackage({ pkg, installed: installed.get(pkg.name), report }),
	);
	const failures = verdicts.reduce((sum, verdict) => sum + verdict.failures, 0);
	const paths = packages.flatMap(exportPaths).length;

	return {
		lines: [
			`runtime: ${report.runtime}`,
			...verdicts.flatMap((verdict) => verdict.lines),
			failures === 0
				? `PASS: ${packages.length} packages, ${paths} export paths, ${packages.length} exercises`
				: `FAIL: ${failures} failed checks across ${packages.length} packages and ${paths} export paths`,
		],
		failures,
	};
}
