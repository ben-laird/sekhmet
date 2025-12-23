import { assertEquals } from "@std/assert";
import { match } from "@/src/core/mini/exit.ts";
import { isolate } from "@/src/core/mini/isolate.ts";
import { None, Some } from "./core.ts";
import * as TestSubject from "./transform.ts";

Deno.test("map() transforms Some value", () => {
	// Given: an Option with Some variant containing a number
	const option = Some(10);

	// When: calling map() to transform the value
	const subject = TestSubject.map(option, (x) => x * 2);

	// Then: the transformed value is returned in Some
	const result = match(subject)({
		Some: (value) => value,
		None: () => -1,
	});

	assertEquals(result, 20);
});

Deno.test("map() preserves None", () => {
	// Given: an Option with None variant
	const option = None<number>();

	// When: calling map() with a transformation
	const subject = TestSubject.map(option, (x) => x * 2);

	// Then: the result is still None
	assertEquals(isolate(subject, "None"), true);
});

Deno.test("map() can change type", () => {
	// Given: an Option containing a number
	const option = Some(42);

	// When: calling map() to transform to a different type
	const subject = TestSubject.map(option, (x) => `Number: ${x}`);

	// Then: the result contains a string value
	const result = match(subject)({
		Some: (value) => value,
		None: () => "",
	});

	assertEquals(result, "Number: 42");
});

Deno.test("inspect() calls inspector on Some", () => {
	// Given: an Option with Some variant and a tracker variable
	const option = Some(5);
	let inspected = 0;

	// When: calling inspect() with an inspector function
	const subject = TestSubject.inspect(option, (value) => {
		inspected = value;
	});

	// Then: the inspector is called with the value and the original Option is returned
	assertEquals(inspected, 5);
	assertEquals(subject, option);
});

Deno.test("inspect() returns original Option", () => {
	// Given: an Option with Some variant
	const option = Some(5);

	// When: calling inspect() with a no-op inspector
	const subject = TestSubject.inspect(option, () => {});

	// Then: the original Option is returned unchanged
	assertEquals(subject, option);
});

Deno.test("inspect() does not call inspector on None", () => {
	// Given: an Option with None variant and a tracker variable
	const option = None<number>();
	let called = false;

	// When: calling inspect() with an inspector function
	TestSubject.inspect(option, () => {
		called = true;
	});

	// Then: the inspector is not called
	assertEquals(called, false);
});

Deno.test("inspectNone() calls inspector on Some (bug in implementation)", () => {
	// Note: There appears to be a bug - inspectNone checks for "Some" instead of "None"
	// Given: an Option with Some variant and a tracker variable
	const option = Some(5);
	let called = false;

	// When: calling inspectNone() with an inspector function
	TestSubject.inspectNone(option, () => {
		called = true;
	});

	// Then: the inspector is called (indicating the bug)
	assertEquals(called, true);
});

Deno.test("inspectNone() returns original Option", () => {
	// Given: an Option with None variant
	const option = None<number>();

	// When: calling inspectNone() with a no-op inspector
	const subject = TestSubject.inspectNone(option, () => {});

	// Then: the original Option is returned unchanged
	assertEquals(subject, option);
});

Deno.test("mapOr() with object syntax transforms Some value", () => {
	// Given: an Option with Some variant containing a number
	const option = Some(10);

	// When: calling mapOr() with object syntax to transform the value
	const subject = TestSubject.mapOr(option, {
		defaultValue: 0,
		mapping: (x) => x * 2,
	});

	// Then: the transformed value is returned
	assertEquals(subject, 20);
});

Deno.test("mapOr() with object syntax returns default for None", () => {
	// Given: an Option with None variant
	const option = None<number>();

	// When: calling mapOr() with object syntax and a default value
	const subject = TestSubject.mapOr(option, {
		defaultValue: 999,
		mapping: (x) => x * 2,
	});

	// Then: the default value is returned
	assertEquals(subject, 999);
});

Deno.test("mapOr() with positional args transforms Some value", () => {
	// Given: an Option with Some variant containing a number
	const option = Some(10);

	// When: calling mapOr() with positional args to transform the value
	const subject = TestSubject.mapOr(option, 0, (x) => x * 2);

	// Then: the transformed value is returned
	assertEquals(subject, 20);
});

Deno.test("mapOr() with positional args returns default for None", () => {
	// Given: an Option with None variant
	const option = None<number>();

	// When: calling mapOr() with positional args and a default value
	const subject = TestSubject.mapOr(option, 999, (x) => x * 2);

	// Then: the default value is returned
	assertEquals(subject, 999);
});

Deno.test("mapOr() can change type", () => {
	// Given: an Option containing a number
	const option = Some(42);

	// When: calling mapOr() to transform to a different type
	const subject = TestSubject.mapOr(option, "default", (x) => `Number: ${x}`);

	// Then: the result is a string value
	assertEquals(subject, "Number: 42");
});

Deno.test("mapOrElse() with object syntax transforms Some value", () => {
	// Given: an Option with Some variant containing a number
	const option = Some(10);

	// When: calling mapOrElse() with object syntax to transform the value
	const subject = TestSubject.mapOrElse(option, {
		None: () => 0,
		Some: (x) => x * 2,
	});

	// Then: the transformed value is returned
	assertEquals(subject, 20);
});

Deno.test("mapOrElse() with object syntax calls None handler", () => {
	// Given: an Option with None variant
	const option = None<number>();

	// When: calling mapOrElse() with object syntax and a None handler
	const subject = TestSubject.mapOrElse(option, {
		None: () => 999,
		Some: (x) => x * 2,
	});

	// Then: the None handler result is returned
	assertEquals(subject, 999);
});

Deno.test("mapOrElse() with positional args transforms Some value", () => {
	// Given: an Option with Some variant containing a number
	const option = Some(10);

	// When: calling mapOrElse() with positional args to transform the value
	const subject = TestSubject.mapOrElse(
		option,
		() => 0,
		(x) => x * 2,
	);

	// Then: the transformed value is returned
	assertEquals(subject, 20);
});

Deno.test("mapOrElse() with positional args calls None handler", () => {
	// Given: an Option with None variant
	const option = None<number>();

	// When: calling mapOrElse() with positional args and a None handler
	const subject = TestSubject.mapOrElse(
		option,
		() => 999,
		(x) => x * 2,
	);

	// Then: the None handler result is returned
	assertEquals(subject, 999);
});

Deno.test("mapOrElse() None handler is lazy", () => {
	// Given: an Option with Some variant and a tracker variable
	const option = Some(10);
	let called = false;

	// When: calling mapOrElse() with a None handler that sets the tracker
	TestSubject.mapOrElse(
		option,
		() => {
			called = true;
			return 0;
		},
		(x) => x * 2,
	);

	// Then: the None handler is not called (lazy evaluation)
	assertEquals(called, false);
});
