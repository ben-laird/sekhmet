import { union } from "@sekhmet/enum/core/mini/exit";
import { isolate } from "@sekhmet/enum/core/mini/isolate";
import {
	assert,
	assertEquals,
	assertInstanceOf,
	assertThrows,
} from "@std/assert";
import { type Resolver, Vow } from "@/src/mini/core.ts";

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

	// Then: it is Pending with no dependents
	assert(isolate(vow, "Pending"));
	assertEquals(union(vow), []);
});

Deno.test("Vow resolved later notifies dependents in registration order", () => {
	// Given: a pending vow with two dependents
	let resolve!: Resolver<string>;
	const vow = new Vow<string>((r) => {
		resolve = r;
	});
	const calls: string[] = [];
	const deps = union(vow);
	if (Array.isArray(deps)) {
		deps.push((v) => calls.push(`first:${v}`));
		deps.push((v) => calls.push(`second:${v}`));
	}

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
	const deps = union(vow);
	if (Array.isArray(deps)) deps.push(() => calls++);

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
	const deps = union(vow);
	if (Array.isArray(deps)) {
		deps.push(() => {
			throw first;
		});
		deps.push(() => {
			healthyRan = true;
		});
		deps.push(() => {
			throw second;
		});
	}

	// When: resolving it
	const thrown = assertThrows(() => resolve(1));

	// Then: every dependent ran, the vow resolved, and both errors surface
	assertInstanceOf(thrown, AggregateError);
	assertEquals(thrown.errors, [first, second]);
	assert(healthyRan);
	assert(isolate(vow, "Resolved"));
});
