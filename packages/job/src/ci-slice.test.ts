/**
 * A slice of `scripts/ci/main.ts`'s step graph, expressed as jobs, to show
 * the design can carry the CI runner's semantics (`scripts/ci/src/step.ts`'s
 * `gateStep`): a `success` step with a dependency, a predicate step, a
 * `failure` step, and an `always` step with `continueOnError`. Bodies are
 * stubs that record they ran and fail on demand.
 */

import { isolate } from "@sekhmet/enum/core/mini";
import { isErr, unwrap } from "@sekhmet/enum/result/mini";
import {
	Blocked,
	defineJobs,
	isUnhealthy,
	type JobOutcome,
	type RunReport,
	runJobs,
	Skipped,
	Succeeded,
	skip,
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

const { job, observer } = defineJobs<CiContext>();

/** A stub body: records the step, then fails if the context says so. */
const stub = (name: string) => {
	return (t: { readonly context: CiContext }): void => {
		t.context.ran.push(name);
		if (t.context.failing.has(name)) throw new Error(`${name} failed`);
	};
};

// "Deno Lint": no dependencies.
const lint = job({ name: "Deno Lint", run: stub("Deno Lint") });

// "Deno Test": dependsOn ["Deno Lint"], condition "success" (the default).
const test = job({
	name: "Deno Test",
	plan: (p) => ({ lint: p.needs(lint) }),
	run: stub("Deno Test"),
});

// "Show coverage report": dependsOn ["Deno Test"], condition () => isCI || isAI.
// A predicate is "success, then skipped when false": giving up on an unmet
// result first keeps Blocked ahead of Skipped, as gateStep does.
const coverage = job({
	name: "Show coverage report",
	plan: async (p) => {
		const tested = await p.result(test);
		if (isErr(tested)) return tested;
		return p.context.reportsCoverage ? {} : skip();
	},
	run: stub("Show coverage report"),
});

// A "failure" step (none in main.ts today): runs only if a dependency is
// unhealthy, else skipped. An observer, so a cancelled run still runs it.
const explainFailure = observer({
	name: "Explain failure",
	plan: async (p) => (isUnhealthy(await p.outcome(test)) ? {} : skip()),
	run: stub("Explain failure"),
});

// "Cleanup coverage data": dependsOn ["Show coverage report"], condition
// "always", continueOnError. An observer, as "always" survives cancellation.
const cleanup = observer({
	name: "Cleanup coverage data",
	continueOnError: true,
	plan: async (p) => {
		await p.outcome(coverage);
		return {};
	},
	run: stub("Cleanup coverage data"),
});

const workflow = [lint, test, coverage, explainFailure, cleanup];

async function ci(context: Omit<CiContext, "ran">) {
	const ran: string[] = [];
	const report = unwrap(
		await runJobs({ jobs: workflow, context: { ...context, ran } }),
	);
	return { report, ran };
}

function outcomeOf({
	report,
	name,
}: {
	report: RunReport;
	name: string;
}): JobOutcome<unknown> {
	const outcome = report.outcomes.get(name);
	assert(outcome !== undefined, `no outcome for ${name}`);
	return outcome;
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
	assertEquals(outcomeOf({ report, name: "Explain failure" }), Skipped());
	assert(report.passed);
});

Deno.test("scripts/ci slice: a lint failure blocks downstream", async () => {
	// Given: CI mode, lint failing
	// When: the workflow runs
	const { report, ran } = await ci({
		reportsCoverage: true,
		failing: new Set(["Deno Lint"]),
	});

	// Then: test is blocked by lint, coverage by test (blocked, not skipped)
	assertEquals(
		outcomeOf({ report, name: "Deno Test" }),
		Blocked(["Deno Lint"]),
	);
	assertEquals(
		outcomeOf({ report, name: "Show coverage report" }),
		Blocked(["Deno Test"]),
	);

	// Then: the failure step and the always step still ran
	assertEquals(ran, ["Deno Lint", "Explain failure", "Cleanup coverage data"]);
	assertEquals(
		outcomeOf({ report, name: "Explain failure" }),
		Succeeded(undefined),
	);
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
	assertEquals(outcomeOf({ report, name: "Show coverage report" }), Skipped());
	assertEquals(ran, ["Deno Lint", "Deno Test", "Cleanup coverage data"]);

	// Then: cleanup failed, but continueOnError keeps the run passing
	assert(
		isolate(outcomeOf({ report, name: "Cleanup coverage data" }), "Failed"),
	);
	assert(report.passed);
});
