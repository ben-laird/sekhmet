import { assertEquals } from "@std/assert";
import { match, unionKinds } from "@/src/core/mini/exit.ts";
import { isolate } from "@/src/core/mini/isolate.ts";
import { None, Some } from "./core.ts";
import * as TestSubject from "./mutation.ts";

Deno.test("insert() sets value in None", () => {
	// Given: an Option with None variant
	const option = None<number>();

	// When: calling insert() with a value
	const returned = TestSubject.insert(option, 42);

	// Then: the value is returned and the option is mutated to Some
	assertEquals(returned, 42);
	assertEquals(isolate(option, "Some"), true);

	const value = match(option)({
		Some: (v) => v,
		None: () => -1,
	});
	assertEquals(value, 42);
});

Deno.test("insert() overwrites value in Some", () => {
	// Given: an Option with Some variant containing a value
	const option = Some(10);

	// When: calling insert() with a new value
	const returned = TestSubject.insert(option, 42);

	// Then: the new value is returned and the option is mutated to contain it
	assertEquals(returned, 42);

	const value = match(option)({
		Some: (v) => v,
		None: () => -1,
	});
	assertEquals(value, 42);
});

Deno.test("insert() mutates the original option", () => {
	// Given: an Option with None variant
	const option = None<string>();

	// When: calling insert() with a value
	TestSubject.insert(option, "hello");

	// Then: the original option is mutated to Some with the inserted value
	assertEquals(unionKinds(option), "Some");

	const value = match(option)({
		Some: (v) => v,
		None: () => "",
	});
	assertEquals(value, "hello");
});

Deno.test("getOrInsert() returns existing value for Some", () => {
	// Given: an Option with Some variant containing a value
	const option = Some(10);

	// When: calling getOrInsert() with a default value
	const subject = TestSubject.getOrInsert(option, 42);

	// Then: the existing value is returned and the option is unchanged
	assertEquals(subject, 10);

	const value = match(option)({
		Some: (v) => v,
		None: () => -1,
	});
	assertEquals(value, 10);
});

Deno.test("getOrInsert() inserts and returns value for None", () => {
	// Given: an Option with None variant
	const option = None<number>();

	// When: calling getOrInsert() with a default value
	const subject = TestSubject.getOrInsert(option, 42);

	// Then: the default value is inserted, returned, and the option is mutated to Some
	assertEquals(subject, 42);
	assertEquals(isolate(option, "Some"), true);

	const value = match(option)({
		Some: (v) => v,
		None: () => -1,
	});
	assertEquals(value, 42);
});

Deno.test("getOrInsertWith() returns existing value for Some", () => {
	// Given: an Option with Some variant and a creator function
	const option = Some(10);
	let called = false;

	// When: calling getOrInsertWith() with the creator function
	const subject = TestSubject.getOrInsertWith(option, () => {
		called = true;
		return 42;
	});

	// Then: the existing value is returned and the creator is not called
	assertEquals(subject, 10);
	assertEquals(called, false);
});

Deno.test("getOrInsertWith() calls creator and inserts for None", () => {
	// Given: an Option with None variant and a creator function
	const option = None<number>();
	let called = false;

	// When: calling getOrInsertWith() with the creator function
	const subject = TestSubject.getOrInsertWith(option, () => {
		called = true;
		return 42;
	});

	// Then: the creator is called, its value is inserted and returned, and the option is mutated to Some
	assertEquals(subject, 42);
	assertEquals(called, true);
	assertEquals(isolate(option, "Some"), true);

	const value = match(option)({
		Some: (v) => v,
		None: () => -1,
	});
	assertEquals(value, 42);
});

Deno.test("take() returns Some and sets original to None", () => {
	// Given: an Option with Some variant containing a value
	const option = Some(42);

	// When: calling take() on the option
	const subject = TestSubject.take(option);

	// Then: the value is returned as Some and the original option is mutated to None
	const takenValue = match(subject)({
		Some: (v) => v,
		None: () => -1,
	});

	assertEquals(takenValue, 42);
	assertEquals(isolate(option, "None"), true);
});

Deno.test("take() returns None when original is None", () => {
	// Given: an Option with None variant
	const option = None<number>();

	// When: calling take() on the option
	const subject = TestSubject.take(option);

	// Then: None is returned and the original option remains None
	assertEquals(isolate(subject, "None"), true);
	assertEquals(isolate(option, "None"), true);
});

Deno.test("take() mutates the original option to None", () => {
	// Given: an Option with Some variant containing a value
	const option = Some("hello");

	// When: calling take() on the option
	TestSubject.take(option);

	// Then: the original option is mutated to None
	assertEquals(unionKinds(option), "None");
});

Deno.test("takeIf() takes value when predicate passes", () => {
	// Given: an Option with Some variant and a predicate that will pass
	const option = Some(10);

	// When: calling takeIf() with the predicate
	const subject = TestSubject.takeIf(option, (x) => x > 5);

	// Then: the value is returned as Some and the original option is mutated to None
	const takenValue = match(subject)({
		Some: (v) => v,
		None: () => -1,
	});

	assertEquals(takenValue, 10);
	assertEquals(isolate(option, "None"), true);
});

Deno.test("takeIf() returns None when predicate fails", () => {
	// Given: an Option with Some variant and a predicate that will fail
	const option = Some(3);

	// When: calling takeIf() with the predicate
	const subject = TestSubject.takeIf(option, (x) => x > 5);

	// Then: None is returned and the original option remains unchanged
	assertEquals(isolate(subject, "None"), true);
	assertEquals(isolate(option, "Some"), true);

	const value = match(option)({
		Some: (v) => v,
		None: () => -1,
	});
	assertEquals(value, 3);
});

Deno.test("takeIf() returns None when original is None", () => {
	// Given: an Option with None variant and a predicate
	const option = None<number>();

	// When: calling takeIf() with the predicate
	const subject = TestSubject.takeIf(option, (x) => x > 5);

	// Then: None is returned
	assertEquals(isolate(subject, "None"), true);
});

Deno.test("takeIf() works with type guards", () => {
	// Given: an Option with Some variant containing a union type and a type guard predicate
	const option = Some<string | number>(42);

	// When: calling takeIf() with the type guard
	const subject = TestSubject.takeIf(
		option,
		(x): x is number => typeof x === "number",
	);

	// Then: the value is returned as Some and the original option is mutated to None
	const takenValue = match(subject)({
		Some: (v) => v,
		None: () => -1,
	});

	assertEquals(takenValue, 42);
	assertEquals(isolate(option, "None"), true);
});

Deno.test("replace() sets new value and returns old Some", () => {
	// Given: an Option with Some variant containing a value
	const option = Some(10);

	// When: calling replace() with a new value
	const subject = TestSubject.replace(option, 42);

	// Then: the old value is returned as Some and the option is mutated to contain the new value
	const oldValue = match(subject)({
		Some: (v) => v,
		None: () => -1,
	});

	const newValue = match(option)({
		Some: (v) => v,
		None: () => -1,
	});

	assertEquals(oldValue, 10);
	assertEquals(newValue, 42);
});

Deno.test("replace() sets new value and returns old None", () => {
	// Given: an Option with None variant
	const option = None<number>();

	// When: calling replace() with a new value
	const subject = TestSubject.replace(option, 42);

	// Then: None is returned and the option is mutated to Some with the new value
	assertEquals(isolate(subject, "None"), true);
	assertEquals(isolate(option, "Some"), true);

	const newValue = match(option)({
		Some: (v) => v,
		None: () => -1,
	});

	assertEquals(newValue, 42);
});

Deno.test("replace() mutates the original option", () => {
	// Given: an Option with Some variant containing a value
	const option = Some("old");

	// When: calling replace() with a new value
	TestSubject.replace(option, "new");

	// Then: the original option is mutated to contain the new value
	assertEquals(isolate(option, "Some"), true);

	const value = match(option)({
		Some: (v) => v,
		None: () => "",
	});

	assertEquals(value, "new");
});
