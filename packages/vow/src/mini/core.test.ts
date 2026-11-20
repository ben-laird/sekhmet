import { match, union } from "@sekhmet/enum/core/mini/exit";
import { isolate } from "@sekhmet/enum/core/mini/isolate";
import {
	assert,
	assertEquals,
	assertInstanceOf,
	assertThrows,
} from "@std/assert";
import { type Resolver, type Subscribe, Vow } from "@/src/mini/core.ts";

/** The pending vow's subscribe function; fails the test if the vow is resolved. */
function subscribeOf<T>(vow: Vow<T>): Subscribe<T> {
	return match(vow)({
		Pending: (subscribe) => subscribe,
		Resolved: () => {
			throw new Error("expected a pending vow");
		},
	});
}

Deno.test("Vow resolved synchronously in its executor is Resolved", () => {
	// Given: an executor that resolves immediately
	const executor = (resolve: Resolver<number>) => resolve(42);

	// When: constructing the Vow
	const vow = new Vow(executor);

	// Then: it is already Resolved with the value
	assert(isolate(vow, "Resolved"));
	assertEquals(union(vow), 42);
});

Deno.test("Vow whose executor does not resolve stays Pending", () => {
	// Given: an executor that never resolves
	const executor = () => {};

	// When: constructing the Vow
	const vow = new Vow<number>(executor);

	// Then: it is Pending
	assert(isolate(vow, "Pending"));
});

Deno.test("Vow resolved later notifies dependents in registration order", () => {
	// Given: a pending vow with two dependents
	let resolve!: Resolver<string>;
	const vow = new Vow<string>((r) => {
		resolve = r;
	});
	const calls: string[] = [];
	const subscribe = subscribeOf(vow);
	subscribe((v) => calls.push(`first:${v}`));
	subscribe((v) => calls.push(`second:${v}`));

	// When: resolving it
	resolve("x");

	// Then: it is Resolved and each dependent ran once, in order
	assert(isolate(vow, "Resolved"));
	assertEquals(calls, ["first:x", "second:x"]);
});

Deno.test("Vow resolves at most once", () => {
	// Given: a pending vow with a dependent
	let resolve!: Resolver<number>;
	const vow = new Vow<number>((r) => {
		resolve = r;
	});
	let calls = 0;
	subscribeOf(vow)(() => calls++);

	// When: resolving twice with different values
	resolve(1);
	resolve(2);

	// Then: the first value wins and dependents are not re-notified
	assertEquals(union(vow), 1);
	assertEquals(calls, 1);
});

Deno.test("Vow aggregates errors thrown by dependents", () => {
	// Given: a pending vow with two throwing dependents and one healthy one
	let resolve!: Resolver<number>;
	const vow = new Vow<number>((r) => {
		resolve = r;
	});
	const first = new Error("first");
	const second = new Error("second");
	let healthyRan = false;
	const subscribe = subscribeOf(vow);
	subscribe(() => {
		throw first;
	});
	subscribe(() => {
		healthyRan = true;
	});
	subscribe(() => {
		throw second;
	});

	// When: resolving it
	const thrown = assertThrows(() => resolve(1));

	// Then: every dependent ran, the vow resolved, and both errors surface
	assertInstanceOf(thrown, AggregateError);
	assertEquals(thrown.errors, [first, second]);
	assert(healthyRan);
	assert(isolate(vow, "Resolved"));
});

Deno.test("Vow runs a dependent at once when subscribed after resolving", () => {
	// Given: the subscribe function of a vow that has since resolved
	let resolve!: Resolver<number>;
	const vow = new Vow<number>((r) => {
		resolve = r;
	});
	const subscribe = subscribeOf(vow);
	resolve(7);
	const seen: number[] = [];

	// When: subscribing through the stale function
	subscribe((v) => seen.push(v));

	// Then: the dependent ran at once with the value
	assertEquals(seen, [7]);
});

Deno.test("Vow is covariant in its value type", () => {
	// Given: vows of narrower value types
	const done = new Vow<undefined>((resolve) => resolve(undefined));
	const cause = new Vow<"a" | "b">((resolve) => resolve("a"));

	// When: assigning them to vows of wider value types
	const asVoid: Vow<void> = done;
	const asString: Vow<string> = cause;

	// Then: they type-check and are the same vows
	assertEquals(asVoid, done);
	assertEquals(asString, cause);
});

Deno.test("Vow is not contravariant in its value type", () => {
	// Given: a vow of a wider value type
	const wide = new Vow<string>((resolve) => resolve("c"));

	// When: assigning it to a vow of a narrower value type
	// @ts-expect-error: a Vow<string> is not a Vow<"a" | "b">
	const narrow: Vow<"a" | "b"> = wide;

	// Then: only the type checker objects; the value is the same vow
	assertEquals(narrow, wide);
});
