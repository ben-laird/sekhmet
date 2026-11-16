import { assertEquals, unreachable } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import { match } from "@/src/core/mini/exit.ts";
import { Equal, Greater, Less, type Ordering } from "./core.ts";
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

Deno.test("isLt() narrows to Less and keeps the Ordering type", async (t) => {
	await t.step("a match after the guard needs only the Less arm", () => {
		// Given: an Ordering typed as any variant
		const ordering: Ordering = Less();

		// When: guarding it with isLt()
		if (isLt(ordering)) {
			// Then: only the Less arm is required
			const value = match(ordering)({ Less: () => "lt" });
			assertEquals(value, "lt");
		} else {
			unreachable();
		}
	});

	await t.step("an unguarded match needs every arm", () => {
		// Given: an Ordering typed as any variant
		const ordering: Ordering = Less();

		// When: matching it with only the Less arm
		// @ts-expect-error: the Equal and Greater arms are missing
		const value = match(ordering)({ Less: () => "lt" });

		// Then: the match is rejected at compile time
		assertEquals(value, "lt");
	});

	await t.step("the guarded value is still an Ordering", () => {
		// Given: an Ordering typed as any variant
		const ordering: Ordering = Less();

		// When: guarding it with isLt()
		if (isLt(ordering)) {
			// Then: it is still assignable to Ordering
			const same: Ordering = ordering;
			assertEquals(same, Less());
		} else {
			unreachable();
		}
	});

	await t.step("the else-branch is not narrowed", () => {
		// Given: an Ordering typed as any variant
		const ordering: Ordering = Greater();

		// When: the guard fails
		if (isLt(ordering)) {
			unreachable();
		} else {
			// Then: the ordering keeps its declared type
			assertType<IsExact<typeof ordering, Ordering>>(true);
		}
	});
});

Deno.test("isEq() narrows to Equal and keeps the Ordering type", async (t) => {
	await t.step("a match after the guard needs only the Equal arm", () => {
		// Given: an Ordering typed as any variant
		const ordering: Ordering = Equal();

		// When: guarding it with isEq()
		if (isEq(ordering)) {
			// Then: only the Equal arm is required
			const value = match(ordering)({ Equal: () => "eq" });
			assertEquals(value, "eq");
		} else {
			unreachable();
		}
	});

	await t.step("an unguarded match needs every arm", () => {
		// Given: an Ordering typed as any variant
		const ordering: Ordering = Equal();

		// When: matching it with only the Equal arm
		// @ts-expect-error: the Less and Greater arms are missing
		const value = match(ordering)({ Equal: () => "eq" });

		// Then: the match is rejected at compile time
		assertEquals(value, "eq");
	});

	await t.step("the guarded value is still an Ordering", () => {
		// Given: an Ordering typed as any variant
		const ordering: Ordering = Equal();

		// When: guarding it with isEq()
		if (isEq(ordering)) {
			// Then: it is still assignable to Ordering
			const same: Ordering = ordering;
			assertEquals(same, Equal());
		} else {
			unreachable();
		}
	});

	await t.step("the else-branch is not narrowed", () => {
		// Given: an Ordering typed as any variant
		const ordering: Ordering = Less();

		// When: the guard fails
		if (isEq(ordering)) {
			unreachable();
		} else {
			// Then: the ordering keeps its declared type
			assertType<IsExact<typeof ordering, Ordering>>(true);
		}
	});
});

Deno.test("isGt() narrows to Greater and keeps the Ordering type", async (t) => {
	await t.step("a match after the guard needs only the Greater arm", () => {
		// Given: an Ordering typed as any variant
		const ordering: Ordering = Greater();

		// When: guarding it with isGt()
		if (isGt(ordering)) {
			// Then: only the Greater arm is required
			const value = match(ordering)({ Greater: () => "gt" });
			assertEquals(value, "gt");
		} else {
			unreachable();
		}
	});

	await t.step("an unguarded match needs every arm", () => {
		// Given: an Ordering typed as any variant
		const ordering: Ordering = Greater();

		// When: matching it with only the Greater arm
		// @ts-expect-error: the Less and Equal arms are missing
		const value = match(ordering)({ Greater: () => "gt" });

		// Then: the match is rejected at compile time
		assertEquals(value, "gt");
	});

	await t.step("the guarded value is still an Ordering", () => {
		// Given: an Ordering typed as any variant
		const ordering: Ordering = Greater();

		// When: guarding it with isGt()
		if (isGt(ordering)) {
			// Then: it is still assignable to Ordering
			const same: Ordering = ordering;
			assertEquals(same, Greater());
		} else {
			unreachable();
		}
	});

	await t.step("the else-branch is not narrowed", () => {
		// Given: an Ordering typed as any variant
		const ordering: Ordering = Equal();

		// When: the guard fails
		if (isGt(ordering)) {
			unreachable();
		} else {
			// Then: the ordering keeps its declared type
			assertType<IsExact<typeof ordering, Ordering>>(true);
		}
	});
});

Deno.test("isNe() narrows to Less or Greater and keeps the Ordering type", async (t) => {
	await t.step(
		"a match after the guard needs only the Less or Greater arms",
		() => {
			// Given: an Ordering typed as any variant
			const ordering: Ordering = Less();

			// When: guarding it with isNe()
			if (isNe(ordering)) {
				// Then: only the Less or Greater arms are required
				const value = match(ordering)({
					Less: () => "lt",
					Greater: () => "gt",
				});
				assertEquals(value, "lt");
			} else {
				unreachable();
			}
		},
	);

	await t.step("an unguarded match needs every arm", () => {
		// Given: an Ordering typed as any variant
		const ordering: Ordering = Less();

		// When: matching it with only the Less or Greater arms
		// @ts-expect-error: the Equal arm is missing
		const value = match(ordering)({ Less: () => "lt", Greater: () => "gt" });

		// Then: the match is rejected at compile time
		assertEquals(value, "lt");
	});

	await t.step("the guarded value is still an Ordering", () => {
		// Given: an Ordering typed as any variant
		const ordering: Ordering = Less();

		// When: guarding it with isNe()
		if (isNe(ordering)) {
			// Then: it is still assignable to Ordering
			const same: Ordering = ordering;
			assertEquals(same, Less());
		} else {
			unreachable();
		}
	});

	await t.step("the else-branch is not narrowed", () => {
		// Given: an Ordering typed as any variant
		const ordering: Ordering = Equal();

		// When: the guard fails
		if (isNe(ordering)) {
			unreachable();
		} else {
			// Then: the ordering keeps its declared type
			assertType<IsExact<typeof ordering, Ordering>>(true);
		}
	});
});

Deno.test("isLe() narrows to Less or Equal and keeps the Ordering type", async (t) => {
	await t.step(
		"a match after the guard needs only the Less or Equal arms",
		() => {
			// Given: an Ordering typed as any variant
			const ordering: Ordering = Equal();

			// When: guarding it with isLe()
			if (isLe(ordering)) {
				// Then: only the Less or Equal arms are required
				const value = match(ordering)({ Less: () => "lt", Equal: () => "eq" });
				assertEquals(value, "eq");
			} else {
				unreachable();
			}
		},
	);

	await t.step("an unguarded match needs every arm", () => {
		// Given: an Ordering typed as any variant
		const ordering: Ordering = Equal();

		// When: matching it with only the Less or Equal arms
		// @ts-expect-error: the Greater arm is missing
		const value = match(ordering)({ Less: () => "lt", Equal: () => "eq" });

		// Then: the match is rejected at compile time
		assertEquals(value, "eq");
	});

	await t.step("the guarded value is still an Ordering", () => {
		// Given: an Ordering typed as any variant
		const ordering: Ordering = Equal();

		// When: guarding it with isLe()
		if (isLe(ordering)) {
			// Then: it is still assignable to Ordering
			const same: Ordering = ordering;
			assertEquals(same, Equal());
		} else {
			unreachable();
		}
	});

	await t.step("the else-branch is not narrowed", () => {
		// Given: an Ordering typed as any variant
		const ordering: Ordering = Greater();

		// When: the guard fails
		if (isLe(ordering)) {
			unreachable();
		} else {
			// Then: the ordering keeps its declared type
			assertType<IsExact<typeof ordering, Ordering>>(true);
		}
	});
});

Deno.test("isGe() narrows to Greater or Equal and keeps the Ordering type", async (t) => {
	await t.step(
		"a match after the guard needs only the Greater or Equal arms",
		() => {
			// Given: an Ordering typed as any variant
			const ordering: Ordering = Equal();

			// When: guarding it with isGe()
			if (isGe(ordering)) {
				// Then: only the Greater or Equal arms are required
				const value = match(ordering)({
					Equal: () => "eq",
					Greater: () => "gt",
				});
				assertEquals(value, "eq");
			} else {
				unreachable();
			}
		},
	);

	await t.step("an unguarded match needs every arm", () => {
		// Given: an Ordering typed as any variant
		const ordering: Ordering = Equal();

		// When: matching it with only the Greater or Equal arms
		// @ts-expect-error: the Less arm is missing
		const value = match(ordering)({ Equal: () => "eq", Greater: () => "gt" });

		// Then: the match is rejected at compile time
		assertEquals(value, "eq");
	});

	await t.step("the guarded value is still an Ordering", () => {
		// Given: an Ordering typed as any variant
		const ordering: Ordering = Equal();

		// When: guarding it with isGe()
		if (isGe(ordering)) {
			// Then: it is still assignable to Ordering
			const same: Ordering = ordering;
			assertEquals(same, Equal());
		} else {
			unreachable();
		}
	});

	await t.step("the else-branch is not narrowed", () => {
		// Given: an Ordering typed as any variant
		const ordering: Ordering = Less();

		// When: the guard fails
		if (isGe(ordering)) {
			unreachable();
		} else {
			// Then: the ordering keeps its declared type
			assertType<IsExact<typeof ordering, Ordering>>(true);
		}
	});
});
