/**
 * Our own pipelines, written as job graphs (#57, decisions 12 and 13).
 *
 * GitHub Actions keeps *where and when* (triggers, VMs, permissions, the
 * matrix's one VM per runtime); the job graph owns *what*, in TypeScript,
 * and runs the same on a laptop. Shell commands go through each job's
 * context (`r.ctx.sh`), which the factory builds from the run's metadata,
 * so these tests swap in a fake shell that records what ran and fails on
 * demand.
 */

import { unwrap, unwrapErr } from "@sekhmet/enum/result/mini";
import {
	all,
	always,
	Blocked,
	Cycle,
	DuplicateKey,
	DuplicateName,
	defineJobs,
	type Job,
	type JobOutcome,
	planJobs,
	runJobs,
	Skipped,
	Succeeded,
} from "@sekhmet/job";
import { assert, assertEquals } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";

/** What every pipeline's metadata carries: a way to run a command. */
interface Shell {
	readonly sh: (command: string) => Promise<void>;
}

/** A fake shell: records each command, and fails the ones in `failing`. */
function fakeShell({
	failing = [],
}: {
	readonly failing?: readonly string[];
} = {}): Shell & { readonly ran: readonly string[] } {
	const ran: string[] = [];
	const sh = async (command: string): Promise<void> => {
		ran.push(command);
		await Promise.resolve();
		if (failing.includes(command)) throw new Error(`${command} exited 1`);
	};
	return { sh, ran };
}

// 1. `deno task ci`: scripts/ci's step graph, as jobs.

interface CiMeta extends Shell {
	/** `isCI || isAI` in scripts/ci/main.ts */
	readonly reportsCoverage: boolean;
}

const ci = defineJobs((meta: CiMeta) => ({ sh: meta.sh }));

function command({
	name,
	run,
}: {
	readonly name: string;
	readonly run: string;
}): Job<void, CiMeta> {
	return ci.job({ name, run: (r) => r.ctx.sh(run) });
}

const lint = command({ name: "Deno Lint", run: "deno lint" });
const check = command({ name: "Deno Check", run: "deno check" });
const biome = command({ name: "Biome Check", run: "biome check" });

const test = ci.job({
	name: "Deno Test",
	plan: (p) => ({ lint: p.needs(lint) }),
	run: (r) => r.ctx.sh("deno test --coverage"),
});

// scripts/ci's `condition: () => isCI || isAI` on a success step: the
// default rule (all the needs succeeded) plus a predicate.
const coverage = ci.job({
	name: "Show coverage report",
	plan: (p) => ({ test: p.needs(test) }),
	runIf: ({ meta, needs }) => {
		return meta.reportsCoverage && all(needs).isSucceeded();
	},
	run: (r) => r.ctx.sh("deno coverage"),
});

// scripts/ci's `condition: "always"` with continueOnError.
const cleanup = ci.job({
	name: "Cleanup coverage data",
	plan: (p) => ({ coverage: p.needs(coverage) }),
	runIf: always(),
	continueOnError: true,
	run: (r) => r.ctx.sh("rm -rf coverage"),
});

// The verdict: what has to pass. Coverage isn't in it, since a skipped need
// would make the gate skipped too (as in GitHub Actions).
const gate = ci.job({
	name: "Gate",
	plan: (p) => {
		return {
			lint: p.needs(lint),
			check: p.needs(check),
			biome: p.needs(biome),
			test: p.needs(test),
		};
	},
	run: () => "green",
});

Deno.test("ci: the report is typed like Promise.all", async () => {
	// Given: a laptop run, so no coverage report
	const shell = fakeShell();

	// When: the gate and its cleanup run, as a record of roots
	const report = unwrap(
		await runJobs({
			jobs: { gate, cleanup },
			meta: { sh: shell.sh, reportsCoverage: false },
		}),
	);

	// Then: each root comes back under its own key, with its own type
	assertType<IsExact<typeof report.outcomes.gate, JobOutcome<string>>>(true);
	assertType<IsExact<typeof report.outcomes.cleanup, JobOutcome<void>>>(true);
	assertEquals(report.outcomes.gate, Succeeded("green"));
	assertEquals(report.outcomes.cleanup, Succeeded(undefined));
	assert(report.passed);

	// Then: a root's outcome hands off to Result-speaking code
	assertEquals(report.outcomes.gate.toResult().unwrap(), "green");

	// Then: jobs reached on the way are in `all`, for renderers
	assertEquals(report.all.get("Show coverage report"), Skipped());
	assert(!shell.ran.includes("deno coverage"));
});

Deno.test("ci: a lint failure blocks test, not its siblings", async () => {
	// Given: CI, with lint failing
	const shell = fakeShell({ failing: ["deno lint"] });

	// When: the gate and its cleanup run
	const report = unwrap(
		await runJobs({
			jobs: { gate, cleanup },
			meta: { sh: shell.sh, reportsCoverage: true },
		}),
	);

	// Then: the gate is blocked by both, and the run fails
	assertEquals(report.outcomes.gate, Blocked(["Deno Lint", "Deno Test"]));
	assert(!report.passed);

	// Then: test is blocked by lint, while check and biome still ran
	assertEquals(report.all.get("Deno Test"), Blocked(["Deno Lint"]));
	assertEquals(report.all.get("Deno Check"), Succeeded(undefined));
	assertEquals(report.all.get("Biome Check"), Succeeded(undefined));

	// Then: coverage's own condition is false (Skipped), and cleanup runs anyway
	assertEquals(report.all.get("Show coverage report"), Skipped());
	assertEquals(report.outcomes.cleanup, Succeeded(undefined));
});

// 2. Release: one graph, generated from the workspace. A family makes one
//    publish job per package, and it needs itself for each dependency.

interface Package {
	readonly name: string;
	/** What it imports, which fixes the publish order */
	readonly deps: readonly Package[];
}

const primordials: Package = { name: "@sekhmet/primordials", deps: [] };
const matrix: Package = { name: "@sekhmet/matrix", deps: [] };
const enumPkg: Package = { name: "@sekhmet/enum", deps: [primordials] };
const panic: Package = { name: "@sekhmet/panic", deps: [primordials] };
const vow: Package = { name: "@sekhmet/vow", deps: [enumPkg] };
const schema: Package = { name: "@sekhmet/schema", deps: [enumPkg, panic] };
const WORKSPACE: readonly Package[] = [
	primordials,
	matrix,
	enumPkg,
	panic,
	vow,
	schema,
];

/** Builds the release graph for a workspace. */
function releaseGraph(workspace: readonly Package[]): {
	readonly announce: Job<readonly string[], Shell>;
} {
	const { job, family } = defineJobs((shell: Shell) => shell);

	const qualityGate = job({
		name: "Quality gate",
		run: (r) => r.ctx.sh("deno task ci"),
	});

	// The same job for the same key; the annotation breaks the type cycle.
	const publish: (pkg: Package) => Job<string, Shell> = family({
		key: (pkg: Package) => pkg.name,
		define: (pkg) => {
			return job({
				name: `publish ${pkg.name}`,
				plan: (p) => {
					return {
						gate: p.needs(qualityGate),
						deps: pkg.deps.map((dep) => p.needs(publish(dep))),
					};
				},
				run: async (r, { deps }) => {
					assertType<IsExact<typeof deps, readonly string[]>>(true);
					await r.ctx.sh(`deno publish ${pkg.name}`);
					return `${pkg.name}@0.2.0`;
				},
			});
		},
	});

	// Runs whatever happened, and reports what actually shipped.
	const announce = job({
		name: "announce",
		plan: (p) => ({ published: workspace.map((pkg) => p.needs(publish(pkg))) }),
		runIf: always(),
		run: (_r, { published }) => {
			return published.flatMap((outcome) => [...outcome.value().iter()]);
		},
	});

	return { announce };
}

Deno.test("release: a dry run shows the publish order before anything ships", () => {
	// Given: the release graph for our workspace
	const shell = fakeShell();
	const { announce } = releaseGraph(WORKSPACE);

	// When: it's planned, not run
	const graph = unwrap(planJobs({ jobs: { announce }, meta: shell }));

	// Then: each package waits for the gate and for what it imports
	assertEquals(
		graph.jobs.get("publish @sekhmet/schema")?.needs.map(({ job }) => job),
		["Quality gate", "publish @sekhmet/enum", "publish @sekhmet/panic"],
	);
	assertEquals(shell.ran, []);
});

Deno.test("release: a failed publish blocks only what imports it", async () => {
	// Given: enum's publish fails
	const shell = fakeShell({ failing: ["deno publish @sekhmet/enum"] });
	const { announce } = releaseGraph(WORKSPACE);

	// When: the release runs
	const report = unwrap(
		await runJobs({ jobs: { announce }, meta: { sh: shell.sh } }),
	);

	// Then: vow and schema are blocked; unrelated packages still ship
	assertEquals(
		report.all.get("publish @sekhmet/vow"),
		Blocked(["publish @sekhmet/enum"]),
	);
	assertEquals(
		report.all.get("publish @sekhmet/schema"),
		Blocked(["publish @sekhmet/enum"]),
	);
	assertEquals(
		report.outcomes.announce,
		Succeeded([
			"@sekhmet/primordials@0.2.0",
			"@sekhmet/matrix@0.2.0",
			"@sekhmet/panic@0.2.0",
		]),
	);

	// Then: enum published once, though three jobs need it
	assertEquals(
		shell.ran.filter((c) => c === "deno publish @sekhmet/enum").length,
		1,
	);
});

// 3. Compat: the runtime list lives once, a matrix is a family, and setup
//    is code.

const RUNTIMES = [
	{ runtime: "node", node: "24" },
	{ runtime: "node", node: "26" },
	{ runtime: "bun" },
	{ runtime: "chromium" },
	{ runtime: "firefox" },
	{ runtime: "webkit" },
	{ runtime: "workerd" },
] as const;

type Runtime = (typeof RUNTIMES)[number];

const BROWSERS: ReadonlySet<string> = new Set([
	"chromium",
	"firefox",
	"webkit",
]);

function label(rt: Runtime): string {
	return "node" in rt ? `node ${rt.node}` : rt.runtime;
}

/** What compat.yml's conditional setup steps say, as code. */
function setupCommands(rt: Runtime): readonly string[] {
	const node = "node" in rt ? rt.node : "26";
	const toolchain =
		rt.runtime === "bun" ? "setup-bun latest" : `setup-node ${node}`;
	const browser = BROWSERS.has(rt.runtime)
		? [`playwright install ${rt.runtime}`]
		: [];
	return [toolchain, ...browser];
}

const compat = defineJobs((shell: Shell) => shell);

// The matrix: a family over the runtime list.
const suite = compat.family({
	key: label,
	define: (rt: Runtime) => {
		return compat.job({
			name: `compat (${label(rt)})`,
			run: async (r) => {
				for (const setup of setupCommands(rt)) {
					await r.step({ name: setup, run: () => r.ctx.sh(setup) });
				}
				await r.ctx.sh(`deno task compat:test ${rt.runtime}`);
			},
		});
	},
});

// Needs nest in records inside arrays, and resolve in place.
const summary = compat.job({
	name: "summary",
	plan: (p) => {
		return {
			results: RUNTIMES.map((rt) => {
				return { runtime: label(rt), outcome: p.needs(suite(rt)) };
			}),
		};
	},
	runIf: always(),
	run: (_r, { results }) => {
		return results.map(({ runtime, outcome }) => {
			return `${outcome.isSucceeded() ? "pass" : "FAIL"} ${runtime}`;
		});
	},
});

Deno.test("compat: one failing runtime hides nothing", async () => {
	// Given: webkit's suite fails
	const shell = fakeShell({ failing: ["deno task compat:test webkit"] });

	// When: every suite runs, locally, in one process
	const report = unwrap(
		await runJobs({ jobs: { summary }, meta: { sh: shell.sh } }),
	);

	// Then: the summary still reports all seven
	assertEquals(
		report.outcomes.summary,
		Succeeded([
			"pass node 24",
			"pass node 26",
			"pass bun",
			"pass chromium",
			"pass firefox",
			"FAIL webkit",
			"pass workerd",
		]),
	);
});

Deno.test("compat: a family gives the same job for the same key", async () => {
	// Given: a clean shell
	const shell = fakeShell();
	const [, , bun, , , webkit] = RUNTIMES;

	// When: bun is asked for twice, and webkit once
	const report = unwrap(
		await runJobs({
			jobs: { bun: suite(bun), again: suite(bun), webkit: suite(webkit) },
			meta: { sh: shell.sh },
		}),
	);

	// Then: bun ran once; bun skips Node, and only the browser installs Playwright
	assertEquals([...shell.ran].sort(), [
		"deno task compat:test bun",
		"deno task compat:test webkit",
		"playwright install webkit",
		"setup-bun latest",
		"setup-node 26",
	]);
	assertEquals(report.outcomes.again, report.outcomes.bun);
});

Deno.test("family: different identities may not share a name", () => {
	// Given: a family whose display name ignores its key
	const { family } = defineJobs((shell: Shell) => shell);
	const sloppy = family({
		key: (n: number) => String(n),
		define: () => compat.job({ name: "same", run: () => {} }),
	});

	// When: two keys are planned together
	const result = planJobs({
		jobs: { one: sloppy(1), two: sloppy(2) },
		meta: fakeShell(),
	});

	// Then: DuplicateName, since the identities differ
	assertEquals(unwrapErr(result), DuplicateName("same"));
});

Deno.test("family: a job that needs itself through its family is a Cycle", async () => {
	// Given: a family whose job for n needs the job for the same n
	const { family, job } = defineJobs((shell: Shell) => shell);
	const looping: (n: number) => Job<void, Shell> = family({
		key: (n: number) => String(n),
		define: (n) => {
			return job({
				name: `loop ${n}`,
				plan: (p) => ({ self: p.needs(looping(n)) }),
				run: () => {},
			});
		},
	});

	// When: it runs
	const result = await runJobs({
		jobs: { loop: looping(1) },
		meta: fakeShell(),
	});

	// Then: the cycle is named, starting and ending with the same job
	assertEquals(unwrapErr(result), Cycle(["loop 1", "loop 1"]));
});

Deno.test("family: two different jobs under one key are a GraphError", async () => {
	// Given: a family whose key ignores its argument, while its name doesn't
	let ran = 0;
	const { family, job } = defineJobs((shell: Shell) => shell);
	const colliding = family({
		key: () => "same",
		define: (n: number) => {
			return job({
				name: `job ${n}`,
				run: () => {
					ran += 1;
				},
			});
		},
	});

	// When: two arguments are run together
	const result = await runJobs({
		jobs: { one: colliding(1), two: colliding(2) },
		meta: fakeShell(),
	});

	// Then: DuplicateKey names both jobs, and nothing ran
	assertEquals(
		unwrapErr(result),
		DuplicateKey({ key: "same", names: ["job 1", "job 2"] }),
	);
	assertEquals(ran, 0);
});
