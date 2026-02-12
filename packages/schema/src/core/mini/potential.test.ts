import { assertEquals } from "@std/assert";
import { match } from "@sekhmet/enum/core/mini/exit";
import { Async, from, map, Sync } from "./potential.ts";

Deno.test("Sync creates a synchronous Potential", () => {
	// Given: a value
	const value = 42;

	// When: wrapping it with Sync
	const potential = Sync(value);

	// Then: it should be a Sync variant
	const result = match(potential)({
		Sync: (v) => v,
		Async: () => {
			throw new Error("Should not be async");
		},
	});

	assertEquals(result, 42);
});

Deno.test("Async creates an asynchronous Potential", async () => {
	// Given: a promise
	const promise = Promise.resolve(42);

	// When: wrapping it with Async
	const potential = Async(promise);

	// Then: it should be an Async variant
	const result = await match(potential)({
		Sync: () => {
			throw new Error("Should not be sync");
		},
		Async: (p) => p,
	});

	assertEquals(result, 42);
});

Deno.test("from wraps synchronous values", () => {
	// Given: a synchronous value
	const value = "hello";

	// When: converting with from
	const potential = from(value);

	// Then: it should be a Sync variant
	const result = match(potential)({
		Sync: (v) => v,
		Async: () => {
			throw new Error("Should not be async");
		},
	});

	assertEquals(result, "hello");
});

Deno.test("from wraps promises", async () => {
	// Given: a promise
	const promise = Promise.resolve("world");

	// When: converting with from
	const potential = from(promise);

	// Then: it should be an Async variant
	const result = await match(potential)({
		Sync: () => {
			throw new Error("Should not be sync");
		},
		Async: (p) => p,
	});

	assertEquals(result, "world");
});

Deno.test("map transforms synchronous values synchronously", () => {
	// Given: a synchronous Potential
	const potential = Sync(10);

	// When: mapping with a synchronous function
	const mapped = map(potential, (n) => n * 2);

	// Then: the result should be synchronous
	const result = match(mapped)({
		Sync: (v) => v,
		Async: () => {
			throw new Error("Should not be async");
		},
	});

	assertEquals(result, 20);
});

Deno.test("map transforms synchronous values asynchronously when mapping returns promise", async () => {
	// Given: a synchronous Potential
	const potential = Sync(10);

	// When: mapping with an async function
	const mapped = map(potential, (n) => Promise.resolve(n * 2));

	// Then: the result should be asynchronous
	const result = await match(mapped)({
		Sync: () => {
			throw new Error("Should not be sync");
		},
		Async: (p) => p,
	});

	assertEquals(result, 20);
});

Deno.test("map transforms asynchronous values", async () => {
	// Given: an asynchronous Potential
	const potential = Async(Promise.resolve(10));

	// When: mapping with a synchronous function
	const mapped = map(potential, (n) => n * 2);

	// Then: the result should be asynchronous
	const result = await match(mapped)({
		Sync: () => {
			throw new Error("Should not be sync");
		},
		Async: (p) => p,
	});

	assertEquals(result, 20);
});
