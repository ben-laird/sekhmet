import { assertEquals, assertInstanceOf, unreachable } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import * as coreMini from "@/src/core/mini/mod.ts";
import * as mini from "../mini/mod.ts";
import {
	compareNumbers,
	compareStrings,
	Equal,
	Greater,
	Less,
	Ordering,
} from "./mod.ts";

Deno.test("Ordering methods chain on main comparisons", () => {
	// Given: two comparisons, the first a tie
	const byAge = compareNumbers(30, 30);

	// When: breaking the tie with a second comparison and reversing it
	const ordering = byAge.andThen(compareStrings("b", "a")).reverse();

	// Then: the chain is a main Ordering with the expected sign
	assertInstanceOf(ordering, Ordering);
	assertEquals(ordering.isLt(), true);
	assertEquals(ordering.toNumber(), -1);
});

Deno.test("main Ordering is an instance of mini Ordering and mini Enum", () => {
	// Given: a main Equal
	const ordering = Equal();

	// When: checking it against the mini classes
	const classes = [
		ordering instanceof Ordering,
		ordering instanceof mini.Ordering,
		ordering instanceof coreMini.Enum,
	];

	// Then: it is all of them, so mini functions accept it
	assertEquals(classes, [true, true, true]);
	assertEquals(mini.isEq(ordering), true);
});

Deno.test("main isLt() narrows to Less and to a main Ordering", async (t) => {
	await t.step(
		"the guarded ordering matches on the Less arm alone and keeps its methods",
		() => {
			// Given: a main Ordering typed as any variant
			const ordering: Ordering = Less();

			// When: guarding it with isLt()
			if (ordering.isLt()) {
				// Then: only the Less arm is required, and its methods still chain
				const value = coreMini.match(ordering)({ Less: () => "lt" });
				assertEquals(value, "lt");
				const reversed: Ordering = ordering.reverse();
				assertEquals(reversed, Greater());
			} else {
				unreachable();
			}
		},
	);

	await t.step("an unguarded ordering needs every arm", () => {
		// Given: a main Ordering typed as any variant
		const ordering: Ordering = Less();

		// When: matching it with only the Less arm
		// @ts-expect-error: the Equal and Greater arms are missing
		const value = coreMini.match(ordering)({ Less: () => "lt" });

		// Then: the match is rejected at compile time
		assertEquals(value, "lt");
	});

	await t.step("the else-branch is not narrowed", () => {
		// Given: a main Ordering typed as any variant
		const ordering: Ordering = Greater();

		// When: the guard fails
		if (ordering.isLt()) {
			unreachable();
		} else {
			// Then: the ordering keeps its declared type
			assertType<IsExact<typeof ordering, Ordering>>(true);
		}
	});
});

Deno.test("main isEq() narrows to Equal and to a main Ordering", async (t) => {
	await t.step(
		"the guarded ordering matches on the Equal arm alone and keeps its methods",
		() => {
			// Given: a main Ordering typed as any variant
			const ordering: Ordering = Equal();

			// When: guarding it with isEq()
			if (ordering.isEq()) {
				// Then: only the Equal arm is required, and its methods still chain
				const value = coreMini.match(ordering)({ Equal: () => "eq" });
				assertEquals(value, "eq");
				const reversed: Ordering = ordering.reverse();
				assertEquals(reversed, Equal());
			} else {
				unreachable();
			}
		},
	);

	await t.step("an unguarded ordering needs every arm", () => {
		// Given: a main Ordering typed as any variant
		const ordering: Ordering = Equal();

		// When: matching it with only the Equal arm
		// @ts-expect-error: the Less and Greater arms are missing
		const value = coreMini.match(ordering)({ Equal: () => "eq" });

		// Then: the match is rejected at compile time
		assertEquals(value, "eq");
	});

	await t.step("the else-branch is not narrowed", () => {
		// Given: a main Ordering typed as any variant
		const ordering: Ordering = Less();

		// When: the guard fails
		if (ordering.isEq()) {
			unreachable();
		} else {
			// Then: the ordering keeps its declared type
			assertType<IsExact<typeof ordering, Ordering>>(true);
		}
	});
});

Deno.test("main isGt() narrows to Greater and to a main Ordering", async (t) => {
	await t.step(
		"the guarded ordering matches on the Greater arm alone and keeps its methods",
		() => {
			// Given: a main Ordering typed as any variant
			const ordering: Ordering = Greater();

			// When: guarding it with isGt()
			if (ordering.isGt()) {
				// Then: only the Greater arm is required, and its methods still chain
				const value = coreMini.match(ordering)({ Greater: () => "gt" });
				assertEquals(value, "gt");
				const reversed: Ordering = ordering.reverse();
				assertEquals(reversed, Less());
			} else {
				unreachable();
			}
		},
	);

	await t.step("an unguarded ordering needs every arm", () => {
		// Given: a main Ordering typed as any variant
		const ordering: Ordering = Greater();

		// When: matching it with only the Greater arm
		// @ts-expect-error: the Less and Equal arms are missing
		const value = coreMini.match(ordering)({ Greater: () => "gt" });

		// Then: the match is rejected at compile time
		assertEquals(value, "gt");
	});

	await t.step("the else-branch is not narrowed", () => {
		// Given: a main Ordering typed as any variant
		const ordering: Ordering = Equal();

		// When: the guard fails
		if (ordering.isGt()) {
			unreachable();
		} else {
			// Then: the ordering keeps its declared type
			assertType<IsExact<typeof ordering, Ordering>>(true);
		}
	});
});

Deno.test("main isNe() narrows to Less or Greater and to a main Ordering", async (t) => {
	await t.step(
		"the guarded ordering matches on the Less or Greater arms alone and keeps its methods",
		() => {
			// Given: a main Ordering typed as any variant
			const ordering: Ordering = Less();

			// When: guarding it with isNe()
			if (ordering.isNe()) {
				// Then: only the Less or Greater arms are required, and its methods still chain
				const value = coreMini.match(ordering)({
					Less: () => "lt",
					Greater: () => "gt",
				});
				assertEquals(value, "lt");
				const reversed: Ordering = ordering.reverse();
				assertEquals(reversed, Greater());
			} else {
				unreachable();
			}
		},
	);

	await t.step("an unguarded ordering needs every arm", () => {
		// Given: a main Ordering typed as any variant
		const ordering: Ordering = Less();

		// When: matching it with only the Less or Greater arms
		// @ts-expect-error: the Equal arm is missing
		const value = coreMini.match(ordering)({
			Less: () => "lt",
			Greater: () => "gt",
		});

		// Then: the match is rejected at compile time
		assertEquals(value, "lt");
	});

	await t.step("the else-branch is not narrowed", () => {
		// Given: a main Ordering typed as any variant
		const ordering: Ordering = Equal();

		// When: the guard fails
		if (ordering.isNe()) {
			unreachable();
		} else {
			// Then: the ordering keeps its declared type
			assertType<IsExact<typeof ordering, Ordering>>(true);
		}
	});
});

Deno.test("main isLe() narrows to Less or Equal and to a main Ordering", async (t) => {
	await t.step(
		"the guarded ordering matches on the Less or Equal arms alone and keeps its methods",
		() => {
			// Given: a main Ordering typed as any variant
			const ordering: Ordering = Equal();

			// When: guarding it with isLe()
			if (ordering.isLe()) {
				// Then: only the Less or Equal arms are required, and its methods still chain
				const value = coreMini.match(ordering)({
					Less: () => "lt",
					Equal: () => "eq",
				});
				assertEquals(value, "eq");
				const reversed: Ordering = ordering.reverse();
				assertEquals(reversed, Equal());
			} else {
				unreachable();
			}
		},
	);

	await t.step("an unguarded ordering needs every arm", () => {
		// Given: a main Ordering typed as any variant
		const ordering: Ordering = Equal();

		// When: matching it with only the Less or Equal arms
		// @ts-expect-error: the Greater arm is missing
		const value = coreMini.match(ordering)({
			Less: () => "lt",
			Equal: () => "eq",
		});

		// Then: the match is rejected at compile time
		assertEquals(value, "eq");
	});

	await t.step("the else-branch is not narrowed", () => {
		// Given: a main Ordering typed as any variant
		const ordering: Ordering = Greater();

		// When: the guard fails
		if (ordering.isLe()) {
			unreachable();
		} else {
			// Then: the ordering keeps its declared type
			assertType<IsExact<typeof ordering, Ordering>>(true);
		}
	});
});

Deno.test("main isGe() narrows to Greater or Equal and to a main Ordering", async (t) => {
	await t.step(
		"the guarded ordering matches on the Greater or Equal arms alone and keeps its methods",
		() => {
			// Given: a main Ordering typed as any variant
			const ordering: Ordering = Equal();

			// When: guarding it with isGe()
			if (ordering.isGe()) {
				// Then: only the Greater or Equal arms are required, and its methods still chain
				const value = coreMini.match(ordering)({
					Equal: () => "eq",
					Greater: () => "gt",
				});
				assertEquals(value, "eq");
				const reversed: Ordering = ordering.reverse();
				assertEquals(reversed, Equal());
			} else {
				unreachable();
			}
		},
	);

	await t.step("an unguarded ordering needs every arm", () => {
		// Given: a main Ordering typed as any variant
		const ordering: Ordering = Equal();

		// When: matching it with only the Greater or Equal arms
		// @ts-expect-error: the Less arm is missing
		const value = coreMini.match(ordering)({
			Equal: () => "eq",
			Greater: () => "gt",
		});

		// Then: the match is rejected at compile time
		assertEquals(value, "eq");
	});

	await t.step("the else-branch is not narrowed", () => {
		// Given: a main Ordering typed as any variant
		const ordering: Ordering = Less();

		// When: the guard fails
		if (ordering.isGe()) {
			unreachable();
		} else {
			// Then: the ordering keeps its declared type
			assertType<IsExact<typeof ordering, Ordering>>(true);
		}
	});
});
