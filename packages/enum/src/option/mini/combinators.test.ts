import { assertEquals } from "@std/assert";
import { match } from "@/src/core/mini/exit.ts";
import { isolate } from "@/src/core/mini/isolate.ts";
import { Err, Ok } from "@/src/result/mini/core.ts";
import * as TestSubject from "./combinators.ts";
import { None, Some } from "./core.ts";

Deno.test("iter() yields value for Some", () => {
	// Given: an Option with a Some variant containing a value
	const option = Some(42);

	// When: iterating over the Option
	const values = [...TestSubject.iter(option)];

	// Then: the value is yielded as a single element
	assertEquals(values, [42]);
});

Deno.test("iter() yields nothing for None", () => {
	// Given: an Option with a None variant
	const option = None<number>();

	// When: iterating over the Option
	const values = [...TestSubject.iter(option)];

	// Then: no values are yielded
	assertEquals(values, []);
});

Deno.test("iter() can be used in for-of loop", () => {
	// Given: an Option with a Some variant
	const option = Some("hello");
	let count = 0;
	let value = "";

	// When: using iter() in a for-of loop
	for (const v of TestSubject.iter(option)) {
		count++;
		value = v;
	}

	// Then: the loop iterates exactly once with the correct value
	assertEquals(count, 1);
	assertEquals(value, "hello");
});

Deno.test("and() returns second option when first is Some", () => {
	// Given: two Options, both with Some variants
	const optionA = Some(10);
	const optionB = Some("hello");

	// When: calling and() to combine them
	const subject = TestSubject.and(optionA, optionB);

	// Then: the second option's value is returned
	const result = match(subject)({
		Some: (value) => value,
		None: () => null,
	});

	assertEquals(result, "hello");
});

Deno.test("and() returns None when first is None", () => {
	// Given: first Option is None, second is Some
	const optionA = None<number>();
	const optionB = Some("hello");

	// When: calling and() to combine them
	const subject = TestSubject.and(optionA, optionB);

	// Then: None is returned
	assertEquals(isolate(subject, "None"), true);
});

Deno.test("and() propagates None from second option", () => {
	// Given: first Option is Some, second is None
	const optionA = Some(10);
	const optionB = None<string>();

	// When: calling and() to combine them
	const subject = TestSubject.and(optionA, optionB);

	// Then: None is returned
	assertEquals(isolate(subject, "None"), true);
});

Deno.test("andThen() calls function when first is Some", () => {
	// Given: an Option with a Some variant
	const option = Some(10);

	// When: calling andThen() with a transformation function
	const subject = TestSubject.andThen(option, (x) => Some(x * 2));

	// Then: the function is applied and the transformed value is returned
	const result = match(subject)({
		Some: (value) => value,
		None: () => -1,
	});

	assertEquals(result, 20);
});

Deno.test("andThen() returns None when first is None", () => {
	// Given: an Option with a None variant
	const option = None<number>();

	// When: calling andThen() with a transformation function
	const subject = TestSubject.andThen(option, (x) => Some(x * 2));

	// Then: None is returned without calling the function
	assertEquals(isolate(subject, "None"), true);
});

Deno.test("andThen() can return None from function", () => {
	// Given: an Option with a Some variant
	const option = Some(10);

	// When: calling andThen() with a function that returns None
	const subject = TestSubject.andThen(option, () => None());

	// Then: None is returned
	assertEquals(isolate(subject, "None"), true);
});

Deno.test("andThen() is not called when first is None", () => {
	// Given: an Option with a None variant and a flag to track function calls
	const option = None<number>();
	let called = false;

	// When: calling andThen() with a function
	TestSubject.andThen(option, () => {
		called = true;
		return Some(0);
	});

	// Then: the function is not called
	assertEquals(called, false);
});

Deno.test("filter() keeps value that passes predicate", () => {
	// Given: an Option with a Some variant that satisfies a predicate
	const option = Some(10);

	// When: calling filter() with a predicate
	const subject = TestSubject.filter(option, (x) => x > 5);

	// Then: the value is kept and returned
	const result = match(subject)({
		Some: (value) => value,
		None: () => -1,
	});

	assertEquals(result, 10);
});

Deno.test("filter() returns None for value that fails predicate", () => {
	// Given: an Option with a Some variant that does not satisfy a predicate
	const option = Some(3);

	// When: calling filter() with a predicate
	const subject = TestSubject.filter(option, (x) => x > 5);

	// Then: None is returned
	assertEquals(isolate(subject, "None"), true);
});

Deno.test("filter() returns None when option is None", () => {
	// Given: an Option with a None variant
	const option = None<number>();

	// When: calling filter() with a predicate
	const subject = TestSubject.filter(option, (x) => x > 5);

	// Then: None is returned
	assertEquals(isolate(subject, "None"), true);
});

Deno.test("filter() works with type guards", () => {
	// Given: an Option with a Some variant containing a union type
	const option = Some<string | number>(42);

	// When: calling filter() with a type guard predicate
	const subject = TestSubject.filter(
		option,
		(x): x is number => typeof x === "number",
	);

	// Then: the value passes the type guard and is returned
	const result = match(subject)({
		Some: (value) => value,
		None: () => -1,
	});

	assertEquals(result, 42);
});

Deno.test("or() returns first when it is Some", () => {
	// Given: two Options, both with Some variants
	const optionA = Some(10);
	const optionB = Some(20);

	// When: calling or() to combine them
	const subject = TestSubject.or(optionA, optionB);

	// Then: the first option's value is returned
	const result = match(subject)({
		Some: (value) => value,
		None: () => -1,
	});

	assertEquals(result, 10);
});

Deno.test("or() returns second when first is None", () => {
	// Given: first Option is None, second is Some
	const optionA = None<number>();
	const optionB = Some(20);

	// When: calling or() to combine them
	const subject = TestSubject.or(optionA, optionB);

	// Then: the second option's value is returned
	const result = match(subject)({
		Some: (value) => value,
		None: () => -1,
	});

	assertEquals(result, 20);
});

Deno.test("or() returns None when both are None", () => {
	// Given: two Options, both with None variants
	const optionA = None<number>();
	const optionB = None<number>();

	// When: calling or() to combine them
	const subject = TestSubject.or(optionA, optionB);

	// Then: None is returned
	assertEquals(isolate(subject, "None"), true);
});

Deno.test("orElse() returns first when it is Some", () => {
	// Given: an Option with a Some variant and a flag to track function calls
	const option = Some(10);
	let called = false;

	// When: calling orElse() with a fallback function
	const subject = TestSubject.orElse(option, () => {
		called = true;
		return Some(20);
	});

	// Then: the original value is returned and the function is not called
	const result = match(subject)({
		Some: (value) => value,
		None: () => -1,
	});

	assertEquals(result, 10);
	assertEquals(called, false);
});

Deno.test("orElse() calls function when first is None", () => {
	// Given: an Option with a None variant
	const option = None<number>();

	// When: calling orElse() with a fallback function
	const subject = TestSubject.orElse(option, () => Some(20));

	// Then: the function is called and its result is returned
	const result = match(subject)({
		Some: (value) => value,
		None: () => -1,
	});

	assertEquals(result, 20);
});

Deno.test("orElse() can return None from function", () => {
	// Given: an Option with a None variant
	const option = None<number>();

	// When: calling orElse() with a function that returns None
	const subject = TestSubject.orElse(option, () => None());

	// Then: None is returned
	assertEquals(isolate(subject, "None"), true);
});

Deno.test("zip() combines two Some values", () => {
	// Given: two Options, both with Some variants
	const optionA = Some(10);
	const optionB = Some("hello");

	// When: calling zip() to combine them
	const subject = TestSubject.zip(optionA, optionB);

	// Then: a tuple of both values is returned
	const result = match(subject)({
		Some: (tuple) => tuple,
		None: () => null,
	});

	assertEquals(result, [10, "hello"]);
});

Deno.test("zip() returns None when first is None", () => {
	// Given: first Option is None, second is Some
	const optionA = None<number>();
	const optionB = Some("hello");

	// When: calling zip() to combine them
	const subject = TestSubject.zip(optionA, optionB);

	// Then: None is returned
	assertEquals(isolate(subject, "None"), true);
});

Deno.test("zip() returns None when second is None", () => {
	// Given: first Option is Some, second is None
	const optionA = Some(10);
	const optionB = None<string>();

	// When: calling zip() to combine them
	const subject = TestSubject.zip(optionA, optionB);

	// Then: None is returned
	assertEquals(isolate(subject, "None"), true);
});

Deno.test("zip() returns None when both are None", () => {
	// Given: two Options, both with None variants
	const optionA = None<number>();
	const optionB = None<string>();

	// When: calling zip() to combine them
	const subject = TestSubject.zip(optionA, optionB);

	// Then: None is returned
	assertEquals(isolate(subject, "None"), true);
});

Deno.test("zipWith() combines and transforms two Some values", () => {
	// Given: two Options, both with Some variants
	const optionA = Some(10);
	const optionB = Some(5);

	// When: calling zipWith() with a combining function
	const subject = TestSubject.zipWith(optionA, optionB, (a, b) => a + b);

	// Then: the values are combined using the function
	const result = match(subject)({
		Some: (value) => value,
		None: () => -1,
	});

	assertEquals(result, 15);
});

Deno.test("zipWith() returns None when first is None", () => {
	// Given: first Option is None, second is Some
	const optionA = None<number>();
	const optionB = Some(5);

	// When: calling zipWith() with a combining function
	const subject = TestSubject.zipWith(optionA, optionB, (a, b) => a + b);

	// Then: None is returned
	assertEquals(isolate(subject, "None"), true);
});

Deno.test("zipWith() returns None when second is None", () => {
	// Given: first Option is Some, second is None
	const optionA = Some(10);
	const optionB = None<number>();

	// When: calling zipWith() with a combining function
	const subject = TestSubject.zipWith(optionA, optionB, (a, b) => a + b);

	// Then: None is returned
	assertEquals(isolate(subject, "None"), true);
});

Deno.test("coalesce() returns value for Some", () => {
	// Given: an Option with a Some variant
	const option = Some(42);

	// When: calling coalesce() with a sentinel value
	const subject = TestSubject.coalesce(option, 0);

	// Then: the Some value is returned
	assertEquals(subject, 42);
});

Deno.test("coalesce() returns sentinel for None", () => {
	// Given: an Option with a None variant
	const option = None<number>();

	// When: calling coalesce() with a sentinel value
	const subject = TestSubject.coalesce(option, 999);

	// Then: the sentinel value is returned
	assertEquals(subject, 999);
});

Deno.test("coalesce() can work with different types", () => {
	// Given: an Option with a None variant
	const option = None<string>();

	// When: calling coalesce() with a sentinel value of a different type
	const subject = TestSubject.coalesce(option, null);

	// Then: the sentinel value is returned
	assertEquals(subject, null);
});

Deno.test("unzip() splits tuple Some into two Some values", () => {
	// Given: an Option with a Some variant containing a tuple
	const option = Some([42, "hello"] as [number, string]);

	// When: calling unzip() to split the tuple
	const [first, second] = TestSubject.unzip(option);

	// Then: two Some values are returned with the tuple elements
	const firstValue = match(first)({
		Some: (value) => value,
		None: () => -1,
	});

	const secondValue = match(second)({
		Some: (value) => value,
		None: () => null,
	});

	assertEquals(firstValue, 42);
	assertEquals(secondValue, "hello");
});

Deno.test("unzip() returns two None values for None", () => {
	// Given: an Option with a None variant
	const option = None<[number, string]>();

	// When: calling unzip() to split it
	const [first, second] = TestSubject.unzip(option);

	// Then: two None values are returned
	assertEquals(isolate(first, "None"), true);
	assertEquals(isolate(second, "None"), true);
});

Deno.test("flatten() unwraps nested Some", () => {
	// Given: an Option with a nested Some variant
	const option = Some(Some(42));

	// When: calling flatten() to unwrap it
	const subject = TestSubject.flatten(option);

	// Then: the inner value is returned
	const result = match(subject)({
		Some: (value) => value,
		None: () => -1,
	});

	assertEquals(result, 42);
});

Deno.test("flatten() returns None for Some(None)", () => {
	// Given: an Option with a Some variant containing None
	const option = Some(None<number>());

	// When: calling flatten() to unwrap it
	const subject = TestSubject.flatten(option);

	// Then: None is returned
	assertEquals(isolate(subject, "None"), true);
});

Deno.test("flatten() returns None for None", () => {
	// Given: an Option with a None variant
	const option = None<ReturnType<typeof Some<number>>>();

	// When: calling flatten() to unwrap it
	const subject = TestSubject.flatten(option);

	// Then: None is returned
	assertEquals(isolate(subject, "None"), true);
});

Deno.test("transpose() maps None to Ok(None)", () => {
	// Given: an Option with a None variant over a Result
	const option = None<ReturnType<typeof Ok<number, string>>>();

	// When: calling transpose()
	const subject = TestSubject.transpose(option);

	// Then: an Ok containing None is returned
	const inner = match(subject)({
		Ok: (value) => value,
		Err: () => Some(-1),
	});
	assertEquals(isolate(inner, "None"), true);
});

Deno.test("transpose() maps Some(Ok(x)) to Ok(Some(x))", () => {
	// Given: an Option containing a successful Result
	const option = Some(Ok<number, string>(5));

	// When: calling transpose()
	const subject = TestSubject.transpose(option);

	// Then: an Ok containing Some of the value is returned
	const value = match(subject)({
		Ok: (inner) =>
			match(inner)({
				Some: (x) => x,
				None: () => -1,
			}),
		Err: () => -2,
	});
	assertEquals(value, 5);
});

Deno.test("transpose() maps Some(Err(e)) to Err(e)", () => {
	// Given: an Option containing a failed Result
	const option = Some(Err<number, string>("fail"));

	// When: calling transpose()
	const subject = TestSubject.transpose(option);

	// Then: the error is propagated as an Err
	const error = match(subject)({
		Ok: () => "not an error",
		Err: (err) => err,
	});
	assertEquals(error, "fail");
});
