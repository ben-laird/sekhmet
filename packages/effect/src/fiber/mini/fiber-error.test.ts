import { union, unionKinds } from "@sekhmet/enum/core/mini/exit";
import { assertEquals, assertInstanceOf, assertNotEquals } from "@std/assert";
import {
	Cancelled,
	Failed,
	FiberError,
	Panicked,
} from "@/src/fiber/mini/fiber-error.ts";

Deno.test("Failed() carries the typed error", () => {
	// Given: a typed error
	const error = { code: 404 };

	// When: building a Failed fiber error
	const subject = Failed(error);

	// Then: it is a Failed FiberError carrying the error
	assertInstanceOf(subject, FiberError);
	assertEquals(unionKinds(subject), "Failed");
	assertEquals(union(subject), error);
});

Deno.test("Cancelled() carries no payload", () => {
	// Given: nothing
	// When: building a Cancelled fiber error
	const subject = Cancelled();

	// Then: it is a payload-free Cancelled FiberError
	assertInstanceOf(subject, FiberError);
	assertEquals(unionKinds(subject), "Cancelled");
	assertEquals(union(subject), undefined);
});

Deno.test("Panicked() carries the untyped exception", () => {
	// Given: a thrown exception
	const exception = new TypeError("boom");

	// When: building a Panicked fiber error
	const subject = Panicked(exception);

	// Then: it is a Panicked FiberError carrying the exception
	assertInstanceOf(subject, FiberError);
	assertEquals(unionKinds(subject), "Panicked");
	assertEquals(union(subject), exception);
});

Deno.test("FiberErrors are equal by variant and payload", () => {
	// Given: errors built from equal and differing parts
	// When: comparing them structurally
	// Then: only matching variant and payload are equal
	assertEquals(Failed("e"), Failed("e"));
	assertEquals(Cancelled(), Cancelled());
	assertNotEquals(Failed("e"), Panicked("e"));
	assertNotEquals<FiberError<undefined>>(Failed(undefined), Cancelled());
});
