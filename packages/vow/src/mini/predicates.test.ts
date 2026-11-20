import { match, union } from "@sekhmet/enum/core/mini";
import { assert, assertEquals, assertFalse } from "@std/assert";
import { resolved, vowWithResolver } from "@/src/mini/impl.ts";
import { isPending, isResolved } from "@/src/mini/predicates.ts";

Deno.test("isResolved() narrows a resolved vow to its value", () => {
	// Given: a resolved vow
	const vow = resolved("ready");

	// When: testing it
	const resolvedNow = isResolved(vow);

	// Then: it is resolved, and the narrowed vow's value reads as the value type
	assert(resolvedNow);
	if (isResolved(vow)) {
		const read: string = union(vow);
		assertEquals(read, "ready");
	}
});

Deno.test("isResolved() and isPending() track a deferred vow", () => {
	// Given: a deferred vow
	const { vow, resolve } = vowWithResolver<number>();

	// When: testing it before and after resolving
	const before = [isPending(vow), isResolved(vow)];
	resolve(1);
	const after = [isPending(vow), isResolved(vow)];

	// Then: the two are complementary, and flip once on resolution
	assertEquals(before, [true, false]);
	assertEquals(after, [false, true]);
});

Deno.test("isPending() narrows to the Pending variant alone", () => {
	// Given: a pending vow
	const { vow } = vowWithResolver<number>();

	// When: matching it after narrowing with isPending
	const state = isPending(vow)
		? match(vow)({ Pending: () => "waiting" })
		: "resolved";

	// Then: no Resolved arm is needed, and the vow is pending
	assertEquals(state, "waiting");
	assertFalse(isResolved(vow));
});
