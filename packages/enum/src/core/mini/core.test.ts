import { getStructParams } from "@sekhmet/primordials/struct";
import { assertEquals } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import * as TestSubject from "./core.ts";

Deno.test("Enum can be created", async (t) => {
	// Given

	interface BirthdayGreeting {
		name: string;
		age: number;
	}

	type GreetingKinds = TestSubject.Split<{
		Formal: [name: string];
		Informal: [name: string];
		HappyBirthday: [greeting: BirthdayGreeting];
	}>;

	class Greeting extends TestSubject.Enum<GreetingKinds> {}

	// When

	const greetingKind: GreetingKinds = ["Formal", "Cady"];

	const greeting = new Greeting(...greetingKind);

	// Then

	await t.step("Struct interface contains raw data", () => {
		const data = getStructParams(greeting);

		assertType<IsExact<typeof data, TestSubject.RawEnum<GreetingKinds>>>(true);

		assertEquals(data.variant, greetingKind);
	});
});
