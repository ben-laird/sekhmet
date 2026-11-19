import { union, unionKinds } from "@sekhmet/enum/core/mini";
import { assertEquals, assertInstanceOf } from "@std/assert";
import {
	Blocked,
	Cancelled,
	Failed,
	JobOutcome,
	Skipped,
	Succeeded,
} from "./core.ts";

Deno.test("each constructor builds its variant with its payload", () => {
	// Given: a payload for each variant that carries one
	const failure = new Error("boom");

	// When: every constructor is called
	const outcomes = [
		Succeeded("dist"),
		Failed(failure),
		Skipped(),
		Blocked(["lint"]),
		Cancelled(),
	];

	// Then: each is a JobOutcome of its kind, holding its payload
	for (const outcome of outcomes) assertInstanceOf(outcome, JobOutcome);
	assertEquals(outcomes.map(unionKinds), [
		"Succeeded",
		"Failed",
		"Skipped",
		"Blocked",
		"Cancelled",
	]);
	assertEquals(outcomes.map(union), [
		"dist",
		failure,
		undefined,
		["lint"],
		undefined,
	]);
});

Deno.test("constructors take the success type, as None<T>() does", () => {
	// Given: an outcome declared before its job has run
	let outcome = Skipped<number>();

	// When: it's reassigned once the job succeeds
	outcome = Succeeded(42);

	// Then: the binding was a JobOutcome<number> from the start
	const typed: JobOutcome<number> = outcome;
	assertEquals(typed, Succeeded(42));
});
