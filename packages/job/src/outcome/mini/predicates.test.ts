import { union } from "@sekhmet/enum/core/mini";
import { assert, assertEquals } from "@std/assert";
import {
	Blocked,
	Cancelled,
	Failed,
	type JobOutcome,
	Skipped,
	Succeeded,
} from "./core.ts";
import {
	isBlocked,
	isCancelled,
	isFailed,
	isFailing,
	isHealthy,
	isPassing,
	isSkipped,
	isSucceeded,
	isSucceededAnd,
	isUnhealthy,
} from "./predicates.ts";

const EVERY_VARIANT: readonly JobOutcome<number>[] = [
	Succeeded(1),
	Failed(new Error("boom")),
	Skipped(),
	Blocked(["build"]),
	Cancelled(),
];

Deno.test("exactly one variant predicate holds for each outcome", () => {
	// Given: one outcome of every variant
	for (const outcome of EVERY_VARIANT) {
		// When: every variant predicate is asked
		const held = [
			isSucceeded(outcome),
			isFailed(outcome),
			isSkipped(outcome),
			isBlocked(outcome),
			isCancelled(outcome),
		];

		// Then: exactly one holds
		assertEquals(held.filter(Boolean).length, 1);
	}
});

Deno.test("each group pair is a true complement", () => {
	// Given: one outcome of every variant
	for (const outcome of EVERY_VARIANT) {
		// When: each pair is asked
		// Then: exactly one of each pair holds
		assert(isPassing(outcome) !== isFailing(outcome));
		assert(isHealthy(outcome) !== isUnhealthy(outcome));
	}

	// Then: Cancelled is the one healthy but failing variant
	assert(isHealthy(Cancelled()) && isFailing(Cancelled()));
});

Deno.test("passing, unhealthy and cancelled partition the variants", () => {
	// Given: one outcome of every variant
	for (const outcome of EVERY_VARIANT) {
		// When: each is classified
		const classes = [
			isPassing(outcome),
			isUnhealthy(outcome),
			isCancelled(outcome),
		];

		// Then: exactly one class holds
		assertEquals(classes.filter(Boolean).length, 1);
	}
});

Deno.test("predicates narrow, as Result's isOk does", () => {
	// Given: an outcome whose value type is a union
	const outcome: JobOutcome<string | number> = Succeeded("dist");

	// When: it's checked with a refining predicate
	const refined = isSucceededAnd(
		outcome,
		(value): value is string => typeof value === "string",
	);

	// Then: union() reads the narrowed value with no further checks
	assert(refined);
	const value: string = union(outcome);
	assertEquals(value, "dist");

	// Then: a non-success narrows to its own payload
	const blocked: JobOutcome<number> = Blocked(["build"]);
	assert(isBlocked(blocked));
	const by: readonly string[] = union(blocked);
	assertEquals(by, ["build"]);
});

Deno.test("isSucceededAnd is false for a success that fails the predicate", () => {
	// Given: a success and a failure
	// When: both are tested against a predicate
	// Then: only a success whose value satisfies it passes
	assertEquals(
		isSucceededAnd(Succeeded(0), (n) => n > 1),
		false,
	);
	assertEquals(
		isSucceededAnd(Failed<number>("x"), () => true),
		false,
	);
});
