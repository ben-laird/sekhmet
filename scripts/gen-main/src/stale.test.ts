import { assertEquals } from "@std/assert";
import { isStale } from "./stale.ts";

Deno.test("isStale treats a missing file as stale", () => {
	// Given: no checked-in file
	const current = undefined;

	// When: comparing it to generated output
	const stale = isStale({ current, generated: "x\n" });

	// Then: it is stale
	assertEquals(stale, true);
});

Deno.test("isStale ignores line-ending differences", () => {
	// Given: the same content with CRLF and LF endings
	const current = "a\r\nb\r\n";

	// When: comparing them
	const stale = isStale({ current, generated: "a\nb\n" });

	// Then: it is not stale
	assertEquals(stale, false);
});

Deno.test("isStale flags any content difference", () => {
	// Given: checked-in content that differs from generated output
	const current = "export class A {}\n";

	// When: comparing them
	const stale = isStale({ current, generated: "export class B {}\n" });

	// Then: it is stale
	assertEquals(stale, true);
});
