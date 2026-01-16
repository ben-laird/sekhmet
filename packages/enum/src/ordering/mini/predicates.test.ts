import { assertEquals } from "@std/assert";
import { Equal, Greater, Less } from "./core.ts";
import { isEq, isGe, isGt, isLe, isLt, isNe } from "./predicates.ts";

Deno.test("isLt returns true only for Less", () => {
	// Given: the three ordering states
	const less = Less();
	const equal = Equal();
	const greater = Greater();

	// When: checking isLt on each

	// Then: only Less returns true
	assertEquals(isLt(less), true);
	assertEquals(isLt(equal), false);
	assertEquals(isLt(greater), false);
});

Deno.test("isGt returns true only for Greater", () => {
	// Given: the three ordering states
	const less = Less();
	const equal = Equal();
	const greater = Greater();

	// When: checking isGt on each

	// Then: only Greater returns true
	assertEquals(isGt(less), false);
	assertEquals(isGt(equal), false);
	assertEquals(isGt(greater), true);
});

Deno.test("isEq returns true only for Equal", () => {
	// Given: the three ordering states
	const less = Less();
	const equal = Equal();
	const greater = Greater();

	// When: checking isEq on each

	// Then: only Equal returns true
	assertEquals(isEq(less), false);
	assertEquals(isEq(equal), true);
	assertEquals(isEq(greater), false);
});

Deno.test("isNe returns true for Less and Greater, false for Equal", () => {
	// Given: the three ordering states
	const less = Less();
	const equal = Equal();
	const greater = Greater();

	// When: checking isNe on each

	// Then: Less and Greater return true, Equal returns false
	assertEquals(isNe(less), true);
	assertEquals(isNe(equal), false);
	assertEquals(isNe(greater), true);
});

Deno.test("isLe returns true for Less and Equal, false for Greater", () => {
	// Given: the three ordering states
	const less = Less();
	const equal = Equal();
	const greater = Greater();

	// When: checking isLe on each

	// Then: Less and Equal return true, Greater returns false
	assertEquals(isLe(less), true);
	assertEquals(isLe(equal), true);
	assertEquals(isLe(greater), false);
});

Deno.test("isGe returns true for Greater and Equal, false for Less", () => {
	// Given: the three ordering states
	const less = Less();
	const equal = Equal();
	const greater = Greater();

	// When: checking isGe on each

	// Then: Greater and Equal return true, Less returns false
	assertEquals(isGe(less), false);
	assertEquals(isGe(equal), true);
	assertEquals(isGe(greater), true);
});
