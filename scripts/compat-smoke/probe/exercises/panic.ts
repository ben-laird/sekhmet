/**
 * Exercises `@sekhmet/panic`: a panic runtime's hook and `catchUnwind`
 * boundaries, sync and async, with panics thrown from the prelude, and the
 * `Outcome` they return, through its main and mini entrypoints.
 *
 * @module
 */

import { intoInner } from "@sekhmet/enum/either/mini/transform";
import { Err as ResultErr } from "@sekhmet/enum/result/mini/core";
import { definePanicRuntime, Panic as RootPanic } from "@sekhmet/panic";
import { PanicMetadataRegistry } from "@sekhmet/panic/mini/registry";
import { definePanicRuntime as miniDefinePanicRuntime } from "@sekhmet/panic/mini/runtime";
import { type Outcome, Panicked } from "@sekhmet/panic/outcome";
import { Ok } from "@sekhmet/panic/outcome/mini/core";
import { recover, unwrapPanicked } from "@sekhmet/panic/outcome/mini/panic";
import { isOk } from "@sekhmet/panic/outcome/mini/predicates";
import { unwrap, unwrapErr } from "@sekhmet/panic/outcome/mini/unwrap";
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
	const payload = unwrapPanicked(caught);
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
		actual: [isOk(rejected), String(unwrapPanicked(rejected))],
		expected: [false, "TypeError: async failure"],
	});

	expectEqual({
		label: "recover turns a caught panic into an app error",
		actual: intoInner(unwrapErr(recover(caught, () => ResultErr("no port")))),
		expected: "no port",
	});

	const bug: Outcome<number, string> = Panicked("boom");
	expectEqual({
		label: "main Outcome passes a panic through mapErr",
		actual: [bug.mapErr((e) => e.length).unwrapPanicked(), unwrap(Ok(20)) + 1],
		expected: ["boom", 21],
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
