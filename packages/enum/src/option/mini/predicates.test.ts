import { assertEquals, unreachable } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import { match, union } from "@/src/core/mini/exit.ts";
import { None, type Option, Some } from "./core.ts";
import * as TestSubject from "./predicates.ts";

Deno.test("isSome() returns true for Some", () => {
	// Given: an Option with Some variant
	const option = Some(42);

	// When: calling isSome() to check the variant
	const subject = TestSubject.isSome(option);

	// Then: true is returned
	assertEquals(subject, true);
});

Deno.test("isSome() returns false for None", () => {
	// Given: an Option with None variant
	const option = None<number>();

	// When: calling isSome() to check the variant
	const subject = TestSubject.isSome(option);

	// Then: false is returned
	assertEquals(subject, false);
});

Deno.test("isSome() works with different types", () => {
	// Given: Options with Some variants of different types
	const stringOption = Some("hello");
	const objectOption = Some({ key: "value" });
	const arrayOption = Some([1, 2, 3]);

	// When: calling isSome() on each Option
	// Then: true is returned for all Some variants
	assertEquals(TestSubject.isSome(stringOption), true);
	assertEquals(TestSubject.isSome(objectOption), true);
	assertEquals(TestSubject.isSome(arrayOption), true);
});

Deno.test("isSomeAnd() returns true when Some and predicate passes", () => {
	// Given: an Option with Some variant and a predicate that should pass
	const option = Some(10);

	// When: calling isSomeAnd() with the predicate
	const subject = TestSubject.isSomeAnd(option, (x) => x > 5);

	// Then: true is returned
	assertEquals(subject, true);
});

Deno.test("isSomeAnd() returns false when Some but predicate fails", () => {
	// Given: an Option with Some variant and a predicate that should fail
	const option = Some(3);

	// When: calling isSomeAnd() with the predicate
	const subject = TestSubject.isSomeAnd(option, (x) => x > 5);

	// Then: false is returned
	assertEquals(subject, false);
});

Deno.test("isSomeAnd() returns false for None", () => {
	// Given: an Option with None variant
	const option = None<number>();

	// When: calling isSomeAnd() with a predicate
	const subject = TestSubject.isSomeAnd(option, (x) => x > 5);

	// Then: false is returned
	assertEquals(subject, false);
});

Deno.test("isSomeAnd() works with type guards", () => {
	// Given: an Option with Some variant containing a number
	const option = Some<string | number>(42);

	// When: calling isSomeAnd() with a type guard predicate
	const subject = TestSubject.isSomeAnd(
		option,
		(x): x is number => typeof x === "number",
	);

	// Then: true is returned when the type guard passes
	assertEquals(subject, true);
});

Deno.test("isSomeAnd() type guard narrows correctly", () => {
	// Given: an Option with Some variant containing a string
	const option = Some<string | number>("hello");

	// When: calling isSomeAnd() with a type guard for number
	const subject = TestSubject.isSomeAnd(
		option,
		(x): x is number => typeof x === "number",
	);

	// Then: false is returned when the type guard fails
	assertEquals(subject, false);
});

Deno.test("isNone() returns true for None", () => {
	// Given: an Option with None variant
	const option = None<number>();

	// When: calling isNone() to check the variant
	const subject = TestSubject.isNone(option);

	// Then: true is returned
	assertEquals(subject, true);
});

Deno.test("isNone() returns false for Some", () => {
	// Given: an Option with Some variant
	const option = Some(42);

	// When: calling isNone() to check the variant
	const subject = TestSubject.isNone(option);

	// Then: false is returned
	assertEquals(subject, false);
});

Deno.test("isNone() works with different types", () => {
	// Given: Options with None variants of different types
	const stringNone = None<string>();
	const objectNone = None<{ key: string }>();
	const arrayNone = None<number[]>();

	// When: calling isNone() on each Option
	// Then: true is returned for all None variants
	assertEquals(TestSubject.isNone(stringNone), true);
	assertEquals(TestSubject.isNone(objectNone), true);
	assertEquals(TestSubject.isNone(arrayNone), true);
});

Deno.test("isSome() narrows to the Some variant and keeps T", async (t) => {
	await t.step("a match after the guard needs only the Some arm", () => {
		// Given: an Option typed as either variant
		const option: Option<number> = Some(42);

		// When: guarding it with isSome()
		if (TestSubject.isSome(option)) {
			// Then: only the Some arm is required, and the payload is exactly T
			const value = union(option);
			assertType<IsExact<typeof value, number>>(true);
			assertEquals(match(option)({ Some: (n) => n + 1 }), 43);
		} else {
			unreachable();
		}
	});

	await t.step("an unguarded match needs the None arm too", () => {
		// Given: an Option typed as either variant
		const option: Option<number> = Some(42);

		// When: matching it with only a Some arm
		// @ts-expect-error: the None arm is missing
		const value = match(option)({ Some: (n: number) => n });

		// Then: the match is rejected at compile time
		assertEquals(value, 42);
	});

	await t.step("the guarded option is still an Option<T>", () => {
		// Given: an Option typed as either variant
		const option: Option<number> = Some(42);

		// When: guarding it with isSome()
		if (TestSubject.isSome(option)) {
			// Then: it is still assignable to Option<number>
			const same: Option<number> = option;
			assertEquals(same, Some(42));
		} else {
			unreachable();
		}
	});

	await t.step("the else-branch is not narrowed", () => {
		// Given: an Option typed as either variant
		const option: Option<number> = None();

		// When: the guard fails
		if (TestSubject.isSome(option)) {
			unreachable();
		} else {
			// Then: the option keeps its declared type
			assertType<IsExact<typeof option, Option<number>>>(true);
		}
	});
});

Deno.test("isSomeAnd() narrows to Some and the payload to the guarded type", async (t) => {
	await t.step("a type-guard predicate narrows the payload", () => {
		// Given: an Option whose value may be a string or a number
		const option: Option<string | number> = Some(42);

		// When: guarding it with isSomeAnd() and a guard for numbers
		if (
			TestSubject.isSomeAnd(option, (x): x is number => typeof x === "number")
		) {
			// Then: only the Some arm is required, and the payload is a number
			const value = union(option);
			assertType<IsExact<typeof value, number>>(true);
			assertEquals(match(option)({ Some: (n) => n + 1 }), 43);
		} else {
			unreachable();
		}
	});

	await t.step("a boolean predicate keeps the payload type", () => {
		// Given: an Option whose value may be a string or a number
		const option: Option<string | number> = Some(42);

		// When: guarding it with isSomeAnd() and a boolean predicate
		if (TestSubject.isSomeAnd(option, (x) => x !== "")) {
			// Then: the payload type is unchanged
			const value = union(option);
			assertType<IsExact<typeof value, string | number>>(true);
		} else {
			unreachable();
		}
	});

	await t.step("an unguarded match needs the None arm too", () => {
		// Given: an Option typed as either variant
		const option: Option<string | number> = Some(42);

		// When: matching it with only a Some arm
		// @ts-expect-error: the None arm is missing
		const value = match(option)({ Some: () => 0 });

		// Then: the match is rejected at compile time
		assertEquals(value, 0);
	});

	await t.step("the guarded option is an Option<U>", () => {
		// Given: an Option whose value may be a string or a number
		const option: Option<string | number> = Some(42);

		// When: guarding it with isSomeAnd() and a guard for numbers
		if (
			TestSubject.isSomeAnd(option, (x): x is number => typeof x === "number")
		) {
			// Then: it is assignable to Option<number>
			const narrowed: Option<number> = option;
			assertEquals(narrowed, Some(42));
		} else {
			unreachable();
		}
	});

	await t.step("the else-branch is not narrowed", () => {
		// Given: an Option holding a string
		const option: Option<string | number> = Some("hello");

		// When: the numeric guard fails
		if (
			TestSubject.isSomeAnd(option, (x): x is number => typeof x === "number")
		) {
			unreachable();
		} else {
			// Then: the option keeps its declared type
			assertType<IsExact<typeof option, Option<string | number>>>(true);
		}
	});
});

Deno.test("isNone() narrows to the None variant and to Option<never>", async (t) => {
	await t.step("a match after the guard needs only the None arm", () => {
		// Given: an Option typed as either variant
		const option: Option<number> = None();

		// When: guarding it with isNone()
		if (TestSubject.isNone(option)) {
			// Then: only the None arm is required
			assertEquals(match(option)({ None: () => "empty" }), "empty");
		} else {
			unreachable();
		}
	});

	await t.step("an unguarded match needs the Some arm too", () => {
		// Given: an Option typed as either variant
		const option: Option<number> = None();

		// When: matching it with only a None arm
		// @ts-expect-error: the Some arm is missing
		const label = match(option)({ None: () => "empty" });

		// Then: the match is rejected at compile time
		assertEquals(label, "empty");
	});

	await t.step("the guarded option is an Option of any type", () => {
		// Given: an Option typed as either variant
		const option: Option<number> = None();

		// When: guarding it with isNone()
		if (TestSubject.isNone(option)) {
			// Then: it is assignable to an Option of an unrelated type
			const other: Option<string> = option;
			assertEquals(other, None());
		} else {
			unreachable();
		}
	});

	await t.step("the else-branch is not narrowed", () => {
		// Given: an Option typed as either variant
		const option: Option<number> = Some(42);

		// When: the guard fails
		if (TestSubject.isNone(option)) {
			unreachable();
		} else {
			// Then: the option keeps its declared type
			assertType<IsExact<typeof option, Option<number>>>(true);
		}
	});
});
