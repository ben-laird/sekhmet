import { isolate, union } from "@sekhmet/enum/core/mini";
import { unwrap, unwrapErr } from "@sekhmet/enum/result/mini";
import {
	Cycle,
	DuplicateName,
	defineJobs,
	type Job,
	type JobGraph,
	JobPlan,
	planJobs,
	skip,
} from "@sekhmet/job";
import { assert, assertEquals, assertInstanceOf } from "@std/assert";

const { job, observer } = defineJobs<{ readonly release: boolean }>();

function planOf({ graph, name }: { graph: JobGraph; name: string }): JobPlan {
	const plan = graph.jobs.get(name);
	assert(plan !== undefined, `no plan for ${name}`);
	return plan;
}

Deno.test("a dry run calls every plan and runs no body", async () => {
	// Given: a graph whose bodies would record that they ran
	const ran: string[] = [];
	const version = job({ name: "version", run: () => void ran.push("version") });
	const build = job({
		name: "build",
		plan: (p) => ({ version: p.needs(version), target: "esm" }),
		run: () => void ran.push("build"),
	});
	const publish = job({
		name: "publish",
		plan: (p) => ({ build: p.needs(build), version: p.needs(version) }),
		run: () => void ran.push("publish"),
	});

	// When: planning from publish
	const graph = unwrap(
		await planJobs({ jobs: [publish], context: { release: true } }),
	);

	// Then: every reachable job is planned, in the order plans reached them
	assertEquals([...graph.jobs.keys()], ["publish", "build", "version"]);
	assertEquals(ran, []);

	// Then: each plan lists its needs in declaration order, and keeps its data
	const buildPlan = planOf({ graph, name: "build" });
	assert(isolate(buildPlan, "Planned"));
	assertEquals(union(buildPlan).needs, ["version"]);
	assertEquals(Object.entries(union(buildPlan).plan)[1], ["target", "esm"]);
	const publishPlan = planOf({ graph, name: "publish" });
	assert(isolate(publishPlan, "Planned"));
	assertEquals(union(publishPlan).needs, ["build", "version"]);
});

Deno.test("plans read the context in a dry run too", async () => {
	// Given: a plan that needs sign only for a release
	const sign = job({ name: "sign", run: () => "sig" });
	const publish = job({
		name: "publish",
		plan: (p) => ({ sign: p.context.release ? p.needs(sign) : undefined }),
		run: () => {},
	});

	// When: planning without and with a release
	const draft = unwrap(
		await planJobs({ jobs: [publish], context: { release: false } }),
	);
	const release = unwrap(
		await planJobs({ jobs: [publish], context: { release: true } }),
	);

	// Then: the graph follows the context
	assertEquals([...draft.jobs.keys()], ["publish"]);
	assertEquals([...release.jobs.keys()], ["publish", "sign"]);
});

Deno.test("a plan that awaits a result is pending on that job", async () => {
	// Given: a staged plan that declares a need twice, then awaits a result
	const lint = job({ name: "lint", run: () => {} });
	const version = job({ name: "version", run: () => "1.0.0" });
	const publish = job({
		name: "publish",
		plan: async (p) => {
			const lintHandle = p.needs(lint);
			const again = p.needs(lint);
			return { lint: lintHandle, again, version: await p.result(version) };
		},
		run: () => {},
	});

	// When: planning
	const graph = unwrap(
		await planJobs({ jobs: [publish], context: { release: true } }),
	);

	// Then: publish is pending on version, having declared lint (once) so far
	assertEquals(
		planOf({ graph, name: "publish" }),
		new JobPlan("Pending", { on: "version", needs: ["lint"] }),
	);
	assert(isolate(planOf({ graph, name: "version" }), "Planned"));
});

Deno.test("a dry run reports skipped and failed plans", async () => {
	// Given: a plan that skips and one that throws
	const skipped = job({ name: "skipped", plan: () => skip(), run: () => {} });
	const broken = job({
		name: "broken",
		plan: (): { n: number } => {
			throw new Error("bad plan");
		},
		run: () => {},
	});

	// When: planning both
	const graph = unwrap(
		await planJobs({ jobs: [skipped, broken], context: { release: true } }),
	);

	// Then: each is reported as such
	assertEquals(planOf({ graph, name: "skipped" }), new JobPlan("Skipped"));
	const failed = planOf({ graph, name: "broken" });
	assert(isolate(failed, "Failed"));
	assertInstanceOf(union(failed), Error);
});

Deno.test("a dry run finds duplicate names and cycles", async (t) => {
	await t.step("duplicate names", async () => {
		// Given: two jobs named alike
		const a = job({ name: "same", run: () => 1 });
		const b = job({ name: "same", run: () => 2 });

		// When: planning both
		const result = await planJobs({ jobs: [a, b], context: { release: true } });

		// Then: DuplicateName
		assertEquals(unwrapErr(result), DuplicateName("same"));
	});

	await t.step("a cycle through an await", async () => {
		// Given: a needs b, and b's plan awaits a's outcome
		const ref: { a?: Job<void, { readonly release: boolean }> } = {};
		const b = job({
			name: "b",
			plan: async (p) => {
				if (ref.a !== undefined) await p.outcome(ref.a);
				return {};
			},
			run: () => {},
		});
		ref.a = job({ name: "a", plan: (p) => ({ b: p.needs(b) }), run: () => {} });

		// When: planning
		const result = await planJobs({
			jobs: [ref.a],
			context: { release: true },
		});

		// Then: the cycle is an Err
		assertEquals(unwrapErr(result), Cycle(["b", "a", "b"]));
	});
});

Deno.test("a dry run parks a plan at p.result, so its finally doesn't run", async () => {
	// Given: a staged plan with a finally after its p.result
	let finished = false;
	const version = job({ name: "version", run: () => "1.0.0" });
	const publish = job({
		name: "publish",
		plan: async (p) => {
			try {
				return { version: await p.result(version) };
			} finally {
				finished = true;
			}
		},
		run: () => {},
	});

	// When: dry-running it
	const graph = unwrap(
		await planJobs({ jobs: [publish], context: { release: true } }),
	);

	// Then: it is Pending on version, and its finally never ran
	assert(isolate(planOf({ graph, name: "publish" }), "Pending"));
	assertEquals(finished, false);
});

Deno.test("a dry run names the observers", async () => {
	// Given: a build, and an observer of its outcome
	const build = job({ name: "build", run: () => "dist" });
	const notify = observer({
		name: "notify",
		plan: async (p) => ({ outcome: await p.outcome(build) }),
		run: () => {},
	});

	// When: dry-running both
	const graph = unwrap(
		await planJobs({ jobs: [build, notify], context: { release: true } }),
	);

	// Then: only notify is an observer, and it is Pending on build's outcome
	assertEquals([...graph.observers], ["notify"]);
	assertEquals(
		planOf({ graph, name: "notify" }),
		new JobPlan("Pending", { on: "build", needs: [] }),
	);
});
