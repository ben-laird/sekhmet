import { assertEquals } from "@std/assert";
import { unionKinds } from "@sekhmet/enum/core/mini/exit";
import { Equal, Greater, Less } from "./core.ts";
import { andThen, andThenWith, reverse, toNumber } from "./combinators.ts";

Deno.test("reverse swaps Less and Greater, keeps Equal", () => {
	// Given: the three ordering states
	const less = Less();
	const equal = Equal();
	const greater = Greater();

	// When: reversing each

	// Then: Less becomes Greater, Greater becomes Less, Equal stays Equal
	assertEquals(unionKinds(reverse(less)), "Greater");
	assertEquals(unionKinds(reverse(equal)), "Equal");
	assertEquals(unionKinds(reverse(greater)), "Less");
});

Deno.test("andThen returns first ordering if not Equal", () => {
	// Given: a Less ordering and a Greater ordering
	const less = Less();
	const greater = Greater();
	const other = Equal();

	// When: chaining with andThen

	// Then: the first ordering is returned, ignoring the second
	assertEquals(unionKinds(andThen(less, other)), "Less");
	assertEquals(unionKinds(andThen(greater, other)), "Greater");
});

Deno.test("andThen returns second ordering if first is Equal", () => {
	// Given: an Equal ordering and various second orderings
	const equal = Equal();

	// When: chaining with andThen

	// Then: the second ordering is returned
	assertEquals(unionKinds(andThen(equal, Less())), "Less");
	assertEquals(unionKinds(andThen(equal, Equal())), "Equal");
	assertEquals(unionKinds(andThen(equal, Greater())), "Greater");
});

Deno.test("andThenWith only calls function when Equal", () => {
	// Given: orderings and a function that tracks calls
	let called = false;
	const fn = (): typeof result => {
		called = true;
		return result;
	};
	const result = Greater();

	// When: using andThenWith with Less
	called = false;
	andThenWith(Less(), fn);

	// Then: function was not called
	assertEquals(called, false);

	// When: using andThenWith with Greater
	called = false;
	andThenWith(Greater(), fn);

	// Then: function was not called
	assertEquals(called, false);

	// When: using andThenWith with Equal
	called = false;
	const actual = andThenWith(Equal(), fn);

	// Then: function was called and result returned
	assertEquals(called, true);
	assertEquals(unionKinds(actual), "Greater");
});

Deno.test("toNumber returns -1 for Less, 0 for Equal, 1 for Greater", () => {
	// Given: the three ordering states

	// When: converting to numbers

	// Then: correct numeric values are returned
	assertEquals(toNumber(Less()), -1);
	assertEquals(toNumber(Equal()), 0);
	assertEquals(toNumber(Greater()), 1);
});
