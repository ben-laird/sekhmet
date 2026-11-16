import { assertEquals, assertInstanceOf, assertNotEquals } from "@std/assert";
import { union, unionKinds } from "@/src/core/mini/exit.ts";
import { Active, Inactive, Latch } from "@/src/latch/mini/core.ts";

Deno.test("Active() builds the Active variant holding its value", () => {
	// Given: an active value
	const value = { on: true };

	// When: wrapping it with Active()
	const subject = Active(value);

	// Then: it is an Active Latch carrying the value
	assertInstanceOf(subject, Latch);
	assertEquals(unionKinds(subject), "Active");
	assertEquals(union(subject), value);
});

Deno.test("Inactive() builds the Inactive variant holding its value", () => {
	// Given: an inactive value
	const value = "idle";

	// When: wrapping it with Inactive()
	const subject = Inactive(value);

	// Then: it is an Inactive Latch carrying the value
	assertInstanceOf(subject, Latch);
	assertEquals(unionKinds(subject), "Inactive");
	assertEquals(union(subject), "idle");
});

Deno.test("Latches are equal by variant and payload", () => {
	// Given: latches built from equal and differing parts
	// When: comparing them structurally
	// Then: only matching variant and payload are equal
	assertEquals(Active(1), Active(1));
	assertNotEquals(Active(1), Active(2));
	assertNotEquals(Active(1), Inactive(1));
});
