import { union, unionKinds } from "@sekhmet/enum/core/mini/exit";
import { Err, Ok } from "@sekhmet/enum/result/mini";
import { getStructParams } from "@sekhmet/primordials/struct";
import { assertEquals, assertInstanceOf } from "@std/assert";
import { Ready } from "@/src/continuation/continuation.ts";
import {
	Effect,
	EffectError,
	ExceptionOccurred,
	Failed,
	Failure,
	Success,
} from "@/src/effect/mini/effect.ts";
import { Runtime } from "@/src/runtime/runtime.ts";
import { Scheduler } from "@/src/scheduler/scheduler.ts";
import { sync } from "@/src/scheduler/schedules.ts";

const ctx = new Runtime({
	input: undefined,
	config: { scheduler: new Scheduler({ schedule: sync() }) },
}).createContext();

Deno.test("Failed() is the typed-failure EffectError", () => {
	// Given: a typed error
	const error = "not found";

	// When: building a Failed effect error
	const subject = Failed(error);

	// Then: it is an EffectError of kind Failed carrying the error
	assertInstanceOf(subject, EffectError);
	assertEquals(unionKinds(subject), "Failed");
	assertEquals(union(subject), "not found");
});

Deno.test("ExceptionOccurred() is the untyped-exception EffectError", () => {
	// Given: a thrown exception
	const exception = new RangeError("overflow");

	// When: building an ExceptionOccurred effect error
	const subject = ExceptionOccurred(exception);

	// Then: it is an EffectError of kind ExceptionOccurred carrying it
	assertInstanceOf(subject, EffectError);
	assertEquals(unionKinds(subject), "ExceptionOccurred");
	assertEquals(union(subject), exception);
});

Deno.test("Effect is a Struct around its effect function", () => {
	// Given: an effect function reading its input
	const fn = (input: number) => Ready(Ok(input + 1));

	// When: wrapping it in an Effect and invoking the stored function
	const effect = new Effect<number, number, never>(fn);
	const output = getStructParams(effect)(41, ctx);

	// Then: the function is stored as-is and is not run until invoked
	assertEquals(getStructParams(effect), fn);
	assertEquals(output, Ready(Ok(42)));
});

Deno.test("Success() is an effect that is immediately Ready with Ok", () => {
	// Given: a success value
	const value = { id: 1 };

	// When: building and invoking Success()
	const output = getStructParams(Success(value))(undefined, ctx);

	// Then: the output is Ready(Ok(value))
	assertEquals(output, Ready(Ok(value)));
});

Deno.test("Failure() is an effect that is immediately Ready with Err(Failed)", () => {
	// Given: a typed error
	const error = "nope";

	// When: building and invoking Failure()
	const output = getStructParams(Failure(error))(undefined, ctx);

	// Then: the output is Ready(Err(Failed(error)))
	assertEquals(output, Ready(Err(Failed(error))));
});

Deno.test("Success() and Failure() are pure: each invocation yields a fresh output", () => {
	// Given: a Success effect
	const effect = Success(1);

	// When: invoking it twice
	const first = getStructParams(effect)(undefined, ctx);
	const second = getStructParams(effect)(undefined, ctx);

	// Then: outputs are equal but distinct
	assertEquals(first, second);
	assertEquals(first === second, false);
});
