import { assertEquals } from "@std/assert";
import { getStructParams, Struct } from "./struct.ts";

Deno.test("Struct usage", () => {
	// Given

	interface BirthdayPersonParams {
		name: string;
		age: number;
	}

	// Struct enables the clean specification & usage of parameters
	class BirthdayPerson extends Struct<BirthdayPersonParams> {
		greet(): string {
			const { name, age } = getStructParams(this);

			const enOrdinalRules = new Intl.PluralRules("en-US", { type: "ordinal" });

			const enOrdinalSuffixes = new Map<Intl.LDMLPluralRule, string>([
				["one", "st"],
				["two", "nd"],
				["few", "rd"],
				["other", "th"],
			]);

			const suffix = enOrdinalSuffixes.get(enOrdinalRules.select(age)) ?? "";

			return `Happy ${age}${suffix} birthday, ${name}!`;
		}
	}

	// When

	const person = new BirthdayPerson({ name: "Alice", age: 20 });

	const greeting = person.greet();

	// Then

	assertEquals(greeting, "Happy 20th birthday, Alice!");
});
