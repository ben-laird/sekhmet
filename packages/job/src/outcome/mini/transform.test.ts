import { match } from "@sekhmet/enum/core/mini";
import { isErr, isOk, unwrap, unwrapErr } from "@sekhmet/enum/result/mini";
import { assert, assertEquals } from "@std/assert";
import {
	Blocked,
	Cancelled,
	Failed,
	type JobOutcome,
	Skipped,
	Succeeded,
} from "./core.ts";
import { isSucceeded } from "./predicates.ts";
import { catchFailure, map, toResult } from "./transform.ts";

const EVERY_VARIANT: readonly JobOutcome<number>[] = [
	Succeeded(1),
	Failed(new Error("boom")),
	Skipped(),
	Blocked(["build"]),
	Cancelled(),
];

Deno.test("map touches only a success", () => {
	// Given: every variant
	// When: each is mapped
	const mapped = EVERY_VARIANT.map((outcome) => map(outcome, (n) => n * 10));

	// Then: the success's value changes; the rest pass through
	assertEquals(mapped, [Succeeded(10), ...EVERY_VARIANT.slice(1)]);
});

Deno.test("toResult keeps the reason a job didn't succeed", () => {
	// Given: a blocked job and a successful one
	// When: each is handed to Result-speaking code
	const blocked = toResult(Blocked(["build"]));
	const ok = toResult(Succeeded("dist"));

	// Then: Err carries the outcome; Ok carries the value
	assert(isErr(blocked));
	assertEquals(unwrapErr(blocked), Blocked(["build"]));
	assertEquals(unwrap(ok), "dist");
});

Deno.test("catchFailure folds Failed into the value, and out of the type", () => {
	// Given: every variant
	// When: each has its failure caught, then is matched with root match
	const lines = EVERY_VARIANT.map((outcome) => {
		return match(catchFailure(outcome))({
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

	// Then: the failure became a success holding Err
	assertEquals(lines, [
		"ok 1",
		"caught",
		"skipped",
		"blocked by build",
		"cancelled",
	]);
	assert(isSucceeded(catchFailure(Failed(new Error("boom")))));
});
