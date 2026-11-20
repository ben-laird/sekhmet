import { type Either, Left, Right } from "@sekhmet/enum/either/mini/core";
import {
	isNone,
	None,
	type Option,
	Some,
	unwrap as unwrapOption,
} from "@sekhmet/enum/option/mini";
import {
	type Result,
	Err as ResultErr,
	Ok as ResultOk,
} from "@sekhmet/enum/result/mini/core";
import { assertEquals, assertStrictEquals, assertThrows } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import * as TestSubject from "@/src/outcome/mini/combinators.ts";
import { Err, Ok, type Outcome, Panicked } from "@/src/outcome/mini/core.ts";

const ok: Outcome<number, string> = Ok(1);
const failed: Outcome<number, string> = Err("e");
const bug: Outcome<number, string> = Panicked("p");

Deno.test("ok() and err() convert Ok and Err to an Option", () => {
	// Given: an Ok and an Err
	// When: converting both channels of each
	const okValue = TestSubject.ok(ok);
	const okError = TestSubject.err(ok);
	const errValue = TestSubject.ok(failed);
	const errError = TestSubject.err(failed);

	// Then: each channel is Some on its own variant, None on the other
	assertEquals(unwrapOption(okValue), 1);
	assertEquals(isNone(okError), true);
	assertEquals(isNone(errValue), true);
	assertEquals(unwrapOption(errError), "e");
});

Deno.test("ok(), err() and iter() resume a Panicked", () => {
	// Given: a panic holding an Error
	const thrown = new Error("bug");
	const outcome: Outcome<number, string> = Panicked(thrown);

	// When: converting it each way
	const resumed = [
		assertThrows(() => TestSubject.ok(outcome)),
		assertThrows(() => TestSubject.err(outcome)),
		assertThrows(() => Array.from(TestSubject.iter(outcome))),
	];

	// Then: each threw the payload itself rather than reading the panic as None
	for (const payload of resumed) {
		assertStrictEquals(payload, thrown);
	}
});

Deno.test("iter() yields Ok's value once and nothing for Err", () => {
	// Given: an Ok and an Err
	// When: iterating each
	const subject = [
		Array.from(TestSubject.iter(ok)),
		Array.from(TestSubject.iter(failed)),
	];

	// Then: only Ok yields
	assertEquals(subject, [[1], []]);
});

Deno.test("and() and andThen() continue from Ok and pass the rest through", () => {
	// Given: an Outcome of each variant, and a next step
	const next = (n: number): Outcome<string, string> => Ok(`next ${n}`);
	const other: Outcome<string, string> = Ok("other");

	// When: chaining each
	const thens = [ok, failed, bug].map((o) => TestSubject.andThen(o, next));
	const ands = [ok, failed, bug].map((o) => TestSubject.and(o, other));

	// Then: only Ok continues; Err and Panicked pass through
	assertEquals(thens, [Ok("next 1"), Err("e"), Panicked("p")]);
	assertEquals(ands, [Ok("other"), Err("e"), Panicked("p")]);
});

Deno.test("or() and orElse() replace Err and never a panic", () => {
	// Given: an Outcome of each variant, and a fallback
	let calls = 0;
	const retry = (error: string): Outcome<number, number> => {
		calls++;
		return Ok(error.length);
	};
	const fallback: Outcome<number, number> = Ok(0);

	// When: falling back on each
	const elses = [ok, failed, bug].map((o) => TestSubject.orElse(o, retry));
	const ors = [ok, failed, bug].map((o) => TestSubject.or(o, fallback));

	// Then: only Err is replaced; a panic is not an expected error
	assertEquals(elses, [Ok(1), Ok(1), Panicked("p")]);
	assertEquals(ors, [Ok(1), Ok(0), Panicked("p")]);
	assertEquals(calls, 1);
});

Deno.test("transpose() swaps an Outcome of an Option", () => {
	// Given: Outcomes of Options
	const some: Outcome<Option<number>, string> = Ok(Some(5));
	const none: Outcome<Option<number>, string> = Ok(None());
	const panicked: Outcome<Option<number>, string> = Panicked("p");

	// When: transposing each
	const fromSome = TestSubject.transpose(some);
	const fromNone = TestSubject.transpose(none);
	const fromPanic = TestSubject.transpose(panicked);

	// Then: Ok(None) is None, and the others are Some of an Outcome
	assertEquals(unwrapOption(fromSome), Ok(5));
	assertEquals(isNone(fromNone), true);
	assertEquals(unwrapOption(fromPanic), Panicked("p"));
});

Deno.test("flatten() joins layers that share their types", () => {
	// Given: nested Outcomes of every shape
	const cases: Outcome<Outcome<number, string>, string>[] = [
		Ok(Ok(1)),
		Ok(Err("inner")),
		Ok(Panicked("inner bug")),
		Err("outer"),
		Panicked("outer bug"),
	];

	// When: flattening each
	const subject = cases.map(TestSubject.flatten);

	// Then: the inner Outcome or the outer failure, unchanged
	assertEquals(subject, [
		Ok(1),
		Err("inner"),
		Panicked("inner bug"),
		Err("outer"),
		Panicked("outer bug"),
	]);
});

Deno.test("flattenResult() keeps the Result's and the Outcome's errors apart", () => {
	// Given: Outcomes of Results with an error of the same type on each layer
	const cases: Outcome<Result<number, string>, string>[] = [
		Ok(ResultOk(1)),
		Ok(ResultErr("returned")),
		Err("outer"),
		Panicked("bug"),
	];

	// When: flattening each
	const subject = cases.map(TestSubject.flattenResult);

	// Then: the returned error is Left and the outer one Right; a panic passes through
	assertEquals(subject, [
		Ok(1),
		Err(Left("returned")),
		Err(Right("outer")),
		Panicked("bug"),
	]);
	assertType<
		IsExact<
			(typeof subject)[number],
			Outcome<number, Either<string, string>, unknown>
		>
	>(true);
});

Deno.test("flattenEither() keeps each channel's two sources apart", () => {
	// Given: nested Outcomes of every shape
	const innerBug = new Error("inner bug");
	const cases: Outcome<Outcome<number, string, Error>, boolean, symbol>[] = [
		Ok(Ok(1)),
		Ok(Err("inner")),
		Ok(Panicked(innerBug)),
		Err(false),
		Panicked(Symbol.for("outer bug")),
	];

	// When: flattening each
	const subject = cases.map(TestSubject.flattenEither);

	// Then: the inner layer's failures are Left and the outer layer's Right
	assertEquals(subject, [
		Ok(1),
		Err(Left("inner")),
		Panicked(Left(innerBug)),
		Err(Right(false)),
		Panicked(Right(Symbol.for("outer bug"))),
	]);
	assertType<
		IsExact<
			(typeof subject)[number],
			Outcome<number, Either<string, boolean>, Either<Error, symbol>>
		>
	>(true);
});
