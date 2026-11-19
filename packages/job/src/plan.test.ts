import { unwrap, unwrapErr } from "@sekhmet/enum/result/mini";
import {
	always,
	DuplicateName,
	defineJobs,
	planJobs,
	succeededWith,
} from "@sekhmet/job";
import { assertEquals } from "@std/assert";

const { job } = defineJobs<{ readonly release: boolean }>();

Deno.test("a dry run shows the whole graph, guards and conditions included", () => {
	// Given: a release graph with a guarded need and an always() cleanup
	let ran = false;
	const version = job({
		name: "version",
		run: () => {
			ran = true;
			return "1.2.0";
		},
	});
	const sign = job({ name: "sign", run: () => "sig" });
	const publish = job({
		name: "publish",
		plan: (p) => {
			const v = p.needs(version);
			const stable = succeededWith({
				need: v,
				where: (value) => !value.startsWith("0."),
				describe: "a stable version",
			});
			return {
				version: v,
				signature: p.needsIf({ job: sign, when: stable }),
				dryRun: !p.context.release,
			};
		},
		run: () => {},
	});
	const cleanup = job({
		name: "cleanup",
		plan: (p) => ({ publish: p.needs(publish) }),
		runIf: always(),
		continueOnError: true,
		run: () => {},
	});

	// When: it is planned, not run
	const graph = unwrap(
		planJobs({ jobs: { cleanup }, context: { release: false } }),
	);

	// Then: every job is there, the guarded one included, and nothing ran
	assertEquals(
		[...graph.jobs.keys()],
		["cleanup", "publish", "version", "sign"],
	);
	assertEquals(ran, false);

	// Then: each job shows its needs, guards and runIf
	assertEquals(graph.jobs.get("publish")?.needs, [
		{ job: "version", when: undefined },
		{ job: "sign", when: "version succeeded with a stable version" },
	]);
	assertEquals(graph.jobs.get("publish")?.plan.dryRun, true);
	assertEquals(graph.jobs.get("cleanup")?.runIf, "always()");
	assertEquals(graph.jobs.get("cleanup")?.continueOnError, true);
	assertEquals(graph.jobs.get("publish")?.runIf, "success()");
});

Deno.test("a dry run finds duplicate names, as a run does", () => {
	// Given: two different jobs named "build"
	const first = job({ name: "build", run: () => {} });
	const second = job({ name: "build", run: () => {} });

	// When: they are planned
	const result = planJobs({
		jobs: { first, second },
		context: { release: true },
	});

	// Then: DuplicateName
	assertEquals(unwrapErr(result), DuplicateName("build"));
});
