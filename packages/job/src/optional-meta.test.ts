/**
 * Optional `meta`: `runJobs` and `planJobs` may omit it whenever every
 * root's metadata type accepts `undefined`, and then every plan, factory
 * and body reads `undefined`. Otherwise it stays required.
 */

import { unwrap } from "@sekhmet/enum/result/mini";
import { defineJobs, planJobs, runJobs, Succeeded } from "@sekhmet/job";
import { assertEquals } from "@std/assert";

interface Config {
	readonly target: string;
}

Deno.test("a factory that ignores its parameter needs no meta", async () => {
	// Given: a kit whose factory ignores its parameter, so its metadata is unknown
	const { job } = defineJobs(() => ({}));
	const build = job({ name: "build", run: () => "dist" });

	// When: it runs and plans with meta omitted, and with meta: null as before
	const omitted = unwrap(await runJobs({ jobs: { build } }));
	const asBefore = unwrap(await runJobs({ jobs: { build }, meta: null }));
	const planned = unwrap(planJobs({ jobs: { build } }));
	const plannedAsBefore = unwrap(planJobs({ jobs: { build }, meta: null }));

	// Then: both forms compile and run the same graph
	assertEquals(omitted.outcomes.build, Succeeded("dist"));
	assertEquals(asBefore.outcomes.build, Succeeded("dist"));
	assertEquals([...planned.jobs.keys()], ["build"]);
	assertEquals([...plannedAsBefore.jobs.keys()], ["build"]);
});

Deno.test("an omitted meta reaches plans, the factory and run as undefined", async () => {
	// Given: a kit whose metadata accepts undefined, recording what each part saw
	const seen: { readonly by: string; readonly meta: Config | undefined }[] = [];
	const { job } = defineJobs((meta: Config | undefined) => {
		seen.push({ by: "factory", meta });
		return {};
	});
	const deploy = job({
		name: "deploy",
		plan: (p) => {
			seen.push({ by: "plan", meta: p.meta });
			return {};
		},
		run: (r) => {
			seen.push({ by: "run", meta: r.meta });
		},
	});

	// When: it runs with meta omitted
	unwrap(await runJobs({ jobs: { deploy } }));

	// Then: each saw undefined
	assertEquals(seen, [
		{ by: "plan", meta: undefined },
		{ by: "factory", meta: undefined },
		{ by: "run", meta: undefined },
	]);
});

Deno.test("an omitted meta reaches a dry run's plans as undefined", () => {
	// Given: a kit whose metadata accepts undefined, its plan recording p.meta
	const seen: (Config | undefined)[] = [];
	const { job } = defineJobs((_meta: Config | undefined) => ({}));
	const deploy = job({
		name: "deploy",
		plan: (p) => {
			seen.push(p.meta);
			return {};
		},
		run: () => {},
	});

	// When: it plans with meta omitted
	unwrap(planJobs({ jobs: { deploy } }));

	// Then: the plan saw undefined
	assertEquals(seen, [undefined]);
});

Deno.test("a metadata type that rejects undefined keeps meta required", async () => {
	// Given: a kit whose metadata is a Config, and one whose metadata accepts undefined
	const { job } = defineJobs((meta: Config) => meta);
	const deploy = job({ name: "deploy", run: (r) => r.ctx.target });
	const optional = defineJobs((_meta: Config | undefined) => ({}));
	const lint = optional.job({ name: "lint", run: () => {} });
	const meta: Config = { target: "prod" };

	// When: meta is omitted for the Config roots, alone or mixed, and then given
	const check = (): void => {
		// @ts-expect-error: meta is required when the metadata rejects undefined
		runJobs({ jobs: { deploy } });
		// @ts-expect-error: a dry run requires it too
		planJobs({ jobs: { deploy } });
		// @ts-expect-error: one root that rejects undefined makes it required
		runJobs({ jobs: { deploy, lint } });
	};
	const report = unwrap(await runJobs({ jobs: { deploy, lint }, meta }));

	// Then: the omissions don't compile, and mixed roots run given meta
	assertEquals(typeof check, "function");
	assertEquals(report.outcomes.deploy, Succeeded("prod"));
});

Deno.test("mixed roots whose metadata all accept undefined need no meta", async () => {
	// Given: roots from a kit with unknown metadata and one with Config | undefined
	const loose = defineJobs(() => ({}));
	const optional = defineJobs((meta: Config | undefined) => meta);
	const build = loose.job({ name: "build", run: () => "dist" });
	const deploy = optional.job({
		name: "deploy",
		run: (r) => r.ctx?.target ?? "nowhere",
	});

	// When: they run together with meta omitted, and with a Config
	const omitted = unwrap(await runJobs({ jobs: { build, deploy } }));
	const given = unwrap(
		await runJobs({ jobs: { build, deploy }, meta: { target: "prod" } }),
	);

	// Then: both compile, and each run sees the meta it was given
	assertEquals(omitted.outcomes.deploy, Succeeded("nowhere"));
	assertEquals(given.outcomes.deploy, Succeeded("prod"));
});
