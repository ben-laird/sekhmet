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
	const greeting = (): Greeting => new Greeting("Formal", "Cady");

	const subject = TestSubject.unionKinds(greeting());

	type GreetingKinds = "Formal" | "Informal" | "HappyBirthday";

	assertEquals<GreetingKinds>(subject, "Formal");
});

Deno.test("union() returns second parameter of Variant tuple", () => {
	const greeting = (): Greeting => new Greeting("Formal", "Cady");

	const subject = TestSubject.union(greeting());

	assertEquals<string | BirthdayGreeting>(subject, "Cady");
});

Deno.test("match() returns result of calling specified arm", () => {
	const greeting = (): Greeting => new Greeting("Formal", "Cady");

	const res = TestSubject.match(greeting())({
		Formal: (name) => `Hello, ${name}.`,
		Informal: (name) => `Hey ${name}! How are you?`,
		HappyBirthday: ({ name, age }) => {
			return `Happy birthday ${name}! You're ${age} years old now!`;
		},
	});

	assertEquals<string>(res, "Hello, Cady.");
});
