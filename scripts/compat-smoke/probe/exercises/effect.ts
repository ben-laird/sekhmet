/**
 * Exercises `@sekhmet/effect`: runs effects on fibers through the root, main
 * and mini entrypoints, with a synchronous and a microtask scheduler.
 *
 * @module
 */

import { Runtime as RootRuntime, zip } from "@sekhmet/effect";
import { Success } from "@sekhmet/effect/effect";
import { Success as MiniSuccess, map } from "@sekhmet/effect/effect/mini";
import { fork } from "@sekhmet/effect/fiber";
import { join, fork as miniFork } from "@sekhmet/effect/fiber/mini";
import { Runtime } from "@sekhmet/effect/runtime";
import { microtask, Scheduler, sync } from "@sekhmet/effect/scheduler";
import { unwrap } from "@sekhmet/enum/result/mini/unwrap";
import { expectEqual } from "../check.ts";

/** Runs the exercise. */
export async function exercise(): Promise<void> {
	const runtime = new Runtime({
		input: undefined,
		config: { scheduler: new Scheduler({ schedule: sync() }) },
	});

	const main: unknown[] = [];
	fork(
		runtime,
		Success(20)
			.map((n) => n + 1)
			.andThen((n) => Success(n * 2)),
	).join((result) => main.push(unwrap(result)));
	expectEqual({
		label: "main effect on a sync fiber",
		actual: main,
		expected: [42],
	});

	const mini: unknown[] = [];
	join(
		miniFork(
			runtime,
			map(MiniSuccess(1), (n) => n + 1),
		),
		(result) => mini.push(unwrap(result)),
	);
	expectEqual({
		label: "mini effect on a sync fiber",
		actual: mini,
		expected: [2],
	});

	const asyncRuntime = new RootRuntime({
		input: undefined,
		config: { scheduler: new Scheduler({ schedule: microtask() }) },
	});
	const zipped = await new Promise<unknown>((resolve) => {
		fork(asyncRuntime, zip(Success("Ada"), Success(36))).join((result) =>
			resolve(unwrap(result)),
		);
	});
	expectEqual({
		label: "zip on a microtask fiber",
		actual: zipped,
		expected: ["Ada", 36],
	});
}
