import { assertEquals, assertThrows } from "@std/assert";
import { Active, Inactive, type Latch } from "@/src/latch/mini/core.ts";
import * as TestSubject from "@/src/latch/mini/unwrap.ts";

Deno.test("expect() returns the Active value", () => {
	// Given: Active(1)
	// When: expecting it
	const subject = TestSubject.expect(Active(1), "must be active");

	// Then: the value
	assertEquals(subject, 1);
});

Deno.test("expect() throws the custom message on Inactive, with the latch as cause", () => {
	// Given: an Inactive latch
	const latch: Latch<number, string> = Inactive("off");

	// When: expecting it
	const thrown = assertThrows(
		() => TestSubject.expect(latch, "must be active"),
		Error,
		"must be active",
	);

	// Then: the latch is attached as the cause
	assertEquals(thrown.cause, latch);
});

Deno.test("unwrap() returns Active and throws a fixed message on Inactive", async (t) => {
	await t.step("Active", () => {
		// Given: Active("v")
		// When: unwrapping
		const subject = TestSubject.unwrap(Active("v"));

		// Then: the value
		assertEquals(subject, "v");
	});

	await t.step("Inactive", () => {
		// Given: an Inactive latch
		const latch: Latch<number, string> = Inactive("off");

		// When: unwrapping
		// Then: it throws the default message
		assertThrows(
			() => TestSubject.unwrap(latch),
			Error,
			"Latch unwrap failed!",
		);
	});
});

Deno.test("expectInactive() returns the Inactive value and throws on Active", async (t) => {
	await t.step("Inactive", () => {
		// Given: Inactive("off")
		// When: expecting the inactive value
		const subject = TestSubject.expectInactive(Inactive("off"), "must be off");

		// Then: the value
		assertEquals(subject, "off");
	});

	await t.step("Active", () => {
		// Given: an Active latch
		const latch: Latch<number, string> = Active(1);

		// When: expecting the inactive value
		// Then: it throws the custom message
		assertThrows(
			() => TestSubject.expectInactive(latch, "must be off"),
			Error,
			"must be off",
		);
	});
});

Deno.test("unwrapInactive() returns Inactive and throws a fixed message on Active", async (t) => {
	await t.step("Inactive", () => {
		// Given: Inactive(5)
		// When: unwrapping the inactive value
		const subject = TestSubject.unwrapInactive(Inactive(5));

		// Then: the value
		assertEquals(subject, 5);
	});

	await t.step("Active", () => {
		// Given: an Active latch
		const latch: Latch<number, string> = Active(1);

		// When: unwrapping the inactive value
		// Then: it throws the default message
		assertThrows(
			() => TestSubject.unwrapInactive(latch),
			Error,
			"Latch unwrap failed!",
		);
	});
});
