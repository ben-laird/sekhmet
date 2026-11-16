import {
	assertEquals,
	assertInstanceOf,
	assertStrictEquals,
	unreachable,
} from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import * as coreMini from "@/src/core/mini/mod.ts";
import { Option } from "@/src/option/main/mod.ts";
import { Result } from "@/src/result/main/mod.ts";
import * as mini from "../mini/mod.ts";
import { Active, Inactive, Latch } from "./mod.ts";

Deno.test("Latch methods chain on main constructors", () => {
	// Given: a main Active latch
	const latch = Active<number, string>(2);

	// When: chaining transformations
	const value = latch
		.map((n) => n * 3)
		.mapInactive((reason) => reason.length)
		.unwrapOr(0);

	// Then: every step ran
	assertEquals(value, 6);
	assertEquals(Inactive<number, string>("off").unwrapInactive(), "off");
});

Deno.test("main Latch is an instance of mini Latch and mini Enum", () => {
	// Given: a main Active latch
	const latch = Active(1);

	// When: checking it against the mini classes
	const classes = [
		latch instanceof Latch,
		latch instanceof mini.Latch,
		latch instanceof coreMini.Enum,
	];

	// Then: it is all of them, so mini functions accept it
	assertEquals(classes, [true, true, true]);
	assertEquals(mini.unwrap(latch), 1);
});

Deno.test("Latch mutations return the same main instance", () => {
	// Given: a main Active latch
	const latch = Active<number, string>(1);

	// When: deactivating it through a method
	const returned = latch.deactivate("stopped");

	// Then: the receiver itself changed and came back
	assertStrictEquals(returned, latch);
	assertEquals(latch.isInactive(), true);
	assertEquals(latch.unwrapInactive(), "stopped");
});

Deno.test("Latch conversions return main Options and Results", () => {
	// Given: a main Active latch
	const latch = Active<number, string>(5);

	// When: converting it
	const active = latch.active();
	const result = latch.toResult();

	// Then: the conversions are main types that chain
	assertInstanceOf(active, Option);
	assertInstanceOf(result, Result);
	assertEquals(active.map((n) => n + 1).unwrap(), 6);
	assertEquals(result.map((n) => n * 2).unwrap(), 10);
});

Deno.test("a main view of a mini Latch shares its state", () => {
	// Given: a mini Inactive latch returned through a main method
	const miniLatch = mini.Inactive<number, string>("off");
	const view = Active<number, string>(1).and(miniLatch);

	// When: activating the main view
	view.activate(9);

	// Then: the mini source is Active too
	assertInstanceOf(view, Latch);
	assertEquals(mini.unwrap(miniLatch), 9);
});

Deno.test("main isActive() narrows to Active and to a main Latch<A, never>", async (t) => {
	await t.step(
		"the guarded latch matches on Active alone and keeps its methods",
		() => {
			// Given: a main Latch typed as either variant
			const latch: Latch<number, string> = Active(42);

			// When: guarding it with isActive()
			if (latch.isActive()) {
				// Then: only the Active arm is required, the payload is a number,
				// and it is a main Latch with any inactive type
				const value = coreMini.match(latch)({ Active: (n) => n });
				assertType<IsExact<typeof value, number>>(true);
				const other: Latch<number, boolean> = latch;
				assertEquals(other.map((n) => n + 1).unwrapOr(0), 43);
			} else {
				unreachable();
			}
		},
	);

	await t.step("an unguarded latch needs the Inactive arm too", () => {
		// Given: a main Latch typed as either variant
		const latch: Latch<number, string> = Active(42);

		// When: matching it with only an Active arm
		// @ts-expect-error: the Inactive arm is missing
		const value = coreMini.match(latch)({ Active: (n: number) => n });

		// Then: the match is rejected at compile time
		assertEquals(value, 42);
	});

	await t.step("the else-branch is not narrowed", () => {
		// Given: a main Latch typed as either variant
		const latch: Latch<number, string> = Inactive("paused");

		// When: the guard fails
		if (latch.isActive()) {
			unreachable();
		} else {
			// Then: the latch keeps its declared type
			assertType<IsExact<typeof latch, Latch<number, string>>>(true);
		}
	});
});

Deno.test("main isActiveAnd() narrows to Active and a main Latch<B, never>", async (t) => {
	await t.step("a type-guard predicate narrows the active value", () => {
		// Given: a main Latch whose active value may be a string or a number
		const latch: Latch<string | number, boolean> = Active(42);

		// When: guarding it with a guard for numbers
		if (latch.isActiveAnd((v): v is number => typeof v === "number")) {
			// Then: only the Active arm is required, and it is a main Latch<number, never>
			const value = coreMini.match(latch)({ Active: (n) => n });
			assertType<IsExact<typeof value, number>>(true);
			const narrowed: Latch<number, string> = latch;
			assertEquals(narrowed.map((n) => n + 1).unwrapOr(0), 43);
		} else {
			unreachable();
		}
	});

	await t.step("the else-branch is not narrowed", () => {
		// Given: a main Latch holding a string
		const latch: Latch<string | number, boolean> = Active("on");

		// When: the numeric guard fails
		if (latch.isActiveAnd((v): v is number => typeof v === "number")) {
			unreachable();
		} else {
			// Then: the latch keeps its declared type
			assertType<IsExact<typeof latch, Latch<string | number, boolean>>>(true);
		}
	});
});

Deno.test("main isInactive() narrows to Inactive and to a main Latch<never, I>", async (t) => {
	await t.step(
		"the guarded latch matches on Inactive alone and keeps its methods",
		() => {
			// Given: a main Latch typed as either variant
			const latch: Latch<number, string> = Inactive("paused");

			// When: guarding it with isInactive()
			if (latch.isInactive()) {
				// Then: only the Inactive arm is required, the payload is a string,
				// and it is a main Latch with any active type
				const value = coreMini.match(latch)({ Inactive: (s) => s });
				assertType<IsExact<typeof value, string>>(true);
				const other: Latch<boolean, string> = latch;
				assertEquals(other.mapInactive((s) => s.length).isInactive(), true);
			} else {
				unreachable();
			}
		},
	);

	await t.step("an unguarded latch needs the Active arm too", () => {
		// Given: a main Latch typed as either variant
		const latch: Latch<number, string> = Inactive("paused");

		// When: matching it with only an Inactive arm
		// @ts-expect-error: the Active arm is missing
		const value = coreMini.match(latch)({ Inactive: (s: string) => s.length });

		// Then: the match is rejected at compile time
		assertEquals(value, 6);
	});

	await t.step("the else-branch is not narrowed", () => {
		// Given: a main Latch typed as either variant
		const latch: Latch<number, string> = Active(42);

		// When: the guard fails
		if (latch.isInactive()) {
			unreachable();
		} else {
			// Then: the latch keeps its declared type
			assertType<IsExact<typeof latch, Latch<number, string>>>(true);
		}
	});
});

Deno.test("main isInactiveAnd() narrows to Inactive and a main Latch<never, J>", async (t) => {
	await t.step("a type-guard predicate narrows the inactive value", () => {
		// Given: a main Latch whose inactive value may be a string or a number
		const latch: Latch<boolean, string | number> = Inactive("paused");

		// When: guarding it with a guard for strings
		if (latch.isInactiveAnd((v): v is string => typeof v === "string")) {
			// Then: only the Inactive arm is required, and it is a main Latch<never, string>
			const value = coreMini.match(latch)({ Inactive: (s) => s });
			assertType<IsExact<typeof value, string>>(true);
			const narrowed: Latch<number, string> = latch;
			assertEquals(narrowed.mapInactive((s) => s.length).isInactive(), true);
		} else {
			unreachable();
		}
	});

	await t.step("the else-branch is not narrowed", () => {
		// Given: a main Latch holding a number
		const latch: Latch<boolean, string | number> = Inactive(7);

		// When: the string guard fails
		if (latch.isInactiveAnd((v): v is string => typeof v === "string")) {
			unreachable();
		} else {
			// Then: the latch keeps its declared type
			assertType<IsExact<typeof latch, Latch<boolean, string | number>>>(true);
		}
	});
});
