import { Panic } from "@sekhmet/panic/mini/core";
import { assert, assertEquals, assertThrows } from "@std/assert";
import {
	type InvariantCheck,
	isInvariantPanic,
} from "@/src/invariant/invariant.ts";
import {
	type InvariantEqualOptions,
	invariantEqual,
} from "@/src/invariant/invariant-equal.ts";

const EXPECTED = "a refund should never change the total paid";

Deno.test("invariantEqual returns when the values are equal by Object.is", () => {
	// Given: pairs Object.is calls equal, NaN and a shared object included
	const shared = { id: 1 };
	const pairs: [unknown, unknown][] = [
		[1, 1],
		["a", "a"],
		[Number.NaN, Number.NaN],
		[-0, -0],
		[shared, shared],
		[undefined, undefined],
	];

	// When: invariantEqual checks each
	const checked = pairs.map(([actual, expected]) => {
		invariantEqual({ actual, expected, expectedBehavior: EXPECTED });
		return actual;
	});

	// Then: none panicked
	assertEquals(checked.length, pairs.length);
});

Deno.test("invariantEqual panics on values Object.is calls unequal", () => {
	// Given: pairs that == or deep equality would accept, but Object.is does not
	const pairs: [unknown, unknown][] = [
		[0, -0],
		[{ id: 1 }, { id: 1 }],
		[[1], [1]],
		[1, 2],
	];

	// When: invariantEqual checks each
	const thrown = pairs.map(([actual, expected]) => {
		return assertThrows(() => {
			invariantEqual({ actual, expected, expectedBehavior: EXPECTED });
		}, Panic);
	});

	// Then: each panics as an invariant, keeping both values
	assertEquals(
		thrown.map((panic) => {
			return isInvariantPanic(panic) ? panic.cause.check : undefined;
		}),
		pairs.map(([actual, expected]): InvariantCheck => {
			return { kind: "equal", actual, expected };
		}),
	);
});

Deno.test("invariantEqual's panic shows both values and the issue URL", () => {
	// Given: totals that differ, and an issue URL
	const issueUrl = new URL("https://example.com/issues");

	// When: invariantEqual checks them
	const thrown = assertThrows(() => {
		invariantEqual({
			actual: { total: 9 },
			expected: { total: 10 },
			expectedBehavior: EXPECTED,
			issueUrl,
		});
	}, Panic);

	// Then: the message renders both; the cause keeps everything
	assertEquals(thrown.name, "Panic (Invariant)");
	assertEquals(
		thrown.message,
		[
			"an invariant was violated",
			`Expected behavior: ${EXPECTED}`,
			"Actual value: { total: 9 }",
			"Expected value: { total: 10 }",
			"Please file an issue at https://example.com/issues",
		].join("\n"),
	);
	assert(isInvariantPanic(thrown));
	assertEquals(thrown.cause, {
		check: { kind: "equal", actual: { total: 9 }, expected: { total: 10 } },
		expectedBehavior: EXPECTED,
		issueUrl,
	});
});

Deno.test("invariantEqual renders hostile and huge values without throwing", () => {
	// Given: a cyclic value and a huge string
	const cycle: { self?: unknown } = {};
	cycle.self = cycle;
	const huge = "a".repeat(5_000);

	// When: invariantEqual compares them
	const thrown = assertThrows(() => {
		invariantEqual<unknown>({
			actual: cycle,
			expected: huge,
			expectedBehavior: EXPECTED,
		});
	}, Panic);

	// Then: both render, bounded
	assertEquals(thrown.message.split("\n").slice(2), [
		"Actual value: { self: [Circular] }",
		`Expected value: "${"a".repeat(200)}"… 4800 more chars`,
	]);
});

Deno.test("invariantEqual compares with a custom equals", () => {
	// Given: a comparator by ID, called as a method of the options
	const options = (
		actual: { id: number; name: string },
		expected: { id: number; name: string },
	): InvariantEqualOptions<{ id: number; name: string }> => {
		return {
			actual,
			expected,
			equals: (a, b) => a.id === b.id,
			expectedBehavior: "a renamed user should keep their ID",
		};
	};

	// When: comparing objects with one ID and with two
	invariantEqual(options({ id: 1, name: "a" }, { id: 1, name: "b" }));
	const thrown = assertThrows(() => {
		invariantEqual(options({ id: 1, name: "a" }, { id: 2, name: "a" }));
	}, Panic);

	// Then: only the different IDs panic
	assert(isInvariantPanic(thrown));
	assertEquals(thrown.cause.check, {
		kind: "equal",
		actual: { id: 1, name: "a" },
		expected: { id: 2, name: "a" },
	});
});

Deno.test("invariantEqual treats an equals that is not a function as unequal", () => {
	// Given: untyped options whose equals is not a function
	const options: unknown = {
		actual: 1,
		expected: 1,
		equals: "yes",
		expectedBehavior: EXPECTED,
	};

	// When: invariantEqual checks them
	const thrown = assertThrows(() => {
		Reflect.apply(invariantEqual, undefined, [options]);
	}, Panic);

	// Then: it panics as an invariant, keeping both values
	assert(isInvariantPanic(thrown));
	assertEquals(thrown.cause.check, { kind: "equal", actual: 1, expected: 1 });
});

Deno.test("invariantEqual with an explicitly undefined equals uses Object.is", () => {
	// Given: untyped options whose equals is undefined
	const options: unknown = {
		actual: Number.NaN,
		expected: Number.NaN,
		equals: undefined,
		expectedBehavior: EXPECTED,
	};

	// When: invariantEqual checks them
	const returned: unknown = Reflect.apply(invariantEqual, undefined, [options]);

	// Then: NaN equals NaN, so it returns
	assertEquals(returned, undefined);
});

Deno.test("invariantEqual requires values of one type", () => {
	// Given: calls that must not compile, never run, and a comparator of strings
	const ones = { actual: 1, expected: 1, expectedBehavior: EXPECTED };
	const onStrings = (a: string, b: string): boolean => a === b;
	const neverRun = (): void => {
		// When: comparing different types, or leaving out what is required
		// Then: each is a type error
		// @ts-expect-error a number never equals a string
		invariantEqual({ actual: 1, expected: "1", expectedBehavior: EXPECTED });
		// @ts-expect-error the expected behavior is required
		invariantEqual({ actual: 1, expected: 1 });
		// @ts-expect-error the expected value is required
		invariantEqual({ actual: 1, expectedBehavior: EXPECTED });
		// @ts-expect-error equals compares two values of the shared type
		invariantEqual({ ...ones, equals: onStrings });
	};

	assertEquals(typeof neverRun, "function");
});
