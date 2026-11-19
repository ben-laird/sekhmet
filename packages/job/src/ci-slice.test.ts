/**
 * A slice of `scripts/ci/main.ts`'s step graph, expressed as jobs, to show
 * the design can carry the CI runner's semantics (`scripts/ci/src/step.ts`'s
 * `gateStep`): a `success` step with a dependency, a predicate step, a
 * `failure` step, and an `always` step with `continueOnError`. Bodies are
 * stubs that record they ran and fail on demand.
 */

import { unwrap } from "@sekhmet/enum/result/mini";
import {
	all,
	always,
	Blocked,
	defineJobs,
	failure,
	type JobRun,
	runJobs,
	Skipped,
	Succeeded,
} from "@sekhmet/job";
import { assert, assertEquals } from "@std/assert";

interface CiContext {
	/** `isCI || isAI` in `scripts/ci/main.ts` */
	readonly reportsCoverage: boolean;
	/** The stub bodies that should fail */
	readonly failing: ReadonlySet<string>;
	/** Where the stubs record that they ran */
	readonly ran: string[];
}

const { job } = defineJobs<CiContext>();

/** A stub body: records the step, then fails if the context says so. */
function stub(name: string): (t: JobRun<CiContext>) => void {
	return (t) => {
		t.context.ran.push(name);
		if (t.context.failing.has(name)) throw new Error(`${name} failed`);
	};
}

// "Deno Lint": no dependencies.
const lint = job({ name: "Deno Lint", run: stub("Deno Lint") });

// "Deno Test": dependsOn ["Deno Lint"], condition "success" (the default).
const test = job({
	name: "Deno Test",
	plan: (p) => ({ lint: p.needs(lint) }),
	run: stub("Deno Test"),
});

// "Show coverage report": dependsOn ["Deno Test"], condition () => isCI ||
// isAI: the default rule (all the needs succeeded) plus a predicate.
const coverage = job({
	name: "Show coverage report",
	plan: (p) => ({ test: p.needs(test) }),
	runIf: ({ context, needs }) => {
		return context.reportsCoverage && all(needs).isSucceeded();
	},
	run: stub("Show coverage report"),
});

// A "failure" step (none in main.ts today): runs only if a dependency is
// unhealthy, else skipped, even after a cancel.
const explainFailure = job({
	name: "Explain failure",
	plan: (p) => ({ test: p.needs(test) }),
	runIf: failure(),
	run: stub("Explain failure"),
});

// "Cleanup coverage data": dependsOn ["Show coverage report"], condition
// "always", continueOnError.
const cleanup = job({
	name: "Cleanup coverage data",
	plan: (p) => ({ coverage: p.needs(coverage) }),
	runIf: always(),
	continueOnError: true,
	run: stub("Cleanup coverage data"),
});

async function ci(context: Omit<CiContext, "ran">) {
	const ran: string[] = [];
	const report = unwrap(
		await runJobs({
			jobs: { explainFailure, cleanup },
			context: { ...context, ran },
		}),
	);
	return { report, ran };
}

Deno.test("scripts/ci slice: everything passes in CI", async () => {
	// Given: CI mode, nothing failing
	// When: the workflow runs
	const { report, ran } = await ci({
		reportsCoverage: true,
		failing: new Set(),
	});

	// Then: every success step ran, the failure step skipped, cleanup ran last
	assertEquals(ran, [
		"Deno Lint",
		"Deno Test",
		"Show coverage report",
		"Cleanup coverage data",
	]);
	assertEquals(report.outcomes.explainFailure, Skipped());
	assert(report.passed);
});

Deno.test("scripts/ci slice: a lint failure blocks downstream", async () => {
	// Given: CI mode, lint failing
	// When: the workflow runs
	const { report, ran } = await ci({
		reportsCoverage: true,
		failing: new Set(["Deno Lint"]),
	});

	// Then: test is blocked by lint; coverage's own condition is false
	assertEquals(report.all.get("Deno Test"), Blocked(["Deno Lint"]));
	assertEquals(report.all.get("Show coverage report"), Skipped());

	// Then: the failure step and the always step still ran
	assertEquals(ran, ["Deno Lint", "Explain failure", "Cleanup coverage data"]);
	assertEquals(report.outcomes.explainFailure, Succeeded(undefined));
	assertEquals(report.passed, false);
});

Deno.test("scripts/ci slice: local runs skip coverage, cleanup may fail", async () => {
	// Given: a local run (no coverage report) whose cleanup fails
	// When: the workflow runs
	const { report, ran } = await ci({
		reportsCoverage: false,
		failing: new Set(["Cleanup coverage data"]),
	});

	// Then: coverage is skipped by its predicate, and cleanup still ran
	assertEquals(report.all.get("Show coverage report"), Skipped());
	assertEquals(ran, ["Deno Lint", "Deno Test", "Cleanup coverage data"]);

	// Then: cleanup failed, but continueOnError keeps the run passing
	assert(report.outcomes.cleanup.isFailed());
	assert(report.passed);
});
