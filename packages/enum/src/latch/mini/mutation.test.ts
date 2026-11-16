import { assertEquals, assertFalse, assertStrictEquals } from "@std/assert";
import { Active, Inactive, type Latch } from "@/src/latch/mini/core.ts";
import * as TestSubject from "@/src/latch/mini/mutation.ts";
import { None, type Option, Some } from "@/src/option/mini/core.ts";

const active = (): Latch<number, string> => Active(1);
const inactive = (): Latch<number, string> => Inactive("off");

Deno.test("deactivate() turns Active into Inactive in place", async (t) => {
	await t.step("Active", () => {
		// Given: an Active latch
		const latch = active();

		// When: deactivating it
		const subject = TestSubject.deactivate(latch, "stopped");

		// Then: the same latch is now Inactive with the new value
		assertStrictEquals(subject, latch);
		assertEquals(latch, Inactive("stopped"));
	});

	await t.step("Inactive is left untouched", () => {
		// Given: an Inactive latch
		const latch = inactive();

		// When: deactivating it
		const subject = TestSubject.deactivate(latch, "stopped");

		// Then: its existing inactive value is kept
		assertStrictEquals(subject, latch);
		assertEquals(latch, Inactive("off"));
	});
});

Deno.test("deactivate() is idempotent", () => {
	// Given: an Active latch
	const latch = active();

	// When: deactivating twice with different values
	TestSubject.deactivate(latch, "first");
	TestSubject.deactivate(latch, "second");

	// Then: the first deactivation sticks
	assertEquals(latch, Inactive("first"));
});

Deno.test("deactivateWith() derives the inactive value from the active one", async (t) => {
	await t.step("Active", () => {
		// Given: Active(3)
		const latch: Latch<number, string> = Active(3);

		// When: deactivating with a derivation
		const subject = TestSubject.deactivateWith(latch, (n) => `was ${n}`);

		// Then: the latch is Inactive with the derived value
		assertStrictEquals(subject, latch);
		assertEquals(latch, Inactive("was 3"));
	});

	await t.step("Inactive never calls the derivation", () => {
		// Given: an Inactive latch and a tracking derivation
		const latch = inactive();
		let called = false;

		// When: deactivating with it
		TestSubject.deactivateWith(latch, () => {
			called = true;
			return "x";
		});

		// Then: nothing changes
		assertEquals(latch, Inactive("off"));
		assertFalse(called);
	});
});

Deno.test("deactivateIf() deactivates only on Some", async (t) => {
	const cases: [string, Option<string>, Latch<number, string>][] = [
		["Some", Some("stopped"), Inactive("stopped")],
		["None", None(), Active(1)],
	];

	for (const [label, option, expected] of cases) {
		await t.step(label, () => {
			// Given: an Active latch
			const latch = active();

			// When: conditionally deactivating
			const subject = TestSubject.deactivateIf(latch, option);

			// Then: it changes only for Some
			assertStrictEquals(subject, latch);
			assertEquals(latch, expected);
		});
	}
});

Deno.test("deactivateWhen() asks the active value whether to deactivate", async (t) => {
	const decide = (n: number): Option<string> =>
		n > 5 ? Some(`big ${n}`) : None();

	await t.step("decides Some", () => {
		// Given: Active(10)
		const latch: Latch<number, string> = Active(10);

		// When: deactivating when large
		TestSubject.deactivateWhen(latch, decide);

		// Then: it is Inactive
		assertEquals(latch, Inactive("big 10"));
	});

	await t.step("decides None", () => {
		// Given: Active(1)
		const latch: Latch<number, string> = Active(1);

		// When: deactivating when large
		TestSubject.deactivateWhen(latch, decide);

		// Then: it stays Active
		assertEquals(latch, Active(1));
	});

	await t.step("Inactive never consults the decision", () => {
		// Given: an Inactive latch and a tracking decision
		const latch = inactive();
		let called = false;

		// When: deactivating conditionally
		const subject = TestSubject.deactivateWhen(latch, () => {
			called = true;
			return Some("x");
		});

		// Then: nothing changes
		assertStrictEquals(subject, latch);
		assertEquals(latch, Inactive("off"));
		assertFalse(called);
	});
});

Deno.test("deactivateReplace() sets Inactive and returns a copy of the prior state", async (t) => {
	for (const [label, make] of [
		["from Active", active],
		["from Inactive", inactive],
	] as const) {
		await t.step(label, () => {
			// Given: a latch and a snapshot of its state
			const latch = make();
			const before = make();

			// When: replacing with an inactive value
			const previous = TestSubject.deactivateReplace(latch, "replaced");

			// Then: the latch is Inactive, and the returned copy is the old state
			assertEquals(latch, Inactive("replaced"));
			assertEquals(previous, before);
			assertFalse(previous === latch);
		});
	}
});

Deno.test("activate() turns Inactive into Active in place", async (t) => {
	await t.step("Inactive", () => {
		// Given: an Inactive latch
		const latch = inactive();

		// When: activating it
		const subject = TestSubject.activate(latch, 9);

		// Then: the same latch is now Active
		assertStrictEquals(subject, latch);
		assertEquals(latch, Active(9));
	});

	await t.step("Active is left untouched", () => {
		// Given: an Active latch
		const latch = active();

		// When: activating it
		TestSubject.activate(latch, 9);

		// Then: its existing active value is kept
		assertEquals(latch, Active(1));
	});
});

Deno.test("activate() then deactivate() round-trips the variant", () => {
	// Given: an Inactive latch
	const latch = inactive();

	// When: activating then deactivating with the original value
	TestSubject.activate(latch, 5);
	TestSubject.deactivate(latch, "off");

	// Then: it is back where it started
	assertEquals(latch, inactive());
});

Deno.test("activateWith() derives the active value from the inactive one", async (t) => {
	await t.step("Inactive", () => {
		// Given: Inactive("abc")
		const latch: Latch<number, string> = Inactive("abc");

		// When: activating with a derivation
		const subject = TestSubject.activateWith(latch, (s) => s.length);

		// Then: the latch is Active with the derived value
		assertStrictEquals(subject, latch);
		assertEquals(latch, Active(3));
	});

	await t.step("Active never calls the derivation", () => {
		// Given: an Active latch and a tracking derivation
		const latch = active();
		let called = false;

		// When: activating with it
		TestSubject.activateWith(latch, () => {
			called = true;
			return 0;
		});

		// Then: nothing changes
		assertEquals(latch, Active(1));
		assertFalse(called);
	});
});

Deno.test("activateIf() activates only on Some", async (t) => {
	const cases: [string, Option<number>, Latch<number, string>][] = [
		["Some", Some(7), Active(7)],
		["None", None(), Inactive("off")],
	];

	for (const [label, option, expected] of cases) {
		await t.step(label, () => {
			// Given: an Inactive latch
			const latch = inactive();

			// When: conditionally activating
			const subject = TestSubject.activateIf(latch, option);

			// Then: it changes only for Some
			assertStrictEquals(subject, latch);
			assertEquals(latch, expected);
		});
	}
});

Deno.test("activateWhen() asks the inactive value whether to activate", async (t) => {
	const decide = (s: string): Option<number> =>
		s === "ready" ? Some(1) : None();

	await t.step("decides Some", () => {
		// Given: Inactive("ready")
		const latch: Latch<number, string> = Inactive("ready");

		// When: activating when ready
		TestSubject.activateWhen(latch, decide);

		// Then: it is Active
		assertEquals(latch, Active(1));
	});

	await t.step("decides None", () => {
		// Given: Inactive("waiting")
		const latch: Latch<number, string> = Inactive("waiting");

		// When: activating when ready
		TestSubject.activateWhen(latch, decide);

		// Then: it stays Inactive
		assertEquals(latch, Inactive("waiting"));
	});

	await t.step("Active never consults the decision", () => {
		// Given: an Active latch and a tracking decision
		const latch = active();
		let called = false;

		// When: activating conditionally
		const subject = TestSubject.activateWhen(latch, () => {
			called = true;
			return Some(2);
		});

		// Then: nothing changes
		assertStrictEquals(subject, latch);
		assertEquals(latch, Active(1));
		assertFalse(called);
	});
});

Deno.test("activateReplace() sets Active and returns a copy of the prior state", async (t) => {
	for (const [label, make] of [
		["from Active", active],
		["from Inactive", inactive],
	] as const) {
		await t.step(label, () => {
			// Given: a latch and a snapshot of its state
			const latch = make();
			const before = make();

			// When: replacing with an active value
			const previous = TestSubject.activateReplace(latch, 42);

			// Then: the latch is Active, and the returned copy is the old state
			assertEquals(latch, Active(42));
			assertEquals(previous, before);
			assertFalse(previous === latch);
		});
	}
});
