import { None, Some } from "@sekhmet/enum/option/mini";
import { expectReady, Pending, Ready } from "@sekhmet/enum/poll/mini";
import { assertEquals } from "@std/assert";
import { poll, value } from "@/src/mini/accessors.ts";
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

Deno.test("poll() of a resolved vow is Ready with its value", () => {
	// Given: a resolved vow
	const vow = resolved({ id: 1 });

	// When: polling it
	const read = poll(vow);

	// Then: it is Ready with the value
	assertEquals(read, Ready({ id: 1 }));
});

Deno.test("poll() of a pending vow is Pending until it resolves", () => {
	// Given: a deferred vow
	const { vow, resolve } = vowWithResolver<string>();

	// When: polling it before and after resolving
	const before = poll(vow);
	resolve("done");
	const after = poll(vow);

	// Then: Pending while pending, then Ready with the value
	assertEquals(before, Pending());
	assertEquals(after, Ready("done"));
});

Deno.test("poll() of a synchronous chain unwraps with expectReady", () => {
	// Given: a chain whose every step is already resolved
	const chain = andThen(resolved(2), (n) => map(resolved(n), (m) => m * 10));

	// When: polling the end of the chain and expecting it ready
	const read = expectReady(poll(chain), "a synchronous chain is ready");

	// Then: the value is there at once
	assertEquals(read, 20);
});

Deno.test("poll() agrees with value() in every state", () => {
	// Given: a vow read while pending and again once resolved
	const { vow, resolve } = vowWithResolver<number>();

	// When: reading it both ways in each state
	const pendingReads = [poll(vow), value(vow)];
	resolve(7);
	const resolvedReads = [poll(vow), value(vow)];

	// Then: Pending pairs with None, and Ready(v) with Some(v)
	assertEquals(pendingReads, [Pending(), None()]);
	assertEquals(resolvedReads, [Ready(7), Some(7)]);
});
