import { Panic } from "@sekhmet/panic/mini/core";
import {
	assert,
	assertEquals,
	assertStrictEquals,
	assertThrows,
} from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import { isInvariantPanic } from "@/src/invariant/invariant.ts";
import { satisfies } from "@/src/invariant/satisfies.ts";

const EXPECTED = "a quantity should be a positive integer";

type Shape = { kind: "circle"; r: number } | { kind: "square"; side: number };
type Circle = Extract<Shape, { kind: "circle" }>;

const isCircle = (shape: Shape): shape is Circle => shape.kind === "circle";
const isPositive = (n: number): boolean => Number.isInteger(n) && n > 0;

/** Widens a value to its declared type, so a test sees no narrowing. */
const widen = <T>(value: T): T => value;

Deno.test("satisfies returns a value its predicate accepts", () => {
	// Given: a positive quantity
	const quantity = 3;

	// When: satisfies checks it
	const checked = satisfies(quantity, {
		predicate: isPositive,
		expectedBehavior: EXPECTED,
	});

	// Then: it comes back as itself
	assertEquals(checked, 3);
});

Deno.test("satisfies panics with the value its predicate rejects", () => {
	// Given: a negative quantity and an issue URL
	const issueUrl = new URL("https://example.com/issues");

	// When: satisfies checks it
	const thrown = assertThrows(() => {
		satisfies(-1, {
			predicate: isPositive,
			expectedBehavior: EXPECTED,
			issueUrl,
		});
	}, Panic);

	// Then: the message shows the rejected value; the cause keeps everything
	assertEquals(thrown.name, "Panic (Invariant)");
	assertEquals(
		thrown.message,
		[
			"an invariant was violated",
			`Expected behavior: ${EXPECTED}`,
			"Rejected value: -1",
			"Please file an issue at https://example.com/issues",
		].join("\n"),
	);
	assert(isInvariantPanic(thrown));
	assertEquals(thrown.cause, {
		check: { kind: "satisfies", value: -1 },
		expectedBehavior: EXPECTED,
		issueUrl,
	});
});

Deno.test("satisfies calls its predicate as a method of the options", () => {
	// Given: options whose predicate reads a bound off the options
	const options = {
		limit: 10,
		predicate(this: { limit: number }, n: number): boolean {
			return n < this.limit;
		},
		expectedBehavior: "a page should hold fewer than ten rows",
	};

	// When: satisfies checks a value under and over the bound
	const kept = satisfies(9, options);
	const thrown = assertThrows(() => satisfies(10, options), Panic);

	// Then: the predicate saw the options as `this`
	assertEquals(kept, 9);
	assert(isInvariantPanic(thrown));
});

Deno.test("satisfies treats a missing or non-function predicate as rejecting", () => {
	// Given: untyped options without a usable predicate
	const untyped: unknown[] = [
		null,
		{ expectedBehavior: EXPECTED },
		{ predicate: "yes", expectedBehavior: EXPECTED },
	];

	// When: satisfies checks a value with each
	const checks = untyped.map((options) => {
		const thrown = assertThrows(() => {
			Reflect.apply(satisfies, undefined, [1, options]);
		}, Panic);
		return isInvariantPanic(thrown) ? thrown.cause.check : undefined;
	});

	// Then: each panics as an invariant with the value
	assertEquals(checks, [
		{ kind: "satisfies", value: 1 },
		{ kind: "satisfies", value: 1 },
		{ kind: "satisfies", value: 1 },
	]);
});

Deno.test("satisfies narrows to a type guard's type", () => {
	// Given: a shape that should be a circle
	const shape = widen<Shape>({ kind: "circle", r: 2 });

	// When: satisfies checks it with a guard, and with a discriminant check
	const circle = satisfies(shape, {
		predicate: isCircle,
		expectedBehavior: "a wheel should be a circle",
	});
	const unchanged = satisfies(shape, {
		predicate: (s) => s.kind === "circle",
		expectedBehavior: "a wheel should be a circle",
	});

	// Then: the guard narrows; TypeScript infers no guard from a discriminant
	// check, so it keeps the input type
	assertType<IsExact<typeof circle, Circle>>(true);
	assertType<IsExact<typeof unchanged, Shape>>(true);
	assertEquals(circle.r, 2);
	assertEquals(unchanged, circle);
});

Deno.test("satisfies narrows by a type guard TypeScript infers", () => {
	// Given: values that may be a number, or undefined
	const id = widen<string | number>("a1");
	const name = widen<string | undefined>("Ada");

	// When: satisfies checks them with inline predicates not written as guards
	const text = satisfies(id, {
		predicate: (value) => typeof value === "string",
		expectedBehavior: "an ID should be a string",
	});
	const present = satisfies(name, {
		predicate: (value) => value !== undefined,
		expectedBehavior: "a user should have a name",
	});

	// Then: each narrows, since TypeScript 5.5 infers both as type guards
	assertType<IsExact<typeof text, string>>(true);
	assertType<IsExact<typeof present, string>>(true);
	assertEquals([text, present], ["a1", "Ada"]);
});

Deno.test("satisfies infers the value's type from the value, not the predicate", () => {
	// Given: a guard over unknown, applied to a string-or-number value
	const isString = (value: unknown): value is string => {
		return typeof value === "string";
	};
	const id = widen<string | number>("a1");

	// When: satisfies checks it
	const checked = satisfies(id, {
		predicate: isString,
		expectedBehavior: "an ID should be a string",
	});

	// Then: it is narrowed to the guard's type
	assertType<IsExact<typeof checked, string>>(true);
	assertEquals(checked, "a1");
});

Deno.test("satisfies rejects predicates and options that do not fit", () => {
	// Given: calls that must not compile, never run
	const neverRun = (): void => {
		// When: a predicate over another type, no predicate, or no expected behavior
		// Then: each is a type error
		// @ts-expect-error a predicate over numbers cannot check a string
		satisfies("a", { predicate: isPositive, expectedBehavior: EXPECTED });
		// @ts-expect-error the predicate is required
		satisfies(1, { expectedBehavior: EXPECTED });
		// @ts-expect-error the expected behavior is required
		satisfies(1, { predicate: isPositive });
	};

	assertEquals(typeof neverRun, "function");
});

Deno.test("a satisfied value widens to its input, never the reverse", () => {
	// Given: a circle narrowed by satisfies, and a shape
	const shape = widen<Shape>({ kind: "circle", r: 1 });
	const circle = satisfies(shape, {
		predicate: isCircle,
		expectedBehavior: "a wheel should be a circle",
	});

	// When: assigning between what satisfies produced and its input both ways
	const widened: typeof shape = circle;
	// @ts-expect-error a shape is not known to be what satisfies produced
	const narrowed: typeof circle = shape;

	// Then: only widening compiles
	assertEquals([widened, narrowed], [circle, shape]);
});

Deno.test("satisfies lets a throwing predicate's error propagate unchanged", () => {
	// Given: a predicate that throws
	const boom = new Error("predicate ran");
	const predicate = (_: number): boolean => {
		throw boom;
	};

	// When: satisfies checks a value with it
	const thrown = assertThrows(() => {
		satisfies(1, { predicate, expectedBehavior: EXPECTED });
	});

	// Then: the predicate's own error arrives, not a panic
	assertStrictEquals(thrown, boom);
	assertEquals(isInvariantPanic(thrown), false);
});

Deno.test("a satisfied value rejects its input, then widens to it", () => {
	// Given: a circle narrowed by satisfies, and a shape
	const shape = widen<Shape>({ kind: "circle", r: 1 });
	const circle = satisfies(shape, {
		predicate: isCircle,
		expectedBehavior: "a wheel should be a circle",
	});

	// When: assigning between them, rejection first
	// @ts-expect-error a shape is not known to be what satisfies produced
	const narrowed: typeof circle = shape;
	const widened: typeof shape = circle;

	// Then: the order changes nothing: only widening compiles
	assertEquals([narrowed, widened], [shape, circle]);
});
