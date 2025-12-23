import { assertEquals } from "@std/assert";
import { None, Some } from "./core.ts";
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
