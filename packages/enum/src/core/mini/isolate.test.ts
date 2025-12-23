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
	// When
	const greeting = new Greeting("Formal", "Cady");

	// Then
	await t.step("Returns true and narrows when variant matches", () => {
		if (TestSubject.isolate(greeting, "Formal")) {
			type Isolated = Enum<[kind: "Formal", name: string]>;

			assertType<IsExact<typeof greeting, Isolated>>(true);
		} else {
			assertUnreachable();
		}
	});

	await t.step("Returns false when variant doesn't match", () => {
		if (TestSubject.isolate(greeting, "Informal")) {
			assertUnreachable();
		} else {
			assertType<IsExact<typeof greeting, Greeting>>(true);
		}
	});
});

Deno.test("isolateAnd() isolates variant with additional predicate", async (t) => {
	// When
	const greeting = new Greeting("Formal", "Cady");

	// Then
	await t.step("Returns true when variant and predicate match", () => {
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
			if (
				TestSubject.isolateAnd(greeting, "Formal", (name) => name === "Alice")
			) {
				assertUnreachable();
			}
		},
	);

	await t.step("Returns false when variant doesn't match", () => {
		if (
			TestSubject.isolateAnd(greeting, "Informal", (name) => name === "Cady")
		) {
			assertUnreachable();
		}
	});
});

Deno.test("isolateAny() isolates any variant from a set", async (t) => {
	// When
	const greeting = new Greeting("Formal", "Cady");

	// Then
	await t.step("Returns true when variant matches any in set", () => {
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
		if (
			TestSubject.isolateAny(greeting, new Set(["Informal", "HappyBirthday"]))
		) {
			assertUnreachable();
		}
	});
});

Deno.test("assertIsolated() isolates or throws", async (t) => {
	// When
	const greeting = new Greeting("Formal", "Cady");

	// Then
	await t.step("Proceeds when variant matches", () => {
		TestSubject.assertIsolated(greeting, "Formal");

		type Isolated = Enum<[kind: "Formal", name: string]>;

		assertType<IsExact<typeof greeting, Isolated>>(true);
	});

	await t.step("Panics when variant doesn't match", async (t) => {
		await t.step("Uses message passed in", () => {
			const error = assertThrows(() => {
				TestSubject.assertIsolated(greeting, "Informal", "custom message");
			}, Error);

			assertEquals(error.message, "custom message");
		});

		await t.step("Generates message otherwise", () => {
			const error = assertThrows(() => {
				TestSubject.assertIsolated(greeting, "Informal");
			}, Error);

			assertEquals(error.message, "Enum should be Informal, but it was Formal");
		});
	});
});

Deno.test("assertAnyIsolated() isolates or throws", async (t) => {
	// When
	const greeting = new Greeting("Formal", "Cady");

	// Then
	await t.step("Proceeds when variant matches any in set", () => {
		TestSubject.assertAnyIsolated(greeting, new Set(["Formal", "Informal"]));

		type Isolated = Enum<
			[kind: "Formal", name: string] | [kind: "Informal", name: string]
		>;

		assertType<IsExact<typeof greeting, Isolated>>(true);
	});

	await t.step("Panics when variant doesn't match any in set", async (t) => {
		await t.step("Uses message passed in", () => {
			const error = assertThrows(() => {
				TestSubject.assertAnyIsolated(
					greeting,
					new Set(["Informal", "HappyBirthday"]),
					"custom message",
				);
			}, Error);

			assertEquals(error.message, "custom message");
		});

		await t.step("Generates message otherwise", () => {
			const error = assertThrows(() => {
				TestSubject.assertAnyIsolated(
					greeting,
					new Set(["Informal", "HappyBirthday"]),
				);
			}, Error);

			assertEquals(
				error.message,
				"Enum should be any one of Informal, or HappyBirthday, but it was Formal",
			);
		});
	});
});

Deno.test("inspectIsolated() calls inspector when variant is isolated", async (t) => {
	// When
	const greeting = new Greeting("Formal", "Cady");

	// Then
	await t.step("Calls inspector with union value when isolated", () => {
		let called = false;
		let receivedValue: string | BirthdayGreeting | undefined;

		TestSubject.inspectIsolated(greeting, "Formal", (value) => {
			called = true;
			receivedValue = value;
		});

		assertEquals(called, true);
		assertEquals(receivedValue, "Cady");
	});

	await t.step("Does not call inspector when variant is not isolated", () => {
		let called = false;

		TestSubject.inspectIsolated(greeting, "Informal", () => {
			called = true;
		});

		assertEquals(called, false);
	});
});

Deno.test("inspectAnyIsolated() calls inspector when any variant isolated", async (t) => {
	// When
	const greeting = new Greeting("Formal", "Cady");

	// Then
	await t.step("Calls inspector with variant when any isolated", () => {
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

		assertEquals(called, true);
		assertEquals(receivedVariant, ["Formal", "Cady"]);
	});

	await t.step("Does not call inspector when no variant matches", () => {
		let called = false;

		TestSubject.inspectAnyIsolated(
			greeting,
			new Set(["Informal", "HappyBirthday"]),
			() => {
				called = true;
			},
		);

		assertEquals(called, false);
	});
});

Deno.test("iterIsolated() yields value when variant is isolated", async (t) => {
	// When
	const greeting = new Greeting("Formal", "Cady");

	// Then
	await t.step("Yields union value when isolated", () => {
		const results = Array.from(TestSubject.iterIsolated(greeting, "Formal"));

		assertEquals(results.length, 1);
		assertEquals(results[0], "Cady");
	});

	await t.step("Yields nothing when variant is not isolated", () => {
		const results = Array.from(TestSubject.iterIsolated(greeting, "Informal"));

		assertEquals(results.length, 0);
	});
});

Deno.test("iterAnyIsolated() yields enum when any variant isolated", async (t) => {
	// When
	const greeting = new Greeting("Formal", "Cady");

	// Then
	await t.step("Yields enum when any isolated", () => {
		const results = Array.from(
			TestSubject.iterAnyIsolated(greeting, new Set(["Formal", "Informal"])),
		);

		assertEquals(results.length, 1);
		assertEquals(results[0], greeting);
	});

	await t.step("Yields nothing when no variant matches", () => {
		const results = Array.from(
			TestSubject.iterAnyIsolated(
				greeting,
				new Set(["Informal", "HappyBirthday"]),
			),
		);

		assertEquals(results.length, 0);
	});
});
