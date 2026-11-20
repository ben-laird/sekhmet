import { isNone, unwrap } from "@sekhmet/enum/option/mini";
import { assertEquals } from "@std/assert";
import { blockedBy, error, value } from "./accessors.ts";
import { Blocked, Cancelled, Failed, Skipped, Succeeded } from "./core.ts";

Deno.test("each accessor reads its own variant's payload", () => {
	// Given: one outcome for each payload
	const failure = new Error("boom");

	// When: each is read through its accessor
	// Then: the payload comes back as Some
	assertEquals(unwrap(value(Succeeded("dist"))), "dist");
	assertEquals(unwrap(error(Failed(failure))), failure);
	assertEquals(unwrap(blockedBy(Blocked(["lint"]))), ["lint"]);
});

Deno.test("an accessor is None for every other variant", () => {
	// Given: outcomes without the payload asked for
	// When: each is read through another variant's accessor
	// Then: the result is None
	assertEquals(isNone(value(Skipped())), true);
	assertEquals(isNone(error(Cancelled())), true);
	assertEquals(isNone(blockedBy(Succeeded(1))), true);
});
