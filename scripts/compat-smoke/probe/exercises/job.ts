/**
 * Exercises `@sekhmet/job`: a run through the root, with a context factory,
 * a failure that blocks its dependent, an `always()` job, and per-job
 * cleanup; a cleanup that throws over a throwing body, which must compose a
 * `SuppressedError` (the runtime's, or job's own where the runtime lacks one,
 * as WebKit does); a run cancelled before it starts; the dry run; and
 * `JobEnd` through `@sekhmet/job/end`, its mini barrel and each
 * single-module path.
 *
 * @module
 */

import { unwrapOr } from "@sekhmet/enum/option/mini";
import { isOk } from "@sekhmet/enum/result/mini/predicates";
import { unwrap } from "@sekhmet/enum/result/mini/unwrap";
import {
	always,
	Blocked,
	Cancelled,
	defineJobs,
	planJobs,
	runJobs,
	Succeeded,
} from "@sekhmet/job";
import { Failed, Skipped } from "@sekhmet/job/end";
import { all, isUnhealthy } from "@sekhmet/job/end/mini";
import { blockedBy } from "@sekhmet/job/end/mini/accessors";
import { all as allOf } from "@sekhmet/job/end/mini/all";
import { JobEnd, Succeeded as miniSucceeded } from "@sekhmet/job/end/mini/core";
import { isPassing } from "@sekhmet/job/end/mini/predicates";
import { map, toResult } from "@sekhmet/job/end/mini/transform";
import { expectEqual } from "../check.ts";

function property(value: unknown, key: string): unknown {
	return typeof value === "object" && value !== null
		? Reflect.get(value, key)
		: undefined;
}

async function exerciseRun(): Promise<void> {
	const { job } = defineJobs(
		(meta: { readonly log: string[] }, { job, cleanup }) => {
			cleanup.defer(() => {
				meta.log.push(`dispose ${job}`);
			});
			return { name: job };
		},
	);
	const lint = job({
		name: "lint",
		run: (): void => {
			throw new Error("unused variable");
		},
	});
	const build = job({ name: "build", run: (r) => `${r.ctx.name}: dist` });
	const deploy = job({
		name: "deploy",
		plan: (p) => ({ linted: p.needs(lint), site: p.needs(build) }),
		run: (_r, { site }) => site,
	});
	const report = job({
		name: "report",
		plan: (p) => ({ deploy: p.needs(deploy) }),
		runIf: always(),
		run: (_r, { deploy }) => deploy.isBlocked(),
	});

	const graph = unwrap(planJobs({ jobs: { report }, meta: { log: [] } }));
	expectEqual({
		label: "planJobs reaches every job, running none",
		actual: [...graph.jobs.keys()].sort(),
		expected: ["build", "deploy", "lint", "report"],
	});

	const log: string[] = [];
	const ran = unwrap(
		await runJobs({ jobs: { deploy, report }, meta: { log } }),
	);
	expectEqual({
		label: "a failure blocks its dependent, and always() still runs",
		actual: [
			ran.outcomes.deploy.isBlocked(),
			unwrapOr(blockedBy(ran.outcomes.deploy), []),
			ran.outcomes.report.value().unwrap(),
			ran.all.get("build")?.value().unwrap(),
			ran.passed,
		],
		expected: [true, ["lint"], true, "build: dist", false],
	});
	expectEqual({
		label: "each job that started disposed its cleanup",
		actual: [...log].sort(),
		expected: ["dispose build", "dispose lint", "dispose report"],
	});
	expectEqual({
		label: "Blocked names the failed need",
		actual: unwrapOr(blockedBy(Blocked(["lint"])), []),
		expected: ["lint"],
	});
}

async function exerciseCleanupError(): Promise<void> {
	const { job } = defineJobs(() => ({}));
	const body = new Error("body failed");
	const close = new Error("close failed");
	const broken = job({
		name: "broken",
		run: (r): void => {
			r.cleanup.defer(() => {
				throw close;
			});
			throw body;
		},
	});

	const ran = unwrap(await runJobs({ jobs: { broken }, meta: null }));
	const error = ran.outcomes.broken.error().unwrap();
	expectEqual({
		label: "a throwing cleanup composes a SuppressedError over the body's",
		actual: [
			error instanceof Error ? error.name : undefined,
			property(error, "error") === close,
			property(error, "suppressed") === body,
		],
		expected: ["SuppressedError", true, true],
	});
}

async function exerciseCancel(): Promise<void> {
	const built: string[] = [];
	const { job } = defineJobs((_meta: null, { job }) => {
		built.push(job);
		return {};
	});
	const plain = job({ name: "plain", run: () => "ran" });
	const ran = unwrap(
		await runJobs({
			jobs: { plain },
			meta: null,
			signal: AbortSignal.abort(new Error("stop")),
		}),
	);
	expectEqual({
		label: "an aborted run cancels a job before it starts",
		actual: [
			ran.outcomes.plain.isCancelled(),
			Cancelled().isCancelled(),
			built,
		],
		expected: [true, true, []],
	});
}

function exerciseJobEnd(): void {
	expectEqual({
		label: "main JobEnd chains",
		actual: [
			Succeeded(2)
				.map((n) => n * 10)
				.value()
				.unwrap(),
			Failed(new Error("x")).toResult().isErr(),
			Skipped().isPassing(),
		],
		expected: [20, true, true],
	});

	const doubled = map(miniSucceeded(21), (n) => n * 2);
	expectEqual({
		label: "mini JobEnd functions",
		actual: [
			doubled instanceof JobEnd,
			isOk(toResult(doubled)),
			isPassing(doubled),
			isUnhealthy(all({ a: doubled, b: Failed(new Error("b")) })),
			isUnhealthy(allOf({ a: doubled })),
		],
		expected: [true, true, true, true, false],
	});
}

/** Runs the exercise. */
export async function exercise(): Promise<void> {
	await exerciseRun();
	await exerciseCleanupError();
	await exerciseCancel();
	exerciseJobEnd();
}
