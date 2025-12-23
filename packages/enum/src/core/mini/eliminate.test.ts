import {
	assertEquals,
	assertThrows,
	unreachable as assertUnreachable,
} from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import { Enum, type Split } from "./core.ts";
import * as TestSubject from "./eliminate.ts";

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

Deno.test("eliminate() eliminates a possible variant", async (t) => {
	// When
	const greeting = new Greeting("Formal", "Cady");

	// Then
	await t.step("narrows variant when it matches second arg", () => {
		if (TestSubject.eliminate(greeting, "Informal")) {
			type Filtered = Enum<
				| [kind: "Formal", name: string]
				| [kind: "HappyBirthday", greeting: BirthdayGreeting]
			>;

			assertType<IsExact<typeof greeting, Filtered>>(true);
		} else {
			assertType<IsExact<typeof greeting, Greeting>>(true);

			assertUnreachable();
		}
	});
});

Deno.test("eliminateAll() eliminates multiple variants at once", async (t) => {
	// When
	const greeting = new Greeting("Formal", "Cady");

	// Then
	await t.step("Returns true & narrows when variant isn't in list", () => {
		if (
			TestSubject.eliminateAll(greeting, new Set(["Informal", "HappyBirthday"]))
		) {
			type Filtered = Enum<[kind: "Formal", name: string]>;

			assertType<IsExact<typeof greeting, Filtered>>(true);
		} else {
			assertType<IsExact<typeof greeting, Greeting>>(true);

			assertUnreachable();
		}
	});

	await t.step("Returns false when variant matches list", () => {
		if (
			TestSubject.eliminateAll(greeting, new Set(["Formal", "HappyBirthday"]))
		) {
			type Filtered = Enum<[kind: "Informal", name: string]>;

			assertType<IsExact<typeof greeting, Filtered>>(true);

			assertUnreachable();
		}
	});
});

Deno.test("assertEliminated() eliminates or throws", async (t) => {
	// When
	const greeting = new Greeting("Informal", "Cady");

	// Then
	await t.step("Proceeds when variant doesn't match second arg", () => {
		TestSubject.assertEliminated(greeting, "Formal");

		type Filtered = Enum<
			| [kind: "Informal", name: string]
			| [kind: "HappyBirthday", greeting: BirthdayGreeting]
		>;

		assertType<IsExact<typeof greeting, Filtered>>(true);
	});

	await t.step("Errors when variant matches", async (t) => {
		await t.step("Uses message passed in", () => {
			const error = assertThrows(() => {
				TestSubject.assertEliminated(greeting, "Informal", "message");

				type Filtered = Enum<
					| [kind: "Formal", name: string]
					| [kind: "HappyBirthday", greeting: BirthdayGreeting]
				>;

				assertType<IsExact<typeof greeting, Filtered>>(true);
			}, Error);

			assertEquals(error.message, "message");
		});

		await t.step("Generates message otherwise", () => {
			const error = assertThrows(() => {
				TestSubject.assertEliminated(greeting, "Informal");

				type Filtered = Enum<
					| [kind: "Formal", name: string]
					| [kind: "HappyBirthday", greeting: BirthdayGreeting]
				>;

				assertType<IsExact<typeof greeting, Filtered>>(true);
			}, Error);

			assertEquals(error.message, "Enum should not be Informal");
		});
	});
});

Deno.test("assertAllEliminated() eliminates or throws", async (t) => {
	// When
	const greeting = new Greeting("Informal", "Cady");

	// Then
	await t.step("Proceeds when variant doesn't match any in set", () => {
		TestSubject.assertAllEliminated(
			greeting,
			new Set(["Formal", "HappyBirthday"]),
		);

		type Filtered = Enum<[kind: "Informal", name: string]>;

		assertType<IsExact<typeof greeting, Filtered>>(true);
	});

	await t.step("Errors when variant matches any in set", async (t) => {
		await t.step("Uses message passed in", () => {
			const error = assertThrows(() => {
				TestSubject.assertAllEliminated(
					greeting,
					new Set(["Informal", "Formal"]),
					"custom message",
				);

				type Filtered = Enum<
					[kind: "HappyBirthday", greeting: BirthdayGreeting]
				>;

				assertType<IsExact<typeof greeting, Filtered>>(true);
			}, Error);

			assertEquals(error.message, "custom message");
		});

		await t.step("Generates message otherwise", () => {
			const error = assertThrows(() => {
				TestSubject.assertAllEliminated(
					greeting,
					new Set(["Informal", "HappyBirthday"]),
				);

				type Filtered = Enum<[kind: "Formal", name: string]>;

				assertType<IsExact<typeof greeting, Filtered>>(true);
			}, Error);

			assertEquals(
				error.message,
				"Enum should not be any one of Informal, or HappyBirthday, but it was Informal",
			);
		});
	});
});

Deno.test("inspectEliminated() calls inspector when variant is eliminated", async (t) => {
	// When
	const greeting = new Greeting("Formal", "Cady");

	// Then
	await t.step("Calls inspector with union value when eliminated", () => {
		let called = false;
		let receivedValue: string | BirthdayGreeting | undefined;

		TestSubject.inspectEliminated(greeting, "Informal", (value) => {
			called = true;
			receivedValue = value;
		});

		assertEquals(called, true);
		assertEquals(receivedValue, "Cady");
	});

	await t.step("Does not call inspector when variant is not eliminated", () => {
		let called = false;

		TestSubject.inspectEliminated(greeting, "Formal", () => {
			called = true;
		});

		assertEquals(called, false);
	});
});

Deno.test("inspectAllEliminated() calls inspector when all variants eliminated", async (t) => {
	// When
	const greeting = new Greeting("Formal", "Cady");

	// Then
	await t.step("Calls inspector with enum when all eliminated", () => {
		let called = false;
		let receivedVariant: [string, ...unknown[]] | undefined;

		TestSubject.inspectAllEliminated(
			greeting,
			new Set(["Informal", "HappyBirthday"]),
			(variant) => {
				called = true;
				receivedVariant = variant;
			},
		);

		assertEquals(called, true);
		assertEquals(receivedVariant, ["Formal", "Cady"]);
	});

	await t.step("Does not call inspector when variant matches", () => {
		let called = false;

		TestSubject.inspectAllEliminated(
			greeting,
			new Set(["Formal", "HappyBirthday"]),
			() => {
				called = true;
			},
		);

		assertEquals(called, false);
	});
});

Deno.test("iterEliminated() yields value when variant is eliminated", async (t) => {
	// When
	const greeting = new Greeting("Formal", "Cady");

	// Then
	await t.step("Yields union value when eliminated", () => {
		const results = Array.from(
			TestSubject.iterEliminated(greeting, "Informal"),
		);

		assertEquals(results.length, 1);
		assertEquals(results[0], "Cady");
	});

	await t.step("Yields nothing when variant is not eliminated", () => {
		const results = Array.from(TestSubject.iterEliminated(greeting, "Formal"));

		assertEquals(results.length, 0);
	});
});

Deno.test("iterAllEliminated() yields enum when all variants eliminated", async (t) => {
	// When
	const greeting = new Greeting("Formal", "Cady");

	// Then
	await t.step("Yields enum when all eliminated", () => {
		const results = Array.from(
			TestSubject.iterAllEliminated(
				greeting,
				new Set(["Informal", "HappyBirthday"]),
			),
		);

		assertEquals(results.length, 1);
		assertEquals(results[0], greeting);
	});

	await t.step("Yields nothing when variant matches", () => {
		const results = Array.from(
			TestSubject.iterAllEliminated(
				greeting,
				new Set(["Formal", "HappyBirthday"]),
			),
		);

		assertEquals(results.length, 0);
	});
});
