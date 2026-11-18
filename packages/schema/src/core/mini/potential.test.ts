import { match, unionKinds } from "@sekhmet/enum/core/mini/exit";
import { assertEquals, assertInstanceOf } from "@std/assert";
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

Deno.test("from treats a non-Promise thenable as Async", async () => {
	// Given: a thenable that is not a Promise
	const thenable: PromiseLike<string> = {
		// biome-ignore lint/suspicious/noThenProperty: the test needs a thenable
		then: (onFulfilled, onRejected) =>
			Promise.resolve("thenable").then(onFulfilled, onRejected),
	};

	// When: converting with from
	const potential = from(thenable);

	// Then: it is Async, normalised to a real Promise that settles to the value
	const promise = match(potential)({
		Sync: () => {
			throw new Error("Should not be sync");
		},
		Async: (p) => p,
	});
	assertInstanceOf(promise, Promise);
	assertEquals(await promise, "thenable");
});

Deno.test("from treats values without a callable then as Sync", () => {
	// Given: values that are not promise-like
	const values: unknown[] = [
		null,
		undefined,
		0,
		"then",
		// biome-ignore lint/suspicious/noThenProperty: a non-callable then
		{ then: 42 },
		[],
	];

	for (const value of values) {
		// When: converting each with from
		const kind = unionKinds(from(value));

		// Then: each is Sync
		assertEquals(kind, "Sync");
	}
});
