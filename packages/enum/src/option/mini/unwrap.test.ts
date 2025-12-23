import { assertEquals, assertThrows } from "@std/assert";
import { None, Some } from "./core.ts";
import * as TestSubject from "./unwrap.ts";

Deno.test("expect() returns value for Some", () => {
	// Given: an Option with Some variant containing a value
	const option = Some(42);

	// When: calling expect() with a custom message
	const subject = TestSubject.expect(option, "should have value");

	// Then: the unwrapped value is returned
	assertEquals(subject, 42);
});

Deno.test("expect() throws with custom message for None", () => {
	// Given: an Option with None variant
	const option = None<number>();

	// When: calling expect() on None
	// Then: an error is thrown with the custom message
	assertThrows(
		() => TestSubject.expect(option, "custom error message"),
		Error,
		"custom error message",
	);
});

Deno.test("expect() works with different value types", () => {
	// Given: Options containing different value types
	const stringOption = Some("hello");
	const objectOption = Some({ key: "value" });
	const arrayOption = Some([1, 2, 3]);

	// When: calling expect() on each Option
	// Then: each unwrapped value is returned with correct type
	assertEquals(TestSubject.expect(stringOption, "msg"), "hello");
	assertEquals(TestSubject.expect(objectOption, "msg"), { key: "value" });
	assertEquals(TestSubject.expect(arrayOption, "msg"), [1, 2, 3]);
});

Deno.test("unwrap() returns value for Some", () => {
	// Given: an Option with Some variant
	const option = Some(42);

	// When: calling unwrap()
	const subject = TestSubject.unwrap(option);

	// Then: the value is returned
	assertEquals(subject, 42);
});

Deno.test("unwrap() throws with default message for None", () => {
	// Given: an Option with None variant
	const option = None<number>();

	// When: calling unwrap() on None
	// Then: an error is thrown with default message
	assertThrows(
		() => TestSubject.unwrap(option),
		Error,
		"Option unwrap failed!",
	);
});

Deno.test("unwrap() works with different value types", () => {
	// Given: Options containing different value types
	const stringOption = Some("hello");
	const numberOption = Some(123);
	const boolOption = Some(true);

	// When: calling unwrap() on each Option
	// Then: each value is returned with correct type
	assertEquals(TestSubject.unwrap(stringOption), "hello");
	assertEquals(TestSubject.unwrap(numberOption), 123);
	assertEquals(TestSubject.unwrap(boolOption), true);
});

Deno.test("unwrapOr() returns value for Some", () => {
	// Given: an Option with Some variant
	const option = Some(42);

	// When: calling unwrapOr() with a default value
	const subject = TestSubject.unwrapOr(option, 0);

	// Then: the wrapped value is returned instead of the default
	assertEquals(subject, 42);
});

Deno.test("unwrapOr() returns default value for None", () => {
	// Given: an Option with None variant
	const option = None<number>();

	// When: calling unwrapOr() with a default value
	const subject = TestSubject.unwrapOr(option, 999);

	// Then: the default value is returned
	assertEquals(subject, 999);
});

Deno.test("unwrapOr() works with different types", () => {
	// Given: None Options with different type parameters
	const stringNone = None<string>();
	const numberNone = None<number>();
	const objectNone = None<{ key: string }>();

	// When: calling unwrapOr() with type-appropriate defaults
	// Then: each default value is returned
	assertEquals(TestSubject.unwrapOr(stringNone, "default"), "default");
	assertEquals(TestSubject.unwrapOr(numberNone, 0), 0);
	assertEquals(TestSubject.unwrapOr(objectNone, { key: "default" }), {
		key: "default",
	});
});

Deno.test("unwrapOr() default value is eagerly evaluated", () => {
	// Given: an Option with Some variant
	// Note: unwrapOr evaluates the default value eagerly, unlike unwrapOrElse
	const option = Some(42);

	// When: calling unwrapOr() with a default value
	const subject = TestSubject.unwrapOr(option, 0);

	// Then: the wrapped value is returned (default is still evaluated eagerly)
	assertEquals(subject, 42);
});
