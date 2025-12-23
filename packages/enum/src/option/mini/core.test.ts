import { assertEquals } from "@std/assert";
import { match, union, unionKinds } from "@/src/core/mini/exit.ts";
import { isolate } from "@/src/core/mini/isolate.ts";
import * as TestSubject from "./core.ts";

Deno.test("Some() creates Option with Some variant", () => {
	// Given: a value to wrap
	const value = 42;

	// When: creating an Option with Some()
	const subject = TestSubject.Some(value);

	// Then: an Option instance with Some variant is created
	assertEquals(subject instanceof TestSubject.Option, true);
	assertEquals(isolate(subject, "Some"), true);
});

Deno.test("Some() stores the provided value", () => {
	// Given: a string value to wrap
	const value = "hello world";

	// When: creating an Option with Some()
	const subject = TestSubject.Some(value);

	// Then: the variant kind is Some and the value is stored correctly
	assertEquals(unionKinds(subject), "Some");
	assertEquals(union(subject), value);
});

Deno.test("Some() works with complex types", () => {
	// Given: a complex object type
	interface User {
		name: string;
		age: number;
	}
	const user: User = { name: "Alice", age: 30 };

	// When: creating an Option with Some()
	const subject = TestSubject.Some(user);

	// Then: an Option instance is created storing the complex object
	assertEquals(subject instanceof TestSubject.Option, true);
	assertEquals(union(subject), user);
});

Deno.test("None() creates Option with None variant", () => {
	// Given: no value to wrap
	// When: creating an Option with None()
	const subject = TestSubject.None();

	// Then: an Option instance with None variant is created
	assertEquals(subject instanceof TestSubject.Option, true);
	assertEquals(isolate(subject, "None"), true);
});

Deno.test("None() creates variant without value", () => {
	// Given: no value to wrap
	// When: creating an Option with None()
	const subject = TestSubject.None();

	// Then: the variant kind is None
	assertEquals(unionKinds(subject), "None");
});

Deno.test("None() can be typed explicitly", () => {
	// Given: an explicit type parameter
	// When: creating a None Option with explicit type
	const subject = TestSubject.None<string>();

	// Then: an Option instance with None variant is created
	assertEquals(subject instanceof TestSubject.Option, true);
	assertEquals(isolate(subject, "None"), true);
});

Deno.test("Option class extends Enum", () => {
	// Given: Some and None constructors
	// When: creating both Some and None instances
	const some = TestSubject.Some(100);
	const none = TestSubject.None();

	// Then: both instances are instances of Option
	assertEquals(some instanceof TestSubject.Option, true);
	assertEquals(none instanceof TestSubject.Option, true);
});

Deno.test("Some and None can be distinguished using match", () => {
	// Given: a Some instance and a None instance
	const some = TestSubject.Some(42);
	const none = TestSubject.None<number>();

	// When: matching on both Options
	const someResult = match(some)({
		Some: (value) => `Got ${value}`,
		None: () => "Got nothing",
	});

	const noneResult = match(none)({
		Some: (value) => `Got ${value}`,
		None: () => "Got nothing",
	});

	// Then: match distinguishes between Some and None correctly
	assertEquals(someResult, "Got 42");
	assertEquals(noneResult, "Got nothing");
});
