import { assert, assertEquals, assertFalse } from "@std/assert";
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
