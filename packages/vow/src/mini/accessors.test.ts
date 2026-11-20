import { None, Some } from "@sekhmet/enum/option/mini";
import { assertEquals } from "@std/assert";
import { value } from "@/src/mini/accessors.ts";
import type { Vow } from "@/src/mini/core.ts";
import { andThen, map, resolved, vowWithResolver } from "@/src/mini/impl.ts";

Deno.test("value() of a resolved vow is Some of its value", () => {
	// Given: a resolved vow
	const vow = resolved({ id: 1 });

	// When: reading it
	const read = value(vow);

	// Then: it is Some of the value
	assertEquals(read, Some({ id: 1 }));
});

Deno.test("value() of a pending vow is None until it resolves", () => {
	// Given: a deferred vow
	const { vow, resolve } = vowWithResolver<string>();

	// When: reading it before and after resolving
	const before = value(vow);
	resolve("done");
	const after = value(vow);

	// Then: None while pending, then Some of the value
	assertEquals(before, None());
	assertEquals(after, Some("done"));
});

Deno.test("value() reads a synchronous chain without awaiting", () => {
	// Given: a chain whose every step is already resolved
	const chain = andThen(resolved(2), (n) => map(resolved(n), (m) => m * 10));

	// When: reading the end of the chain
	const read = value(chain);

	// Then: the value is there at once
	assertEquals(read, Some(20));
});

Deno.test("value() of a widened vow reads the narrower value", () => {
	// Given: a vow of a literal type, widened through covariance
	const vow: Vow<string> = resolved<"a" | "b">("a");

	// When: reading it
	const read = value(vow);

	// Then: it is Some of the literal
	assertEquals(read, Some("a"));
});
