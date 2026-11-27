import { Enum } from "@sekhmet/enum/core/mini/core";
import { union } from "@sekhmet/enum/core/mini/exit";
import { Either } from "@sekhmet/enum/either";
import { Option } from "@sekhmet/enum/option";
import * as optionMini from "@sekhmet/enum/option/mini";
import { Result } from "@sekhmet/enum/result";
import * as resultMini from "@sekhmet/enum/result/mini";
import { assert, assertEquals, assertInstanceOf } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import { Panic } from "@/src/mini/core.ts";
import * as mini from "../mini/mod.ts";
import { Err, fromResult, Ok, Outcome, Panicked } from "./mod.ts";

Deno.test("Outcome methods chain on main constructors", () => {
	// Given: a main Ok and a main Panicked
	const ok: Outcome<number, string> = Ok(2);
	const bug: Outcome<number, string> = Panicked("boom");

	// When: chaining the ordinary combinators on both
	const chained = ok
		.map((n) => n * 10)
		.mapErr((e) => e.length)
		.andThen((n) => Ok<number, number>(n + 1));
	// {}
	const passed = bug
		.map((n) => n * 10)
		.mapErr((e) => e.length)
		.andThen((n) => Ok<number, number>(n + 1));
	// {}

	// Then: each step returns a main Outcome, and the panic passed through untouched
	assertInstanceOf(chained, Outcome);
	assertType<IsExact<typeof chained, Outcome<number, number, unknown>>>(true);
	assertEquals(chained.unwrap(), 21);
	assertEquals(passed.isPanicked(), true);
	assertEquals(passed.unwrapPanicked(), "boom");
});

Deno.test("main Outcome is an instance of mini Outcome and mini Enum", () => {
	// Given: a main Err
	const outcome = Err("e");

	// When: checking it against the mini classes
	const classes = [
		outcome instanceof Outcome,
		outcome instanceof mini.Outcome,
		outcome instanceof Enum,
	];

	// Then: it is all of them, so mini functions accept it
	assertEquals(classes, [true, true, true]);
	assertEquals(mini.isErr(outcome), true);
});

Deno.test("fromMini() views a mini Outcome as a main one", () => {
	// Given: a mini Panicked
	const outcome = mini.Panicked<number, string>("p");

	// When: converting it to main
	const subject = Outcome.fromMini(outcome);

	// Then: it is a main Outcome holding the same payload
	assertInstanceOf(subject, Outcome);
	assertEquals(subject.panicked().unwrap(), "p");
});

Deno.test("Outcome.ok, err and panicked return main Options", () => {
	// Given: a main Ok
	const outcome: Outcome<number, string> = Ok(1);

	// When: converting each channel
	const channels = [outcome.ok(), outcome.err(), outcome.panicked()];

	// Then: each is a main Option
	for (const channel of channels) {
		assertInstanceOf(channel, Option);
	}
	assertEquals(outcome.ok().unwrap(), 1);
});

Deno.test("Outcome.isPanicAnd narrows a main Outcome's payload", () => {
	// Given: a main Outcome holding a Panic, typed unknown
	const outcome: Outcome<number, string> = Panicked(
		new Panic({ message: "bad state", cause: null }),
	);

	// When: guarding with a Panic type guard
	assert(outcome.isPanicAnd((p): p is Panic<unknown> => p instanceof Panic));

	// Then: the payload is a Panic, and the value is still a main Outcome
	const payload = union(outcome);
	assertType<IsExact<typeof payload, Panic<unknown>>>(true);
	assertEquals(payload.message, "bad state");
	assertInstanceOf(outcome, Outcome);
});

Deno.test("Outcome.recover returns a main Outcome that intoResult converts", () => {
	// Given: a main panic
	const bug: Outcome<number, string> = Panicked("boom");

	// When: recovering it, then converting to a Result
	const recovered = bug.recover((p) => resultMini.Err(`bug: ${String(p)}`));
	const result = recovered.intoResult();

	// Then: both are main values, the error is a main Either, and no panic is left
	assertInstanceOf(recovered, Outcome);
	assertType<
		IsExact<typeof recovered, Outcome<number, Either<string, string>, never>>
	>(true);
	assertInstanceOf(result, Result);
	const error = result.unwrapErr();
	assertInstanceOf(error, Either);
	assertEquals(error.unwrapRight(), "bug: boom");
});

Deno.test("Outcome.intoResult exists only for an Outcome with no panic channel", () => {
	// Given: an Outcome that may hold a panic
	const outcome: Outcome<number, string> = Ok(1);

	// When: calling intoResult on it
	// @ts-expect-error: intoResult's this is an Outcome<T, E, never>
	const misuse = (): unknown => outcome.intoResult();

	// Then: the call doesn't compile
	assertEquals(typeof misuse, "function");
});

Deno.test("Outcome.panicResult exists only for an Outcome with no error channel", () => {
	// Given: a boundary-shaped Outcome, and one with an error channel
	const caught: Outcome<number, never> = Panicked("p");
	const outcome: Outcome<number, string> = Ok(1);

	// When: converting both
	const result = caught.panicResult();
	// @ts-expect-error: panicResult's this is an Outcome<T, never, P>
	const misuse = (): unknown => outcome.panicResult();

	// Then: the first is a main Result of the payload; the misuse doesn't compile
	assertInstanceOf(result, Result);
	assertEquals(result.unwrapErr(), "p");
	assertEquals(typeof misuse, "function");
});

Deno.test("Outcome.intoNested returns a main Result of a main Result", () => {
	// Given: a main Err
	const outcome: Outcome<number, string> = Err("e");

	// When: nesting it
	const nested = outcome.intoNested();

	// Then: both layers are main Results
	assertInstanceOf(nested, Result);
	assertInstanceOf(nested.unwrap(), Result);
	assertEquals(nested.unwrap().unwrapErr(), "e");
});

Deno.test("Outcome.fromCaught returns a main Outcome of the inner Result", () => {
	// Given: a main Outcome a boundary caught around a Result that failed
	const caught: Outcome<resultMini.Result<number, string>, never> = Ok(
		resultMini.Err("expected"),
	);

	// When: flattening it
	const flat = caught.fromCaught();

	// Then: the inner error is the main Outcome's own Err
	assertInstanceOf(flat, Outcome);
	assertType<IsExact<typeof flat, Outcome<number, string, unknown>>>(true);
	assertEquals(flat.unwrapErr(), "expected");
});

Deno.test("Outcome.flattenResult returns a main Outcome with a main Either error", () => {
	// Given: a main Outcome of a Result that returned an error
	const outcome: Outcome<resultMini.Result<number, string>, string> = Ok(
		resultMini.Err("returned"),
	);

	// When: flattening it
	const flat = outcome.flattenResult();

	// Then: the error is a main Either telling the layers apart
	assertInstanceOf(flat, Outcome);
	const error = flat.unwrapErr();
	assertInstanceOf(error, Either);
	assertEquals(error.unwrapLeft(), "returned");
	// @ts-expect-error: flattenResult's this is an Outcome of a Result
	const misuse = (): unknown => Ok<number, string>(1).flattenResult();
	assertEquals(typeof misuse, "function");
});

Deno.test("Outcome.flattenEither returns main Eithers on both failure channels", () => {
	// Given: a main Outcome of an inner panic
	const outcome: Outcome<mini.Outcome<number, string>, string> = Ok(
		mini.Panicked("inner"),
	);

	// When: flattening it
	const flat = outcome.flattenEither();

	// Then: the payload is a main Either on the inner side
	assertInstanceOf(flat, Outcome);
	const payload = flat.unwrapPanicked();
	assertInstanceOf(payload, Either);
	assertEquals(payload.isLeft(), true);
});

Deno.test("Outcome.flatten and transpose return main values", () => {
	// Given: a nested main Outcome, and a main Outcome of an Option
	const nested: Outcome<mini.Outcome<number, string>, string> = Ok(mini.Ok(1));
	const optional: Outcome<optionMini.Option<number>, string> = Ok(
		optionMini.Some(1),
	);

	// When: flattening and transposing
	const flat = nested.flatten();
	const transposed = optional.transpose();

	// Then: each is main
	assertInstanceOf(flat, Outcome);
	assertEquals(flat.unwrap(), 1);
	assertInstanceOf(transposed, Option);
	assertInstanceOf(transposed.unwrap(), Outcome);
});

Deno.test("fromResult returns a main Outcome", () => {
	// Given: a mini Result
	const result = resultMini.Ok<number, string>(1);

	// When: converting it
	const outcome = fromResult(result);

	// Then: it is a main Outcome with no panic channel
	assertInstanceOf(outcome, Outcome);
	assertType<IsExact<typeof outcome, Outcome<number, string, never>>>(true);
	assertEquals(outcome.intoResult().unwrap(), 1);
});
