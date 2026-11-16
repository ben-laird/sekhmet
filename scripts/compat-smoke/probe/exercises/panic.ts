/**
 * Exercises `@sekhmet/panic`: a panic runtime's hook and `catchUnwind`
 * boundaries, sync and async, with panics thrown from the prelude.
 *
 * @module
 */

import { isOk } from "@sekhmet/enum/result/mini/predicates";
import { unwrap, unwrapErr } from "@sekhmet/enum/result/mini/unwrap";
import { definePanicRuntime, Panic as RootPanic } from "@sekhmet/panic";
import { PanicMetadataRegistry } from "@sekhmet/panic/mini/registry";
import { definePanicRuntime as miniDefinePanicRuntime } from "@sekhmet/panic/mini/runtime";
import { Panic, panic } from "@sekhmet/panic/prelude";
import { expectEqual } from "../check.ts";

/** Runs the exercise. */
export async function exercise(): Promise<void> {
	const runtime = definePanicRuntime();
	const reported: unknown[] = [];
	runtime.setHook(({ payload }) => reported.push(payload));

	const caught = runtime.catchUnwind((): number =>
		panic({ message: "config is missing a port", cause: null }),
	);
	const payload = unwrapErr(caught);
	expectEqual({
		label: "catchUnwind catches a prelude panic",
		actual: [
			payload instanceof Panic,
			payload instanceof RootPanic,
			payload instanceof Panic ? payload.message : undefined,
			reported.length,
		],
		expected: [true, true, "config is missing a port", 1],
	});

	expectEqual({
		label: "catchUnwind passes a value through",
		actual: unwrap(runtime.catchUnwind(() => 42)),
		expected: 42,
	});

	const miniRuntime = miniDefinePanicRuntime();
	miniRuntime.setHook(() => {});
	const rejected = await miniRuntime.catchUnwindAsync(() =>
		Promise.reject(new TypeError("async failure")),
	);
	expectEqual({
		label: "catchUnwindAsync catches a rejection",
		actual: [isOk(rejected), String(unwrapErr(rejected))],
		expected: [false, "TypeError: async failure"],
	});

	const registry = new PanicMetadataRegistry((p: Panic<unknown>) => ({
		message: p.message,
	}));
	if (payload instanceof Panic) registry.getOrInsert(payload);
	expectEqual({
		label: "metadata registry",
		actual: registry.size,
		expected: 1,
	});
}
