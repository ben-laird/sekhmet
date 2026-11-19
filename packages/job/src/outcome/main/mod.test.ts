/** The outcome algebra's laws, in method form. */

import { match, union } from "@sekhmet/enum/core/mini";
import { isOk, unwrap } from "@sekhmet/enum/result/mini";
import { assert, assertEquals, assertInstanceOf } from "@std/assert";
import * as mini from "../mini/mod.ts";
import {
	all,
	Blocked,
	Cancelled,
	Failed,
	JobOutcome,
	Skipped,
	Succeeded,
} from "./mod.ts";

const EVERY_VARIANT: readonly JobOutcome<number>[] = [
	Succeeded(1),
	Failed(new Error("boom")),
	Skipped(),
	Blocked(["build"]),
	Cancelled(),
];

Deno.test("main JobOutcome is a mini one, and fromMini views a mini one", () => {
	// Given: a mini outcome and a main one
	const fromMini = JobOutcome.fromMini(mini.Succeeded(1));
	const main = Succeeded(1);

	// When: each is checked against both classes
	// Then: both are main and mini, so either API accepts them
	assertInstanceOf(fromMini, JobOutcome);
	assertInstanceOf(main, mini.JobOutcome);
	assertEquals(mini.isSucceeded(main), true);
	assertEquals(fromMini.isSucceeded(), true);
});

Deno.test("each class has a true complement", () => {
	// Given: one outcome of every variant
	for (const outcome of EVERY_VARIANT) {
		// When: each pair is asked
		// Then: exactly one of each pair holds
		assert(outcome.isPassing() !== outcome.isFailing());
		assert(outcome.isHealthy() !== outcome.isUnhealthy());
	}

	// Then: cancelled is the one healthy-but-failing variant
	assert(Cancelled().isHealthy() && Cancelled().isFailing());
});

Deno.test("all: every success gives the values, typed per key", () => {
	// Given: two successes
	const outcomes = {
		version: Succeeded("1.2.0"),
		build: Succeeded({ outDir: "dist" }),
	};

	// When: they're combined
	const combined = all(outcomes);

	// Then: one main success holding both, typed per key
	const version: string = combined.value().unwrap().version;
	assertEquals(version, "1.2.0");
	assertEquals(
		combined,
		Succeeded({ version: "1.2.0", build: { outDir: "dist" } }),
	);
});

Deno.test("toResult keeps the reason a job didn't succeed", () => {
	// Given: a blocked job and a successful one
	// When: each is handed to Result-speaking code
	const blocked = Blocked(["build"]).toResult();
	const ok = Succeeded("dist").toResult();

	// Then: Err carries the main outcome; Ok carries the value
	assert(blocked.isErr());
	assertEquals(blocked.err().unwrap().blockedBy().unwrap(), ["build"]);
	assertEquals(ok.unwrap(), "dist");
});

Deno.test("predicates narrow, as Result's isOk does", () => {
	// Given: an outcome whose variant is unknown statically
	const outcome: JobOutcome<string | number> = Succeeded("dist");

	// When: it's checked with a refining predicate
	if (outcome.isSucceededAnd((v): v is string => typeof v === "string")) {
		// Then: union() reads the narrowed value with no further checks
		const value: string = union(outcome);
		assertEquals(value, "dist");
	}

	// Then: a non-success narrows to the outcome's own payload
	const blocked: JobOutcome<number> = Blocked(["build"]);
	if (blocked.isBlocked()) {
		const by: readonly string[] = union(blocked);
		assertEquals(by, ["build"]);
	}
});

Deno.test("map touches only a success", () => {
	// Given: a success and a skip
	// When: both are mapped
	// Then: the success's value changes; the skip passes through
	assertEquals(
		Succeeded(2).map((n) => n * 10),
		Succeeded(20),
	);
	const skipped = Skipped<number>().map(() => 1);
	assert(skipped.isSkipped());
});

Deno.test("catchFailure folds Failed into the value, and out of the type", () => {
	// Given: every variant
	// When: each has its failure caught, then is matched with root match
	const lines = EVERY_VARIANT.map((outcome) => {
		return match(outcome.catchFailure())({
			// Then: no Failed arm is needed
			Succeeded: (result) => {
				if (isOk(result)) return `ok ${unwrap(result)}`;
				return "caught";
			},
			Skipped: () => "skipped",
			Blocked: (by) => `blocked by ${by.join(", ")}`,
			Cancelled: () => "cancelled",
		});
	});

	// Then: the failure became a success holding Err, still a main outcome
	assertEquals(lines, [
		"ok 1",
		"caught",
		"skipped",
		"blocked by build",
		"cancelled",
	]);
	assert(Failed(new Error("boom")).catchFailure().isSucceeded());
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
