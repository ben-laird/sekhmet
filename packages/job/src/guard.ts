/**
 * Guards for `p.needsIf`: {@linkcode succeeded}, {@linkcode failed} and
 * {@linkcode succeededWith}. Each is data that describes itself, so a dry
 * run can show it.
 *
 * @module
 */

import { getStructParams } from "@sekhmet/primordials/struct";
import type { Guard, Need } from "@/src/need.ts";

/**
 * The need succeeded.
 *
 * @template T What the need's job returns
 * @param need One of the plan's unconditional needs
 * @returns The guard
 *
 * @example
 * ```ts
 * import { defineJobs, planJobs, succeeded } from "@sekhmet/job";
 * import { unwrap } from "@sekhmet/enum/result/mini";
 * import { assertEquals } from "@std/assert";
 *
 * const { job } = defineJobs<null>();
 * const build = job({ name: "build", run: () => "dist" });
 * const deploy = job({ name: "deploy", run: () => {} });
 * const release = job({
 * 	name: "release",
 * 	plan: (p) => {
 * 		const built = p.needs(build);
 * 		return { built, deployed: p.needsIf({ job: deploy, when: succeeded(built) }) };
 * 	},
 * 	run: () => {},
 * });
 *
 * const graph = unwrap(planJobs({ jobs: { release }, context: null }));
 * assertEquals(graph.jobs.get("release")?.needs[1]?.when, "build succeeded");
 * ```
 */
export function succeeded<T>(need: Need<T, boolean>): Guard {
	return {
		describe: `${nameOf(need)} succeeded`,
		test: (view) => view.outcome(need)?.isSucceeded() === true,
	};
}

/**
 * The need failed.
 *
 * @template T What the need's job returns
 * @param need One of the plan's unconditional needs
 * @returns The guard
 *
 * @example
 * ```ts
 * import { always, defineJobs, failed, runJobs } from "@sekhmet/job";
 * import { unwrap } from "@sekhmet/enum/result/mini";
 * import { assertEquals } from "@std/assert";
 *
 * const { job } = defineJobs<null>();
 * const build = job({
 * 	name: "build",
 * 	run: (): string => {
 * 		throw new Error("boom");
 * 	},
 * });
 * const logs = job({ name: "logs", run: () => "build.log" });
 * const report = job({
 * 	name: "report",
 * 	plan: (p) => {
 * 		const built = p.needs(build);
 * 		return { built, logs: p.needsIf({ job: logs, when: failed(built) }) };
 * 	},
 * 	runIf: always(),
 * 	run: (_t, { logs }) => logs?.value().unwrap() ?? "no logs",
 * });
 *
 * const ran = unwrap(await runJobs({ jobs: { report }, context: null }));
 * assertEquals(ran.outcomes.report.value().unwrap(), "build.log");
 * ```
 */
export function failed<T>(need: Need<T, boolean>): Guard {
	return {
		describe: `${nameOf(need)} failed`,
		test: (view) => view.outcome(need)?.isFailed() === true,
	};
}

/**
 * What {@linkcode succeededWith} takes.
 *
 * @template T What the need's job returns
 */
export interface SucceededWithOptions<T> {
	/** One of the plan's unconditional needs */
	readonly need: Need<T, boolean>;
	/** Tests the need's value */
	readonly where: (value: Readonly<T>) => boolean;
	/** What `where` checks, for a dry run (`a 1.x version`) */
	readonly describe: string;
}

/**
 * The need succeeded with a value that satisfies `where`.
 *
 * @template T What the need's job returns
 * @param options The need, the test on its value, and its description
 * @returns The guard
 *
 * @example
 * ```ts
 * import { defineJobs, runJobs, succeededWith } from "@sekhmet/job";
 * import { unwrap } from "@sekhmet/enum/result/mini";
 * import { assertEquals } from "@std/assert";
 *
 * const { job } = defineJobs<null>();
 * const version = job({ name: "version", run: () => "1.2.0" });
 * const sign = job({ name: "sign", run: () => "signature" });
 * const publish = job({
 * 	name: "publish",
 * 	plan: (p) => {
 * 		const v = p.needs(version);
 * 		const stable = succeededWith({
 * 			need: v,
 * 			where: (value) => !value.startsWith("0."),
 * 			describe: "a stable version",
 * 		});
 * 		return { version: v, signature: p.needsIf({ job: sign, when: stable }) };
 * 	},
 * 	run: (_t, { version, signature }) => `${version} ${signature ?? "unsigned"}`,
 * });
 *
 * const report = unwrap(await runJobs({ jobs: { publish }, context: null }));
 * assertEquals(report.outcomes.publish.value().unwrap(), "1.2.0 signature");
 * ```
 */
export function succeededWith<T>({
	need,
	where,
	describe,
}: SucceededWithOptions<T>): Guard {
	return {
		describe: `${nameOf(need)} succeeded with ${describe}`,
		test: (view) => view.outcome(need)?.isSucceededAnd(where) === true,
	};
}

function nameOf(need: Need<unknown, boolean>): string {
	return getStructParams(need).job.name;
}
