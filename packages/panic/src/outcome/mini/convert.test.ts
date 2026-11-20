import {
	type Result,
	Err as ResultErr,
	Ok as ResultOk,
} from "@sekhmet/enum/result/mini/core";
import { assertEquals } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import * as TestSubject from "@/src/outcome/mini/convert.ts";
import { Err, Ok, type Outcome, Panicked } from "@/src/outcome/mini/core.ts";

Deno.test("fromResult() makes an Outcome with no panic in it", () => {
	// Given: an Ok and an Err Result
	const results: Result<number, string>[] = [ResultOk(1), ResultErr("e")];

	// When: converting each
	const subject = results.map(TestSubject.fromResult);

	// Then: each keeps its variant, and the payload type is never
	assertEquals(subject, [Ok(1), Err("e")]);
	assertType<IsExact<(typeof subject)[number], Outcome<number, string, never>>>(
		true,
	);
});

Deno.test("intoResult() converts an Outcome with no panic channel", () => {
	// Given: Outcomes whose payload type is never
	const outcomes: Outcome<number, string, never>[] = [Ok(1), Err("e")];

	// When: converting each
	const subject = outcomes.map(TestSubject.intoResult);

	// Then: each is the matching Result
	assertEquals(subject, [ResultOk(1), ResultErr("e")]);
});

Deno.test("panicResult() makes the payload the Result's error", () => {
	// Given: Outcomes whose error type is never, like a boundary's
	const outcomes: Outcome<number, never, string>[] = [Ok(1), Panicked("p")];

	// When: converting each
	const subject = outcomes.map(TestSubject.panicResult);

	// Then: Ok stays Ok, and the payload becomes Err
	assertEquals(subject, [ResultOk(1), ResultErr("p")]);
	assertType<IsExact<(typeof subject)[number], Result<number, string>>>(true);
});

Deno.test("intoNested() puts Ok and Err inside and the payload outside", () => {
	// Given: an Outcome of each variant
	const outcomes: Outcome<number, string, boolean>[] = [
		Ok(1),
		Err("e"),
		Panicked(true),
	];

	// When: converting each
	const subject = outcomes.map(TestSubject.intoNested);

	// Then: the two channels are nested the way JoinHandle::join nests them
	assertEquals(subject, [
		ResultOk(ResultOk(1)),
		ResultOk(ResultErr("e")),
		ResultErr(true),
	]);
	assertType<
		IsExact<(typeof subject)[number], Result<Result<number, string>, boolean>>
	>(true);
});
