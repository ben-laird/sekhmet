import { assertEquals, assertInstanceOf, assertNotEquals } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import { Enum } from "@/src/core/mini/core.ts";
import { union, unionKinds } from "@/src/core/mini/exit.ts";
import { Either, Left, Right } from "@/src/either/mini/core.ts";

Deno.test("Left() builds the Left variant holding the value", () => {
	// Given: a value
	const value = { id: 1 };

	// When: wrapping it with Left()
	const subject = Left(value);

	// Then: it is a Left Either carrying the value, with a never right side
	assertInstanceOf(subject, Either);
	assertInstanceOf(subject, Enum);
	assertEquals(unionKinds(subject), "Left");
	assertEquals(union(subject), value);
	assertType<IsExact<typeof subject, Either<{ id: number }, never>>>(true);
});

Deno.test("Right() builds the Right variant holding the value", () => {
	// Given: a value
	const value = "text";

	// When: wrapping it with Right()
	const subject = Right(value);

	// Then: it is a Right Either carrying the value, with a never left side
	assertInstanceOf(subject, Either);
	assertEquals(unionKinds(subject), "Right");
	assertEquals(union(subject), value);
	assertType<IsExact<typeof subject, Either<never, string>>>(true);
});

Deno.test("Either is covariant in both sides", () => {
	// Given: a Left and a Right with a never other side
	const left = Left(1);
	const right = Right("a");

	// When: assigning them to a wider Either
	const widened: Either<number | boolean, string>[] = [left, right];

	// Then: both fit
	assertEquals(widened.length, 2);
});

Deno.test("Eithers are equal by variant and payload", () => {
	// Given: Eithers built from equal and differing parts
	const same = [Left(1), Left(1)];
	const differentValue = [Left(1), Left(2)];
	const differentSide = [Left(1), Right(1)];

	// When: comparing them structurally
	// Then: only matching variant and payload are equal
	assertEquals(same[0], same[1]);
	assertNotEquals(differentValue[0], differentValue[1]);
	assertNotEquals(differentSide[0], differentSide[1]);
});
