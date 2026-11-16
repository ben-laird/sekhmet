import {
	assertEquals,
	assertThrows,
	unreachable as assertUnreachable,
} from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import { Enum, type Split } from "./core.ts";
import * as TestSubject from "./isolate.ts";

// Given (dog-food code)
interface BirthdayGreeting {
	name: string;
	age: number;
}

type GreetingKinds = Split<{
	Formal: [name: string];
	Informal: [name: string];
	HappyBirthday: [greeting: BirthdayGreeting];
}>;

class Greeting extends Enum<GreetingKinds> {}

Deno.test("isolate() isolates a specific variant", async (t) => {
	// Given: a Formal greeting
	const greeting = new Greeting("Formal", "Cady");

	await t.step("Returns true and narrows when variant matches", () => {
		// When/Then: isolate() returns true and narrows when variant matches
		if (TestSubject.isolate(greeting, "Formal")) {
			type Isolated = Enum<[kind: "Formal", name: string]>;

			assertType<IsExact<typeof greeting, Isolated>>(true);
		} else {
			assertUnreachable();
		}
	});

	await t.step("Returns false when variant doesn't match", () => {
		// When/Then: isolate() returns false when variant doesn't match
		if (TestSubject.isolate(greeting, "Informal")) {
			assertUnreachable();
		} else {
			assertType<IsExact<typeof greeting, Greeting>>(true);
		}
	});
});

Deno.test("isolateAnd() isolates variant with additional predicate", async (t) => {
	// Given: a Formal greeting
	const greeting = new Greeting("Formal", "Cady");

	await t.step("Returns true when variant and predicate match", () => {
		// When/Then: isolateAnd() returns true when variant and predicate match
		if (TestSubject.isolateAnd(greeting, "Formal", (name) => name === "Cady")) {
			type Isolated = Enum<[kind: "Formal", name: string]>;

			assertType<IsExact<typeof greeting, Isolated>>(true);
		} else {
			assertUnreachable();
		}
	});

	await t.step(
		"Returns false when variant matches but predicate doesn't",
		() => {
			// When/Then: isolateAnd() returns false when variant matches but predicate doesn't
			if (
				TestSubject.isolateAnd(greeting, "Formal", (name) => name === "Alice")
			) {
				assertUnreachable();
			}
		},
	);

	await t.step("Returns false when variant doesn't match", () => {
		// When/Then: isolateAnd() returns false when variant doesn't match
		if (
			TestSubject.isolateAnd(greeting, "Informal", (name) => name === "Cady")
		) {
			assertUnreachable();
		}
	});
});

Deno.test("isolateAny() isolates any variant from a set", async (t) => {
	// Given: a Formal greeting
	const greeting = new Greeting("Formal", "Cady");

	await t.step("Returns true when variant matches any in set", () => {
		// When/Then: isolateAny() returns true when variant matches any in set
		if (TestSubject.isolateAny(greeting, new Set(["Formal", "Informal"]))) {
			type Isolated = Enum<
				[kind: "Formal", name: string] | [kind: "Informal", name: string]
			>;

			assertType<IsExact<typeof greeting, Isolated>>(true);
		} else {
			assertUnreachable();
		}
	});

	await t.step("Returns false when variant doesn't match any in set", () => {
		// When/Then: isolateAny() returns false when variant doesn't match any in set
		if (
			TestSubject.isolateAny(greeting, new Set(["Informal", "HappyBirthday"]))
		) {
			assertUnreachable();
		}
	});
});

Deno.test("assertIsolated() isolates or throws", async (t) => {
	// Given: a Formal greeting
	const greeting = new Greeting("Formal", "Cady");

	await t.step("Proceeds when variant matches", () => {
		// When: calling assertIsolated()
		TestSubject.assertIsolated(greeting, "Formal");

		type Isolated = Enum<[kind: "Formal", name: string]>;

		// Then: proceeds when variant matches
		assertType<IsExact<typeof greeting, Isolated>>(true);
	});

	await t.step("Panics when variant doesn't match", async (t) => {
		await t.step("Uses message passed in", () => {
			// When: assertIsolated() panics on a matching variant
			const error = assertThrows(() => {
				TestSubject.assertIsolated(greeting, "Informal", "custom message");
			}, Error);

			// Then: the panic carries the message passed in
			assertEquals(error.message, "custom message");
		});

		await t.step("Generates message otherwise", () => {
			// When: assertIsolated() panics on a matching variant
			const error = assertThrows(() => {
				TestSubject.assertIsolated(greeting, "Informal");
			}, Error);

			// Then: the panic carries a generated message
			assertEquals(error.message, "Enum should be Informal, but it was Formal");
		});
	});
});

Deno.test("assertAnyIsolated() isolates or throws", async (t) => {
	// Given: a Formal greeting
	const greeting = new Greeting("Formal", "Cady");

	await t.step("Proceeds when variant matches any in set", () => {
		// When: calling assertAnyIsolated()
		TestSubject.assertAnyIsolated(greeting, new Set(["Formal", "Informal"]));

		type Isolated = Enum<
			[kind: "Formal", name: string] | [kind: "Informal", name: string]
		>;

		// Then: proceeds when variant matches any in set
		assertType<IsExact<typeof greeting, Isolated>>(true);
	});

	await t.step("Panics when variant doesn't match any in set", async (t) => {
		await t.step("Uses message passed in", () => {
			// When: assertAnyIsolated() panics on a matching variant
			const error = assertThrows(() => {
				TestSubject.assertAnyIsolated(
					greeting,
					new Set(["Informal", "HappyBirthday"]),
					"custom message",
				);
			}, Error);

			// Then: the panic carries the message passed in
			assertEquals(error.message, "custom message");
		});

		await t.step("Generates message otherwise", () => {
			// When: assertAnyIsolated() panics on a matching variant
			const error = assertThrows(() => {
				TestSubject.assertAnyIsolated(
					greeting,
					new Set(["Informal", "HappyBirthday"]),
				);
			}, Error);

			// Then: the panic carries a generated message
			assertEquals(
				error.message,
				"Enum should be any one of Informal, or HappyBirthday, but it was Formal",
			);
		});
	});
});

Deno.test("inspectIsolated() calls inspector when variant is isolated", async (t) => {
	// Given: a Formal greeting
	const greeting = new Greeting("Formal", "Cady");

	await t.step("Calls inspector with union value when isolated", () => {
		// When: calling inspectIsolated()
		let called = false;
		let receivedValue: string | BirthdayGreeting | undefined;

		TestSubject.inspectIsolated(greeting, "Formal", (value) => {
			called = true;
			receivedValue = value;
		});

		// Then: calls inspector with union value when isolated
		assertEquals(called, true);
		assertEquals(receivedValue, "Cady");
	});

	await t.step("Does not call inspector when variant is not isolated", () => {
		// When: calling inspectIsolated()
		let called = false;

		TestSubject.inspectIsolated(greeting, "Informal", () => {
			called = true;
		});

		// Then: does not call inspector when variant is not isolated
		assertEquals(called, false);
	});
});

Deno.test("inspectAnyIsolated() calls inspector when any variant isolated", async (t) => {
	// Given: a Formal greeting
	const greeting = new Greeting("Formal", "Cady");

	await t.step("Calls inspector with variant when any isolated", () => {
		// When: calling inspectAnyIsolated()
		let called = false;
		let receivedVariant: [string, ...unknown[]] | undefined;

		TestSubject.inspectAnyIsolated(
			greeting,
			new Set(["Formal", "Informal"]),
			(variant) => {
				called = true;
				receivedVariant = variant;
			},
		);

		// Then: calls inspector with variant when any isolated
		assertEquals(called, true);
		assertEquals(receivedVariant, ["Formal", "Cady"]);
	});

	await t.step("Does not call inspector when no variant matches", () => {
		// When: calling inspectAnyIsolated()
		let called = false;

		TestSubject.inspectAnyIsolated(
			greeting,
			new Set(["Informal", "HappyBirthday"]),
			() => {
				called = true;
			},
		);

		// Then: does not call inspector when no variant matches
		assertEquals(called, false);
	});
});

Deno.test("iterIsolated() yields value when variant is isolated", async (t) => {
	// Given: a Formal greeting
	const greeting = new Greeting("Formal", "Cady");

	await t.step("Yields union value when isolated", () => {
		// When: calling iterIsolated()
		const results = Array.from(TestSubject.iterIsolated(greeting, "Formal"));

		// Then: yields union value when isolated
		assertEquals(results.length, 1);
		assertEquals(results[0], "Cady");
	});

	await t.step("Yields nothing when variant is not isolated", () => {
		// When: calling iterIsolated()
		const results = Array.from(TestSubject.iterIsolated(greeting, "Informal"));

		// Then: yields nothing when variant is not isolated
		assertEquals(results.length, 0);
	});
});

Deno.test("iterAnyIsolated() yields enum when any variant isolated", async (t) => {
	// Given: a Formal greeting
	const greeting = new Greeting("Formal", "Cady");

	await t.step("Yields enum when any isolated", () => {
		// When: calling iterAnyIsolated()
		const results = Array.from(
			TestSubject.iterAnyIsolated(greeting, new Set(["Formal", "Informal"])),
		);

		// Then: yields enum when any isolated
		assertEquals(results.length, 1);
		assertEquals(results[0], greeting);
	});

	await t.step("Yields nothing when no variant matches", () => {
		// When: calling iterAnyIsolated()
		const results = Array.from(
			TestSubject.iterAnyIsolated(
				greeting,
				new Set(["Informal", "HappyBirthday"]),
			),
		);

		// Then: yields nothing when no variant matches
		assertEquals(results.length, 0);
	});
});
