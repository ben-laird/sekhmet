import { assertEquals } from "@std/assert";
import { match } from "@/src/core/mini/exit.ts";
import { isolate } from "@/src/core/mini/isolate.ts";
import { None, Some } from "./core.ts";
import * as TestSubject from "./result.ts";

Deno.test("okOr() converts Some to Ok with value", () => {
	// Given: an Option with Some variant
	const option = Some(42);

	// When: calling okOr() to convert to Result
	const subject = TestSubject.okOr(option, "error");

	// Then: the value is wrapped in Ok variant
	const result = match(subject)({
		Ok: (value) => value,
		Err: () => -1,
	});

	assertEquals(result, 42);
});

Deno.test("okOr() converts None to Err with error", () => {
	// Given: an Option with None variant
	const option = None<number>();

	// When: calling okOr() to convert to Result
	const subject = TestSubject.okOr(option, "error message");

	// Then: the error is wrapped in Err variant
	const result = match(subject)({
		Ok: () => null,
		Err: (error) => error,
	});

	assertEquals(result, "error message");
});

Deno.test("okOr() works with different value types", () => {
	// Given: an Option with string value
	const stringOption = Some("hello");

	// When: calling okOr() with numeric error
	const subject = TestSubject.okOr(stringOption, 404);

	// Then: the string value is wrapped in Ok variant
	const result = match(subject)({
		Ok: (value) => value,
		Err: () => null,
	});

	assertEquals(result, "hello");
});

Deno.test("okOr() works with different error types", () => {
	// Given: a None option and an object error
	const option = None<string>();
	const errorObj = { code: 404, message: "Not found" };

	// When: calling okOr() with object error
	const subject = TestSubject.okOr(option, errorObj);

	// Then: the error object is wrapped in Err variant
	const result = match(subject)({
		Ok: () => null,
		Err: (error) => error,
	});

	assertEquals(result, errorObj);
});

Deno.test("okOrElse() converts Some to Ok with value", () => {
	// Given: an Option with Some variant and a tracking flag
	const option = Some(42);
	let called = false;

	// When: calling okOrElse() with error creator
	const subject = TestSubject.okOrElse(option, () => {
		called = true;
		return "error";
	});

	// Then: the value is wrapped in Ok variant and creator not called
	const result = match(subject)({
		Ok: (value) => value,
		Err: () => -1,
	});

	assertEquals(result, 42);
	assertEquals(called, false);
});

Deno.test("okOrElse() converts None to Err using creator", () => {
	// Given: an Option with None variant
	const option = None<number>();

	// When: calling okOrElse() with error creator
	const subject = TestSubject.okOrElse(option, () => "error message");

	// Then: the created error is wrapped in Err variant
	const result = match(subject)({
		Ok: () => null,
		Err: (error) => error,
	});

	assertEquals(result, "error message");
});

Deno.test("okOrElse() error creator is lazy", () => {
	// Given: an Option with Some variant and call counter
	const option = Some(42);
	let callCount = 0;

	// When: calling okOrElse() with counting error creator
	TestSubject.okOrElse(option, () => {
		callCount++;
		return "error";
	});

	// Then: the error creator is not called
	assertEquals(callCount, 0);
});

Deno.test("okOrElse() error creator is called for None", () => {
	// Given: an Option with None variant and call counter
	const option = None<number>();
	let callCount = 0;

	// When: calling okOrElse() with counting error creator
	TestSubject.okOrElse(option, () => {
		callCount++;
		return "error";
	});

	// Then: the error creator is called exactly once
	assertEquals(callCount, 1);
});

Deno.test("okOrElse() works with complex error creators", () => {
	// Given: an Option with None variant
	const option = None<string>();

	// When: calling okOrElse() with complex object creator
	const subject = TestSubject.okOrElse(option, () => {
		return { code: 404, timestamp: Date.now() };
	});

	// Then: the result is Err variant with object error
	assertEquals(isolate(subject, "Err"), true);

	const error = match(subject)({
		Ok: () => null,
		Err: (e) => e,
	});

	assertEquals(typeof error, "object");
});
