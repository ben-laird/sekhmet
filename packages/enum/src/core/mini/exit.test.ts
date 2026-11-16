import { assertEquals } from "@std/assert";
import { Enum, type Split } from "./core.ts";
import * as TestSubject from "./exit.ts";

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

Deno.test("unionKinds() returns first parameter of Variant tuple", () => {
	// Given: a Formal greeting
	const greeting = (): Greeting => new Greeting("Formal", "Cady");

	// When: taking its kind
	const subject = TestSubject.unionKinds(greeting());

	// Then: it is the variant's kind, typed as the union of kinds
	type GreetingKinds = "Formal" | "Informal" | "HappyBirthday";

	assertEquals<GreetingKinds>(subject, "Formal");
});

Deno.test("union() returns second parameter of Variant tuple", () => {
	// Given: a Formal greeting
	const greeting = (): Greeting => new Greeting("Formal", "Cady");

	// When: taking its value
	const subject = TestSubject.union(greeting());

	// Then: it is the variant's value, typed as the union of values
	assertEquals<string | BirthdayGreeting>(subject, "Cady");
});

Deno.test("match() returns result of calling specified arm", () => {
	// Given: a Formal greeting
	const greeting = (): Greeting => new Greeting("Formal", "Cady");

	// When: matching it against an arm per variant
	const res = TestSubject.match(greeting())({
		Formal: (name) => `Hello, ${name}.`,
		Informal: (name) => `Hey ${name}! How are you?`,
		HappyBirthday: ({ name, age }) => {
			return `Happy birthday ${name}! You're ${age} years old now!`;
		},
	});

	// Then: the Formal arm's result is returned
	assertEquals<string>(res, "Hello, Cady.");
});
