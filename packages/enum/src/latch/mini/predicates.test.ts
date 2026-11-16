import { assert, assertEquals, assertFalse, unreachable } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import { match, union } from "@/src/core/mini/exit.ts";
import { Active, Inactive, type Latch } from "@/src/latch/mini/core.ts";
import * as TestSubject from "@/src/latch/mini/predicates.ts";

Deno.test("isActive() and isInactive() are complementary", async (t) => {
	const cases: [string, Latch<number, string>, boolean][] = [
		["Active", Active(1), true],
		["Inactive", Inactive("off"), false],
	];

	for (const [label, latch, expectActive] of cases) {
		await t.step(label, () => {
			// Given: a latch of a known variant
			// When: checking both predicates
			const active = TestSubject.isActive(latch);
			const inactive = TestSubject.isInactive(latch);

			// Then: exactly one holds
			assertEquals(active, expectActive);
			assertEquals(inactive, !expectActive);
		});
	}
});

Deno.test("isActiveAnd() requires Active and a passing predicate", async (t) => {
	await t.step("Active and passes", () => {
		// Given: Active(10)
		// When: checking with a passing predicate
		const subject = TestSubject.isActiveAnd(Active(10), (n) => n > 5);

		// Then: true
		assert(subject);
	});

	await t.step("Active and fails", () => {
		// Given: Active(1)
		// When: checking with a failing predicate
		const subject = TestSubject.isActiveAnd(Active(1), (n) => n > 5);

		// Then: false
		assertFalse(subject);
	});

	await t.step("Inactive never calls the predicate", () => {
		// Given: an Inactive latch and a tracking predicate
		const latch: Latch<number, string> = Inactive("off");
		let called = false;

		// When: checking it
		const subject = TestSubject.isActiveAnd(latch, () => {
			called = true;
			return true;
		});

		// Then: false without consulting the predicate
		assertFalse(subject);
		assertFalse(called);
	});
});

Deno.test("isInactiveAnd() requires Inactive and a passing predicate", async (t) => {
	await t.step("Inactive and passes", () => {
		// Given: Inactive("timeout")
		// When: checking with a passing predicate
		const subject = TestSubject.isInactiveAnd(
			Inactive("timeout"),
			(s) => s === "timeout",
		);

		// Then: true
		assert(subject);
	});

	await t.step("Inactive and fails", () => {
		// Given: Inactive("other")
		// When: checking with the same predicate
		const subject = TestSubject.isInactiveAnd(
			Inactive("other"),
			(s) => s === "timeout",
		);

		// Then: false
		assertFalse(subject);
	});

	await t.step("Active never calls the predicate", () => {
		// Given: an Active latch and a tracking predicate
		const latch: Latch<number, string> = Active(1);
		let called = false;

		// When: checking it
		const subject = TestSubject.isInactiveAnd(latch, () => {
			called = true;
			return true;
		});

		// Then: false without consulting the predicate
		assertFalse(subject);
		assertFalse(called);
	});
});

Deno.test("isActive() narrows to the Active variant and to Latch<A, never>", async (t) => {
	await t.step("a match after the guard needs only the Active arm", () => {
		// Given: a Latch typed as either variant
		const latch: Latch<number, string> = Active(42);

		// When: guarding it with isActive()
		if (TestSubject.isActive(latch)) {
			// Then: only the Active arm is required, and the payload is exactly A
			const value = union(latch);
			assertType<IsExact<typeof value, number>>(true);
			assertEquals(match(latch)({ Active: (n) => n + 1 }), 43);
		} else {
			unreachable();
		}
	});

	await t.step("an unguarded match needs the Inactive arm too", () => {
		// Given: a Latch typed as either variant
		const latch: Latch<number, string> = Active(42);

		// When: matching it with only an Active arm
		// @ts-expect-error: the Inactive arm is missing
		const value = match(latch)({ Active: (n: number) => n });

		// Then: the match is rejected at compile time
		assertEquals(value, 42);
	});

	await t.step("the guarded latch fits a Latch with any inactive type", () => {
		// Given: a Latch typed as either variant
		const latch: Latch<number, string> = Active(42);

		// When: guarding it with isActive()
		if (TestSubject.isActive(latch)) {
			// Then: it is assignable to a Latch with an unrelated inactive type
			const other: Latch<number, boolean> = latch;
			assertEquals(other, Active(42));
		} else {
			unreachable();
		}
	});

	await t.step("the else-branch is not narrowed", () => {
		// Given: a Latch typed as either variant
		const latch: Latch<number, string> = Inactive("paused");

		// When: the guard fails
		if (TestSubject.isActive(latch)) {
			unreachable();
		} else {
			// Then: the latch keeps its declared type
			assertType<IsExact<typeof latch, Latch<number, string>>>(true);
		}
	});
});

Deno.test("isActiveAnd() narrows to Active and the value to the guarded type", async (t) => {
	await t.step("a type-guard predicate narrows the active value", () => {
		// Given: a Latch whose active value may be a string or a number
		const latch: Latch<string | number, boolean> = Active(42);

		// When: guarding it with a guard for numbers
		if (
			TestSubject.isActiveAnd(latch, (v): v is number => typeof v === "number")
		) {
			// Then: only the Active arm is required, and the value is a number
			const value = union(latch);
			assertType<IsExact<typeof value, number>>(true);
			assertEquals(match(latch)({ Active: (n) => n + 1 }), 43);
		} else {
			unreachable();
		}
	});

	await t.step("a boolean predicate keeps the active value type", () => {
		// Given: a Latch whose active value may be a string or a number
		const latch: Latch<string | number, boolean> = Active(42);

		// When: guarding it with a boolean predicate
		if (TestSubject.isActiveAnd(latch, (v) => v !== "")) {
			// Then: the value type is unchanged
			const value = union(latch);
			assertType<IsExact<typeof value, string | number>>(true);
		} else {
			unreachable();
		}
	});

	await t.step("an unguarded match needs the Inactive arm too", () => {
		// Given: a Latch typed as either variant
		const latch: Latch<string | number, boolean> = Active(42);

		// When: matching it with only an Active arm
		// @ts-expect-error: the Inactive arm is missing
		const value = match(latch)({ Active: () => 0 });

		// Then: the match is rejected at compile time
		assertEquals(value, 0);
	});

	await t.step("the guarded latch is a Latch<B, never>", () => {
		// Given: a Latch whose active value may be a string or a number
		const latch: Latch<string | number, boolean> = Active(42);

		// When: guarding it with a guard for numbers
		if (
			TestSubject.isActiveAnd(latch, (v): v is number => typeof v === "number")
		) {
			// Then: it fits a Latch of the guarded value and any inactive type
			const narrowed: Latch<number, string> = latch;
			assertEquals(narrowed, Active(42));
		} else {
			unreachable();
		}
	});

	await t.step("the else-branch is not narrowed", () => {
		// Given: a Latch holding a string
		const latch: Latch<string | number, boolean> = Active("on");

		// When: the numeric guard fails
		if (
			TestSubject.isActiveAnd(latch, (v): v is number => typeof v === "number")
		) {
			unreachable();
		} else {
			// Then: the latch keeps its declared type
			assertType<IsExact<typeof latch, Latch<string | number, boolean>>>(true);
		}
	});
});

Deno.test("isInactive() narrows to the Inactive variant and to Latch<never, I>", async (t) => {
	await t.step("a match after the guard needs only the Inactive arm", () => {
		// Given: a Latch typed as either variant
		const latch: Latch<number, string> = Inactive("paused");

		// When: guarding it with isInactive()
		if (TestSubject.isInactive(latch)) {
			// Then: only the Inactive arm is required, and the payload is exactly I
			const value = union(latch);
			assertType<IsExact<typeof value, string>>(true);
			assertEquals(match(latch)({ Inactive: (s) => s.length }), 6);
		} else {
			unreachable();
		}
	});

	await t.step("an unguarded match needs the Active arm too", () => {
		// Given: a Latch typed as either variant
		const latch: Latch<number, string> = Inactive("paused");

		// When: matching it with only an Inactive arm
		// @ts-expect-error: the Active arm is missing
		const value = match(latch)({ Inactive: (s: string) => s.length });

		// Then: the match is rejected at compile time
		assertEquals(value, 6);
	});

	await t.step("the guarded latch fits a Latch with any active type", () => {
		// Given: a Latch typed as either variant
		const latch: Latch<number, string> = Inactive("paused");

		// When: guarding it with isInactive()
		if (TestSubject.isInactive(latch)) {
			// Then: it is assignable to a Latch with an unrelated active type
			const other: Latch<boolean, string> = latch;
			assertEquals(other, Inactive("paused"));
		} else {
			unreachable();
		}
	});

	await t.step("the else-branch is not narrowed", () => {
		// Given: a Latch typed as either variant
		const latch: Latch<number, string> = Active(42);

		// When: the guard fails
		if (TestSubject.isInactive(latch)) {
			unreachable();
		} else {
			// Then: the latch keeps its declared type
			assertType<IsExact<typeof latch, Latch<number, string>>>(true);
		}
	});
});

Deno.test("isInactiveAnd() narrows to Inactive and the value to the guarded type", async (t) => {
	await t.step("a type-guard predicate narrows the inactive value", () => {
		// Given: a Latch whose inactive value may be a string or a number
		const latch: Latch<boolean, string | number> = Inactive("paused");

		// When: guarding it with a guard for strings
		if (
			TestSubject.isInactiveAnd(
				latch,
				(v): v is string => typeof v === "string",
			)
		) {
			// Then: only the Inactive arm is required, and the value is a string
			const value = union(latch);
			assertType<IsExact<typeof value, string>>(true);
			assertEquals(match(latch)({ Inactive: (s) => s.length }), 6);
		} else {
			unreachable();
		}
	});

	await t.step("a boolean predicate keeps the inactive value type", () => {
		// Given: a Latch whose inactive value may be a string or a number
		const latch: Latch<boolean, string | number> = Inactive("paused");

		// When: guarding it with a boolean predicate
		if (TestSubject.isInactiveAnd(latch, (v) => v !== "")) {
			// Then: the value type is unchanged
			const value = union(latch);
			assertType<IsExact<typeof value, string | number>>(true);
		} else {
			unreachable();
		}
	});

	await t.step("an unguarded match needs the Active arm too", () => {
		// Given: a Latch typed as either variant
		const latch: Latch<boolean, string | number> = Inactive("paused");

		// When: matching it with only an Inactive arm
		// @ts-expect-error: the Active arm is missing
		const value = match(latch)({ Inactive: () => 0 });

		// Then: the match is rejected at compile time
		assertEquals(value, 0);
	});

	await t.step("the guarded latch is a Latch<never, J>", () => {
		// Given: a Latch whose inactive value may be a string or a number
		const latch: Latch<boolean, string | number> = Inactive("paused");

		// When: guarding it with a guard for strings
		if (
			TestSubject.isInactiveAnd(
				latch,
				(v): v is string => typeof v === "string",
			)
		) {
			// Then: it fits a Latch of any active type and the guarded value
			const narrowed: Latch<number, string> = latch;
			assertEquals(narrowed, Inactive("paused"));
		} else {
			unreachable();
		}
	});

	await t.step("the else-branch is not narrowed", () => {
		// Given: a Latch holding a number
		const latch: Latch<boolean, string | number> = Inactive(7);

		// When: the string guard fails
		if (
			TestSubject.isInactiveAnd(
				latch,
				(v): v is string => typeof v === "string",
			)
		) {
			unreachable();
		} else {
			// Then: the latch keeps its declared type
			assertType<IsExact<typeof latch, Latch<boolean, string | number>>>(true);
		}
	});
});
