import { assertEquals, assertInstanceOf, assertNotEquals } from "@std/assert";
import { Enum } from "@/src/core/mini/core.ts";
import { union, unionKinds } from "@/src/core/mini/exit.ts";
import { Err, Ok, Result } from "@/src/result/mini/core.ts";

Deno.test("Ok() builds the Ok variant holding the value", () => {
	// Given: a success value
	const value = { id: 1 };

	// When: wrapping it with Ok()
	const subject = Ok(value);

	// Then: it is an Ok Result carrying the value
	assertInstanceOf(subject, Result);
	assertInstanceOf(subject, Enum);
	assertEquals(unionKinds(subject), "Ok");
	assertEquals(union(subject), value);
});

Deno.test("Err() builds the Err variant holding the error", () => {
	// Given: an error value
	const error = new Error("nope");

	// When: wrapping it with Err()
	const subject = Err(error);

	// Then: it is an Err Result carrying the error
	assertInstanceOf(subject, Result);
	assertEquals(unionKinds(subject), "Err");
	assertEquals(union(subject), error);
});

Deno.test("Results are equal by variant and payload", () => {
	// Given: Results built from equal and differing parts
	const same = [Ok(1), Ok(1)];
	const differentValue = [Ok(1), Ok(2)];
	const differentKind = [Ok(1), Err(1)];

	// When: comparing them structurally
	// Then: only matching variant and payload are equal
	assertEquals(same[0], same[1]);
	assertNotEquals(differentValue[0], differentValue[1]);
	assertNotEquals(differentKind[0], differentKind[1]);
});
