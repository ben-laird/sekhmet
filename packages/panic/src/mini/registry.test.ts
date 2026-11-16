import {
	assert,
	assertEquals,
	assertFalse,
	assertStrictEquals,
} from "@std/assert";
import { Panic } from "@/src/mini/core.ts";
import { PanicMetadataRegistry } from "@/src/mini/registry.ts";

const makePanic = (message: string): Panic<null> =>
	new Panic({ message, cause: null });

Deno.test("PanicMetadataRegistry starts empty", () => {
	// Given: a new registry
	const registry = new PanicMetadataRegistry(() => 0);

	// When: inspecting it
	const { size } = registry;

	// Then: it holds nothing
	assertEquals(size, 0);
	assertEquals([...registry], []);
});

Deno.test("PanicMetadataRegistry.set() stores metadata built by the factory", () => {
	// Given: a registry whose factory records the panic message
	const registry = new PanicMetadataRegistry((p) => ({ seen: p.message }));
	const p = makePanic("boom");

	// When: registering the panic
	const returned = registry.set(p);

	// Then: set chains and the metadata is retrievable
	assertStrictEquals(returned, registry);
	assert(registry.has(p));
	assertEquals(registry.get(p), { seen: "boom" });
	assertEquals(registry.size, 1);
});

Deno.test("PanicMetadataRegistry.get() is undefined for unregistered panics", () => {
	// Given: an empty registry
	const registry = new PanicMetadataRegistry(() => 1);

	// When: looking up an unknown panic
	const subject = registry.get(makePanic("m"));

	// Then: nothing is found
	assertEquals(subject, undefined);
});

Deno.test("PanicMetadataRegistry.set() rebuilds metadata on re-registration", () => {
	// Given: a factory that counts invocations
	let calls = 0;
	const registry = new PanicMetadataRegistry(() => ++calls);
	const p = makePanic("m");

	// When: registering the same panic twice
	registry.set(p).set(p);

	// Then: metadata is replaced, and only one entry exists
	assertEquals(registry.get(p), 2);
	assertEquals(registry.size, 1);
});

Deno.test("PanicMetadataRegistry.getOrInsert() is idempotent", () => {
	// Given: a factory that counts invocations
	let calls = 0;
	const registry = new PanicMetadataRegistry(() => ++calls);
	const p = makePanic("m");

	// When: calling getOrInsert twice
	const first = registry.getOrInsert(p);
	const second = registry.getOrInsert(p);

	// Then: the factory ran once and both calls see the same metadata
	assertEquals(first, 1);
	assertEquals(second, 1);
	assertEquals(calls, 1);
});

Deno.test("PanicMetadataRegistry keys panics by id, not by message", () => {
	// Given: two panics with identical sources
	const registry = new PanicMetadataRegistry((p) => p.id);
	const a = makePanic("same");
	const b = makePanic("same");

	// When: registering only one
	registry.set(a);

	// Then: the other is not considered registered
	assert(registry.has(a));
	assertFalse(registry.has(b));
});

Deno.test("PanicMetadataRegistry.delete() removes a single entry", async (t) => {
	await t.step("registered panic", () => {
		// Given: a registry with two panics
		const registry = new PanicMetadataRegistry(() => 0);
		const a = makePanic("a");
		const b = makePanic("b");
		registry.set(a).set(b);

		// When: deleting one
		const deleted = registry.delete(a);

		// Then: it reports success and only the other remains
		assert(deleted);
		assertFalse(registry.has(a));
		assert(registry.has(b));
		assertEquals(registry.size, 1);
	});

	await t.step("unregistered panic", () => {
		// Given: an empty registry
		const registry = new PanicMetadataRegistry(() => 0);

		// When: deleting an unknown panic
		const deleted = registry.delete(makePanic("m"));

		// Then: it reports nothing removed
		assertFalse(deleted);
	});
});

Deno.test("PanicMetadataRegistry.clear() removes every entry", () => {
	// Given: a registry with entries
	const registry = new PanicMetadataRegistry(() => 0);
	registry.set(makePanic("a")).set(makePanic("b"));

	// When: clearing it
	registry.clear();

	// Then: it is empty
	assertEquals(registry.size, 0);
});

Deno.test("PanicMetadataRegistry iterates [id, metadata] pairs in insertion order", () => {
	// Given: a registry with two panics
	const registry = new PanicMetadataRegistry((p) => p.message);
	const a = makePanic("a");
	const b = makePanic("b");
	registry.set(a).set(b);

	// When: iterating via entries() and the iterator protocol
	const viaEntries = [...registry.entries()];
	const viaIterator = [...registry];

	// Then: both yield the same pairs in order
	const expected: [string, string][] = [
		[a.id, "a"],
		[b.id, "b"],
	];
	assertEquals(viaEntries, expected);
	assertEquals(viaIterator, expected);
});
