import { Enum } from "@sekhmet/enum/core/mini/core";
import { match, unionKinds } from "@sekhmet/enum/core/mini/exit";
import { assertEquals, assertInstanceOf } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import * as TestSubject from "@/src/outcome/mini/core.ts";

Deno.test("the constructors build each variant of an Outcome", () => {
	// Given: one value per channel
	// When: building each variant
	const subject: TestSubject.Outcome<number, string, Error>[] = [
		TestSubject.Ok(1),
		TestSubject.Err("e"),
		TestSubject.Panicked(new Error("p")),
	];

	// Then: each is an Outcome and an Enum of the matching kind
	for (const outcome of subject) {
		assertInstanceOf(outcome, TestSubject.Outcome);
		assertInstanceOf(outcome, Enum);
	}
	assertEquals(subject.map(unionKinds), ["Ok", "Err", "Panicked"]);
});

Deno.test("each constructor leaves the other channels never", () => {
	// Given: one variant of each kind
	// When: building them without type arguments
	const ok = TestSubject.Ok(1);
	const err = TestSubject.Err("e");
	const panicked = TestSubject.Panicked(new Error("p"));

	// Then: the channel each doesn't hold is never, so each fits any Outcome
	assertType<IsExact<typeof ok, TestSubject.Outcome<number, never, never>>>(
		true,
	);
	assertType<IsExact<typeof err, TestSubject.Outcome<never, string, never>>>(
		true,
	);
	assertType<
		IsExact<typeof panicked, TestSubject.Outcome<never, never, Error>>
	>(true);
	const all: TestSubject.Outcome<number, string, Error>[] = [ok, err, panicked];
	assertEquals(all.length, 3);
});

Deno.test("an Outcome's payload type defaults to unknown", () => {
	// Given: an Outcome type with two type arguments
	type Subject = TestSubject.Outcome<number, string>;

	// When: holding a panic of any payload in it
	const outcome: Subject = TestSubject.Panicked(Symbol("anything"));

	// Then: P is unknown
	assertType<IsExact<Subject, TestSubject.Outcome<number, string, unknown>>>(
		true,
	);
	assertEquals(unionKinds(outcome), "Panicked");
});

Deno.test("match() needs an arm for each of the three variants", () => {
	// Given: an Outcome of each variant
	const outcomes: TestSubject.Outcome<number, string>[] = [
		TestSubject.Ok(1),
		TestSubject.Err("e"),
		TestSubject.Panicked("p"),
	];

	// When: matching each
	const subject = outcomes.map((outcome) => {
		return match(outcome)({
			Ok: (value) => `ok ${value}`,
			Err: (error) => `err ${error}`,
			Panicked: (payload) => `panicked ${String(payload)}`,
		});
	});

	// Then: each arm saw its own value
	assertEquals(subject, ["ok 1", "err e", "panicked p"]);
});
