import { Enum, union, unionKinds } from "@sekhmet/enum/core/mini";
import { assertEquals, assertInstanceOf, assertNotEquals } from "@std/assert";
import { AlreadyHandled, Attempt, Failed, Handled } from "./core.ts";

Deno.test("AlreadyHandled() holds the residue the issue already had", () => {
	// Given: a residue
	const residue = { port: 8080 };

	// When: building the attempt
	const attempt = AlreadyHandled(residue);

	// Then: it is an AlreadyHandled Attempt, an Enum, holding the residue
	assertInstanceOf(attempt, Attempt);
	assertInstanceOf(attempt, Enum);
	assertEquals(unionKinds(attempt), "AlreadyHandled");
	assertEquals(union(attempt), residue);
});

Deno.test("Handled() holds the residue this attempt switched the issue to", () => {
	// Given: a residue
	// When: building the attempt
	const attempt = Handled(8080);

	// Then: it is a Handled Attempt holding the residue
	assertInstanceOf(attempt, Attempt);
	assertEquals(unionKinds(attempt), "Handled");
	assertEquals(union(attempt), 8080);
});

Deno.test("Failed() holds the recovery's error", () => {
	// Given: an error
	// When: building the attempt
	const attempt = Failed("offline");

	// Then: it is a Failed Attempt holding the error
	assertInstanceOf(attempt, Attempt);
	assertEquals(unionKinds(attempt), "Failed");
	assertEquals(union(attempt), "offline");
});

Deno.test("attempts are equal by variant and payload", () => {
	// Given: attempts with the same and differing parts
	// When: comparing them structurally
	// Then: only a matching variant and payload are equal
	assertEquals(Handled(1), Handled(1));
	assertNotEquals(Handled(1), Handled(2));
	assertNotEquals(Handled(1), AlreadyHandled(1));
});

Deno.test("Attempt is covariant: a narrow attempt fits a wider type", () => {
	// Given: an attempt that never fails
	const handled: Attempt<number, never> = Handled(1);

	// When: it is viewed with wider type parameters
	const widened: Attempt<number | string, Error> = handled;

	// Then: it is the same value
	assertEquals(widened, handled);
});
