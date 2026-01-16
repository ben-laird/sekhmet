import { assertEquals } from "@std/assert";
import { unionKinds } from "@sekhmet/enum/core/mini/exit";
import { Equal, Greater, Less, Ordering } from "./core.ts";

Deno.test("Less() creates an Ordering in the Less state", () => {
	// Given: nothing

	// When: creating a Less ordering
	const ord = Less();

	// Then: it should be an Ordering with kind "Less"
	assertEquals(ord instanceof Ordering, true);
	assertEquals(unionKinds(ord), "Less");
});

Deno.test("Equal() creates an Ordering in the Equal state", () => {
	// Given: nothing

	// When: creating an Equal ordering
	const ord = Equal();

	// Then: it should be an Ordering with kind "Equal"
	assertEquals(ord instanceof Ordering, true);
	assertEquals(unionKinds(ord), "Equal");
});

Deno.test("Greater() creates an Ordering in the Greater state", () => {
	// Given: nothing

	// When: creating a Greater ordering
	const ord = Greater();

	// Then: it should be an Ordering with kind "Greater"
	assertEquals(ord instanceof Ordering, true);
	assertEquals(unionKinds(ord), "Greater");
});
