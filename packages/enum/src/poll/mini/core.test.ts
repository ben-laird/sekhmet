import { assertEquals, assertInstanceOf, assertNotEquals } from "@std/assert";
import { union, unionKinds } from "@/src/core/mini/exit.ts";
import { Pending, Poll, Ready } from "@/src/poll/mini/core.ts";

Deno.test("Ready() builds the Ready variant holding the value", () => {
	// Given: a value
	const value = [1, 2];

	// When: wrapping it with Ready()
	const subject = Ready(value);

	// Then: it is a Ready Poll carrying the value
	assertInstanceOf(subject, Poll);
	assertEquals(unionKinds(subject), "Ready");
	assertEquals(union(subject), value);
});

Deno.test("Pending() builds the payload-free Pending variant", () => {
	// Given: nothing
	// When: constructing Pending()
	const subject = Pending();

	// Then: it is a Pending Poll with no value
	assertInstanceOf(subject, Poll);
	assertEquals(unionKinds(subject), "Pending");
	assertEquals(union(subject), undefined);
});

Deno.test("Polls are equal by variant and payload", () => {
	// Given: polls built from equal and differing parts
	// When: comparing them structurally
	// Then: only matching variant and payload are equal
	assertEquals(Ready(1), Ready(1));
	assertEquals(Pending(), Pending());
	assertNotEquals(Ready(1), Ready(2));
	assertNotEquals<unknown>(Ready(undefined), Pending());
});
