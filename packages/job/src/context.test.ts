/**
 * The context factory: each job that starts gets its own context, built
 * from the run's metadata just before its `run`.
 */

import { unwrap } from "@sekhmet/enum/result/mini";
import {
	Blocked,
	defineJobs,
	failure,
	runJobs,
	Skipped,
	Succeeded,
} from "@sekhmet/job";
import { assert, assertEquals, assertStrictEquals } from "@std/assert";

interface Meta {
	/** Where the factory records each job it built a context for */
	readonly built: string[];
}

/** A kit whose factory records its calls and gives each job a fresh log. */
function recordingKit() {
	return defineJobs((meta: Meta, { job }) => {
		meta.built.push(job);
		const log: string[] = [];
		return { job, log };
	});
}

Deno.test("each job that starts builds its own context, once", async () => {
	// Given: two jobs that each write to their context, one needing the other
	const { job } = recordingKit();
	const first = job({
		name: "first",
		run: (r) => {
			r.ctx.log.push("first wrote");
			return [...r.ctx.log];
		},
	});
	const second = job({
		name: "second",
		plan: (p) => ({ first: p.needs(first) }),
		run: (r) => {
			r.ctx.log.push("second wrote");
			return [...r.ctx.log];
		},
	});
	const meta: Meta = { built: [] };

	// When: both run, second reached through two roots
	const report = unwrap(
		await runJobs({ jobs: { second, again: second, first }, meta }),
	);

	// Then: each job saw only its own writes, and each context was built once
	assertEquals(report.outcomes.first, Succeeded(["first wrote"]));
	assertEquals(report.outcomes.second, Succeeded(["second wrote"]));
	assertEquals([...meta.built].sort(), ["first", "second"]);
});

Deno.test("the factory gets the run's meta and the job's name", async () => {
	// Given: a job whose run reads the context the factory made
	const { job } = recordingKit();
	const named = job({ name: "named", run: (r) => r.ctx.job });
	const meta: Meta = { built: [] };

	// When: it runs
	const report = unwrap(await runJobs({ jobs: { named }, meta }));

	// Then: the factory was called with the job's display name
	assertEquals(report.outcomes.named, Succeeded("named"));
	assertEquals(meta.built, ["named"]);
});

Deno.test("r.meta is the value runJobs was given", async () => {
	// Given: a job returning its meta
	const { job } = recordingKit();
	const echo = job({ name: "echo", run: (r) => r.meta });
	const meta: Meta = { built: [] };

	// When: it runs
	const report = unwrap(await runJobs({ jobs: { echo }, meta }));

	// Then: it is the same object
	assertStrictEquals(report.outcomes.echo.value().unwrap(), meta);
});

Deno.test("a job that never starts never builds a context", async () => {
	// Given: a failing job, a dependent it blocks, and a failure() job it skips
	const { job } = recordingKit();
	const broken = job({
		name: "broken",
		run: () => {
			throw new Error("broke");
		},
	});
	const blocked = job({
		name: "blocked",
		plan: (p) => ({ broken: p.needs(broken) }),
		run: () => {},
	});
	const ok = job({ name: "ok", run: () => {} });
	const skipped = job({
		name: "skipped",
		plan: (p) => ({ ok: p.needs(ok) }),
		runIf: failure(),
		run: () => {},
	});
	const meta: Meta = { built: [] };

	// When: they run
	const report = unwrap(await runJobs({ jobs: { blocked, skipped }, meta }));

	// Then: only the jobs that started built a context
	assertEquals(report.outcomes.blocked, Blocked(["broken"]));
	assertEquals(report.outcomes.skipped, Skipped());
	assertEquals([...meta.built].sort(), ["broken", "ok"]);
});

Deno.test("a factory that throws fails its job, and only its job", async () => {
	// Given: a factory that throws for one job
	const boom = new Error("no connection");
	const { job } = defineJobs((_meta: null, { job }) => {
		if (job === "doomed") throw boom;
		return {};
	});
	let ran = false;
	const doomed = job({
		name: "doomed",
		run: () => {
			ran = true;
		},
	});
	const fine = job({ name: "fine", run: () => "fine" });

	// When: both run
	const report = unwrap(await runJobs({ jobs: { doomed, fine }, meta: null }));

	// Then: the doomed job failed with the throw, before its run; fine ran
	assert(report.outcomes.doomed.isFailed());
	assertStrictEquals(report.outcomes.doomed.error().unwrap(), boom);
	assertEquals(ran, false);
	assertEquals(report.outcomes.fine, Succeeded("fine"));
});
