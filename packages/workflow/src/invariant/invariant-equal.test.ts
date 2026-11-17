import { Panic } from "@sekhmet/panic/mini/core";
import {
	assert,
	assertEquals,
	assertStrictEquals,
	assertThrows,
} from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
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
			equals: ({ actual, expected }) => actual.id === expected.id,
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
	const onStrings = (values: { actual: string; expected: string }): boolean => {
		return values.actual === values.expected;
	};
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

Deno.test("invariantEqual fails closed on options it cannot read", async (t) => {
	await t.step("missing or non-object options panic", () => {
		// Given: options that are absent, null, or lack both values
		const untyped: unknown[][] = [[], [null], [{ expectedBehavior: EXPECTED }]];

		// When: invariantEqual is called with each
		const checks = untyped.map((args) => {
			const thrown = assertThrows(() => {
				Reflect.apply(invariantEqual, undefined, args);
			}, Panic);
			return isInvariantPanic(thrown) ? thrown.cause.check : undefined;
		});

		// Then: each panics as unequal, claiming no value it was not given
		const missing: InvariantCheck = { kind: "equal" };
		assertEquals(checks, [missing, missing, missing]);
	});

	await t.step(
		"a value whose getter throws panics, marked unrenderable",
		() => {
			// Given: options whose actual and expected getters throw
			const options = {
				get actual(): never {
					throw new Error("getter ran");
				},
				get expected(): never {
					throw new Error("getter ran");
				},
				expectedBehavior: EXPECTED,
			};

			// When: invariantEqual checks them
			const thrown = assertThrows(() => invariantEqual(options), Panic);

			// Then: it panics; the message marks both values, the cause omits them
			assertEquals(thrown.message.split("\n").slice(2), [
				"Actual value: [unrenderable value]",
				"Expected value: [unrenderable value]",
			]);
			assert(isInvariantPanic(thrown));
			assertEquals(thrown.cause.check, { kind: "equal" });
			assertEquals("actual" in thrown.cause.check, false);
		},
	);

	await t.step("a Proxy whose every trap throws panics", () => {
		// Given: options that throw on any inspection
		const trap = (): never => {
			throw new Error("trap ran");
		};
		const hostile = new Proxy({}, { has: trap, get: trap });

		// When: invariantEqual checks them
		const thrown = assertThrows(() => {
			Reflect.apply(invariantEqual, undefined, [hostile]);
		}, Panic);

		// Then: it panics as an invariant with nothing claimed
		assert(isInvariantPanic(thrown));
		assertEquals(thrown.cause.check, { kind: "equal" });
		assertEquals(thrown.cause.expectedBehavior, "[unrenderable value]");
	});

	await t.step("one readable value is kept, the other is not", () => {
		// Given: options with a readable actual and a throwing expected
		const options = {
			actual: 1,
			get expected(): number {
				throw new Error("getter ran");
			},
			expectedBehavior: EXPECTED,
		};

		// When: invariantEqual checks them
		const thrown = assertThrows(() => invariantEqual(options), Panic);

		// Then: only the readable value is in the cause
		assert(isInvariantPanic(thrown));
		assertEquals(thrown.cause.check, { kind: "equal", actual: 1 });
	});
});

Deno.test("invariantEqual lets a throwing equals' error propagate unchanged", () => {
	// Given: a comparator that throws
	const boom = new Error("equals ran");
	const equals = (): boolean => {
		throw boom;
	};

	// When: invariantEqual compares with it
	const thrown = assertThrows(() => {
		invariantEqual({
			actual: 1,
			expected: 1,
			equals,
			expectedBehavior: EXPECTED,
		});
	});

	// Then: the comparator's own error arrives, not a panic
	assertStrictEquals(thrown, boom);
	assertEquals(isInvariantPanic(thrown), false);
});

Deno.test("invariantEqual infers one type from both values", () => {
	// Given: pairs of literals, of a union and a literal, and of a number and null
	const statuses: ("open" | "closed")[] = ["open"];
	const status = statuses[0] ?? "closed";

	// When: invariantEqual checks each, observing T through equals
	invariantEqual({
		actual: 1,
		expected: 1,
		equals: (values) => {
			assertType<IsExact<typeof values.actual, number>>(true);
			return Object.is(values.actual, values.expected);
		},
		expectedBehavior: EXPECTED,
	});
	invariantEqual({
		actual: status,
		expected: "open",
		equals: (values) => {
			assertType<IsExact<typeof values.expected, string>>(true);
			return values.actual === values.expected;
		},
		expectedBehavior: EXPECTED,
	});
	const nullable = assertThrows(() => {
		invariantEqual({
			actual: 1,
			expected: null,
			equals: (values) => {
				assertType<IsExact<typeof values.actual, number | null>>(true);
				return values.actual === values.expected;
			},
			expectedBehavior: EXPECTED,
		});
	});

	// Then: T is the values' common type with literals widened (string, not
	// "open" | "closed"), and a type and null widen to a union
	assert(isInvariantPanic(nullable));
});

Deno.test("invariantEqual's options are invariant in their type", () => {
	// Given: options over a literal type and over string
	const narrow: InvariantEqualOptions<"a"> = {
		actual: "a",
		expected: "a",
		expectedBehavior: EXPECTED,
	};
	const wide: InvariantEqualOptions<string> = {
		actual: "b",
		expected: "b",
		equals: ({ actual, expected }) => actual.length === expected.length,
		expectedBehavior: EXPECTED,
	};

	// When: assigning between them both ways, in both orders
	// @ts-expect-error a string comparator does not take "a" values' place
	const narrowed: InvariantEqualOptions<"a"> = wide;
	// @ts-expect-error equals of "a" values cannot compare any string
	const widened: InvariantEqualOptions<string> = narrow;
	// @ts-expect-error equals of "a" values cannot compare any string
	const widenedAgain: InvariantEqualOptions<string> = narrow;
	// @ts-expect-error a string comparator does not take "a" values' place
	const narrowedAgain: InvariantEqualOptions<"a"> = wide;

	// Then: neither direction compiles, since equals reads T and actual holds it
	assertEquals(
		[narrowed, widened, widenedAgain, narrowedAgain],
		[wide, narrow, narrow, wide],
	);
});
