import { Panic } from "@sekhmet/panic/mini/core";
import { assert, assertEquals, assertThrows } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import { type DefinedValue, defined } from "@/src/invariant/defined.ts";
import { isInvariantPanic } from "@/src/invariant/invariant.ts";

const EXPECTED = "every item in the cart should have a price";

Deno.test("defined returns present values, falsy ones included", () => {
	// Given: falsy and truthy values that are neither null nor undefined
	const values: unknown[] = [0, -0, "", false, Number.NaN, 0n, 1, "x", {}];

	// When: defined checks each, in every absent mode
	const checked = (["nullish", "undefined", "null"] as const).map((absent) => {
		return values.map((value) => {
			return defined(value, { absent, expectedBehavior: EXPECTED });
		});
	});

	// Then: each comes back as itself
	assertEquals(checked, [values, values, values]);
});

Deno.test("defined panics on what each absent mode counts as absent", async (t) => {
	await t.step("nullish, the default, rejects null and undefined", () => {
		// Given: null and undefined
		// When: defined checks each without an absent mode
		const thrown = [null, undefined].map((value) => {
			return assertThrows(() => {
				defined(value, { expectedBehavior: EXPECTED });
			}, Panic);
		});

		// Then: both panic as invariants, keeping the value and the mode
		assertEquals(
			thrown.map((panic) => {
				return isInvariantPanic(panic) ? panic.cause.check : undefined;
			}),
			[
				{ kind: "defined", absent: "nullish", value: null },
				{ kind: "defined", absent: "nullish", value: undefined },
			],
		);
	});

	await t.step("undefined rejects only undefined", () => {
		// Given: null and undefined, with only undefined absent
		const options = {
			absent: "undefined",
			expectedBehavior: EXPECTED,
		} as const;

		// When: defined checks each
		const kept = defined(null, options);
		const thrown = assertThrows(() => defined(undefined, options), Panic);

		// Then: null passes; undefined panics
		assertEquals(kept, null);
		assert(isInvariantPanic(thrown));
		assertEquals(thrown.cause.check, {
			kind: "defined",
			absent: "undefined",
			value: undefined,
		});
	});

	await t.step("null rejects only null", () => {
		// Given: null and undefined, with only null absent
		const options = { absent: "null", expectedBehavior: EXPECTED } as const;

		// When: defined checks each
		const kept = defined(undefined, options);
		const thrown = assertThrows(() => defined(null, options), Panic);

		// Then: undefined passes; null panics
		assertEquals(kept, undefined);
		assert(isInvariantPanic(thrown));
		assertEquals(thrown.cause.check, {
			kind: "defined",
			absent: "null",
			value: null,
		});
	});
});

Deno.test("defined's panic shows the absent value and the issue URL", () => {
	// Given: a missing price and an issue URL
	const issueUrl = new URL("https://example.com/issues");

	// When: defined checks it
	const thrown = assertThrows(
		() => defined(undefined, { expectedBehavior: EXPECTED, issueUrl }),
		Panic,
	);

	// Then: the message names the absent value; the cause keeps everything
	assertEquals(thrown.name, "Panic (Invariant)");
	assertEquals(
		thrown.message,
		[
			"an invariant was violated",
			`Expected behavior: ${EXPECTED}`,
			"Absent value: undefined",
			"Please file an issue at https://example.com/issues",
		].join("\n"),
	);
	assert(isInvariantPanic(thrown));
	assertEquals(thrown.cause, {
		check: { kind: "defined", absent: "nullish", value: undefined },
		expectedBehavior: EXPECTED,
		issueUrl,
	});
});

Deno.test("defined reads an untyped caller's options without throwing", () => {
	// Given: options that are null, carry an unknown mode, or throw on read
	const hostile = new Proxy(
		{},
		{
			has: (): never => {
				throw new Error("trap ran");
			},
		},
	);
	const untyped: unknown[] = [null, { absent: "falsy" }, hostile];

	// When: defined checks a null value with each
	const checks = untyped.map((options) => {
		const thrown = assertThrows(() => {
			Reflect.apply(defined, undefined, [null, options]);
		}, Panic);
		return isInvariantPanic(thrown) ? thrown.cause : undefined;
	});

	// Then: each panics as an invariant, treating absent as nullish
	assertEquals(
		checks.map((cause) => cause?.check),
		[
			{ kind: "defined", absent: "nullish", value: null },
			{ kind: "defined", absent: "nullish", value: null },
			{ kind: "defined", absent: "nullish", value: null },
		],
	);
	assertEquals(
		checks.map((cause) => cause?.expectedBehavior),
		["(not given)", "(not given)", "[unrenderable value]"],
	);
});

Deno.test("defined narrows by its absent mode", () => {
	// Given: a value that may be null or undefined
	const maybe: number | null | undefined = [1, null, undefined][0];

	// When: defined checks it in each absent mode
	const nullish = defined(maybe, { expectedBehavior: EXPECTED });
	const explicit = defined(maybe, {
		absent: "nullish",
		expectedBehavior: EXPECTED,
	});
	const noUndefined = defined(maybe, {
		absent: "undefined",
		expectedBehavior: EXPECTED,
	});
	const noNull = defined(maybe, { absent: "null", expectedBehavior: EXPECTED });

	// Then: each removes exactly what it counts as absent
	assertType<IsExact<typeof nullish, number>>(true);
	assertType<IsExact<typeof explicit, number>>(true);
	assertType<IsExact<typeof noUndefined, number | null>>(true);
	assertType<IsExact<typeof noNull, number | undefined>>(true);
	assertType<IsExact<DefinedValue<string | null, "undefined">, string | null>>(
		true,
	);
	assertEquals([nullish, explicit, noUndefined, noNull], [1, 1, 1, 1]);
});

Deno.test("defined with a mode only known as a union narrows to what every mode allows", () => {
	// Given: a check whose absent mode is typed as two modes
	const check = (
		value: string | null | undefined,
		absent: "undefined" | "null",
	) => {
		return defined(value, { absent, expectedBehavior: EXPECTED });
	};

	// When: defined checks a value with it
	const value = check("x", "null");

	// Then: it is narrowed only as far as either mode would
	assertType<IsExact<typeof value, string | null | undefined>>(true);
	assertEquals(value, "x");
});

Deno.test("defined rejects options it does not take", () => {
	// Given: calls that must not compile, never run
	const neverRun = (): void => {
		// When: leaving out the expected behavior, or giving an unknown mode
		// Then: each is a type error
		// @ts-expect-error the expected behavior is required
		defined(1, {});
		// @ts-expect-error "falsy" is not an absent mode: truthiness is never tested
		defined(1, { absent: "falsy", expectedBehavior: EXPECTED });
		// @ts-expect-error options have no name: they cannot rename the panic
		defined(1, { expectedBehavior: EXPECTED, name: "Evil" });
	};

	assertEquals(typeof neverRun, "function");
});

Deno.test("a defined value widens to its input, never the reverse", () => {
	// Given: a value narrowed by defined, and one that may be absent
	const maybe: string | undefined = ["a", undefined][0];
	const narrow = defined(maybe, { expectedBehavior: EXPECTED });

	// When: assigning between them both ways
	const widened: string | undefined = narrow;
	// @ts-expect-error a value that may be undefined is not narrowed
	const narrowed: typeof narrow = maybe;

	// Then: only widening compiles
	assertEquals([widened, narrowed], ["a", "a"]);
});

Deno.test("a defined value rejects its input, then widens to it", () => {
	// Given: a value narrowed by defined, and one that may be absent
	const maybe: string | undefined = ["a", undefined][0];
	const narrow = defined(maybe, { expectedBehavior: EXPECTED });

	// When: assigning between them, rejection first
	// @ts-expect-error a value that may be undefined is not narrowed
	const narrowed: typeof narrow = maybe;
	const widened: typeof maybe = narrow;

	// Then: the order changes nothing: only widening compiles
	assertEquals([narrowed, widened], ["a", "a"]);
});
