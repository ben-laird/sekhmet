import { union } from "@sekhmet/enum/core/mini/exit";
import { isolate } from "@sekhmet/enum/core/mini/isolate";
import { Err, Ok } from "@sekhmet/enum/result/mini/core";
import { assertEquals, assertThrows } from "@std/assert";
import type { Vow } from "@/src/mini/core.ts";
import {
	fromPromise,
	map,
	resolved,
	vowWithResolver,
	wait,
	zip,
	zipWith,
} from "@/src/mini/impl.ts";

/** Reads a vow's state synchronously as `["Resolved", v]` or `["Pending"]`. */
function peek<T>(vow: Vow<T>): ["Resolved", T] | ["Pending"] {
	if (isolate(vow, "Resolved")) {
		const value: T = union(vow);
		return ["Resolved", value];
	}
	return ["Pending"];
}

Deno.test("resolved() is already Resolved", () => {
	// Given: a value
	const value = { n: 1 };

	// When: lifting it into a vow
	const vow = resolved(value);

	// Then: the vow holds that value
	assertEquals(peek(vow), ["Resolved", value]);
});

Deno.test("vowWithResolver() defers resolution to the returned resolver", () => {
	// Given: a deferred vow
	const { vow, resolve } = vowWithResolver<string>();
	const before = peek(vow);

	// When: resolving it externally
	resolve("done");

	// Then: it moves from Pending to Resolved
	assertEquals(before, ["Pending"]);
	assertEquals(peek(vow), ["Resolved", "done"]);
});

Deno.test("map() over a resolved vow resolves immediately", () => {
	// Given: a resolved vow
	const vow = resolved(5);

	// When: mapping it
	const mapped = map(vow, (n) => `Value is ${n}`);

	// Then: the result is resolved synchronously
	assertEquals(peek(mapped), ["Resolved", "Value is 5"]);
});

Deno.test("map() over a pending vow resolves when the source does", () => {
	// Given: a pending vow and a mapping
	const { vow, resolve } = vowWithResolver<number>();
	const mapped = map(vow, (n) => n * 2);
	const before = peek(mapped);

	// When: resolving the source
	resolve(21);

	// Then: the mapped vow resolves with the transformed value
	assertEquals(before, ["Pending"]);
	assertEquals(peek(mapped), ["Resolved", 42]);
});

Deno.test("map() runs the mapping exactly once", () => {
	// Given: a pending vow and a counting mapping
	const { vow, resolve } = vowWithResolver<number>();
	let calls = 0;
	map(vow, (n) => {
		calls++;
		return n;
	});

	// When: resolving the source twice
	resolve(1);
	resolve(2);

	// Then: the mapping ran once
	assertEquals(calls, 1);
});

Deno.test("map() propagates a throwing mapping to the resolver", () => {
	// Given: a pending vow mapped by a throwing function
	const { vow, resolve } = vowWithResolver<number>();
	const error = new Error("bad map");
	const mapped = map(vow, () => {
		throw error;
	});

	// When: resolving the source
	const thrown = assertThrows(() => resolve(1), AggregateError);

	// Then: the error surfaces and the mapped vow stays pending
	assertEquals(thrown.errors, [error]);
	assertEquals(peek(mapped), ["Pending"]);
});

Deno.test("map() obeys the functor laws", async (t) => {
	const inputs = [0, 1, -7, 42, Number.MAX_SAFE_INTEGER];
	const f = (n: number) => n + 1;
	const g = (n: number) => `${n}`;

	await t.step("identity: map(v, x => x) ≡ v", () => {
		for (const input of inputs) {
			// Given: resolved and deferred vows of the input
			const eager = resolved(input);
			const { vow: lazy, resolve } = vowWithResolver<number>();

			// When: mapping each with identity
			const mappedEager = map(eager, (x) => x);
			const mappedLazy = map(lazy, (x) => x);
			resolve(input);

			// Then: both equal the original
			assertEquals(peek(mappedEager), peek(eager));
			assertEquals(peek(mappedLazy), peek(lazy));
		}
	});

	await t.step("composition: map(map(v, f), g) ≡ map(v, x => g(f(x)))", () => {
		for (const input of inputs) {
			// Given: a deferred vow of the input
			const { vow, resolve } = vowWithResolver<number>();

			// When: mapping in two steps versus once with the composition
			const twoSteps = map(map(vow, f), g);
			const oneStep = map(vow, (x) => g(f(x)));
			resolve(input);

			// Then: both resolve to the same value
			assertEquals(peek(twoSteps), peek(oneStep));
			assertEquals(peek(oneStep), ["Resolved", `${input + 1}`]);
		}
	});
});

Deno.test("zip() pairs two vows", async (t) => {
	await t.step("both already resolved", () => {
		// Given: two resolved vows
		const a = resolved("Alice");
		const b = resolved(30);

		// When: zipping them
		const zipped = zip(a, b);

		// Then: the pair is resolved immediately
		assertEquals(peek(zipped), ["Resolved", ["Alice", 30]]);
	});

	for (const order of ["first-then-second", "second-then-first"] as const) {
		await t.step(`both pending, resolved ${order}`, () => {
			// Given: two pending vows
			const a = vowWithResolver<string>();
			const b = vowWithResolver<number>();
			const zipped = zip(a.vow, b.vow);

			// When: resolving them one at a time
			if (order === "first-then-second") a.resolve("x");
			else b.resolve(1);
			const halfway = peek(zipped);
			if (order === "first-then-second") b.resolve(1);
			else a.resolve("x");

			// Then: the pair resolves only once both are resolved
			assertEquals(halfway, ["Pending"]);
			assertEquals(peek(zipped), ["Resolved", ["x", 1]]);
		});
	}

	await t.step("one resolved, one pending", () => {
		// Given: one resolved and one pending vow
		const a = resolved(true);
		const b = vowWithResolver<string>();
		const zipped = zip(a, b.vow);
		const halfway = peek(zipped);

		// When: resolving the pending one
		b.resolve("later");

		// Then: the pair resolves
		assertEquals(halfway, ["Pending"]);
		assertEquals(peek(zipped), ["Resolved", [true, "later"]]);
	});
});

Deno.test("zip() never resolves while one side stays pending", () => {
	// Given: one resolved and one forever-pending vow
	const zipped = zip(resolved(1), vowWithResolver<number>().vow);

	// When: inspecting the zipped vow
	const subject = peek(zipped);

	// Then: it is pending
	assertEquals(subject, ["Pending"]);
});

Deno.test("zipWith() ≡ map(zip(a, b), ([x, y]) => f(x, y))", () => {
	// Given: two deferred vows and a combining function
	const a = vowWithResolver<number>();
	const b = vowWithResolver<number>();
	const f = (price: number, qty: number) => price * qty;

	// When: combining with zipWith and with zip + map
	const viaZipWith = zipWith(a.vow, b.vow, f);
	const viaZipMap = map(zip(a.vow, b.vow), ([x, y]) => f(x, y));
	a.resolve(100);
	b.resolve(3);

	// Then: both resolve to the same value
	assertEquals(peek(viaZipWith), ["Resolved", 300]);
	assertEquals(peek(viaZipWith), peek(viaZipMap));
});

Deno.test("wait() bridges a vow to a promise", async (t) => {
	await t.step("already resolved", async () => {
		// Given: a resolved vow
		const vow = resolved(42);

		// When: awaiting it
		const value = await wait(vow);

		// Then: the promise yields the value
		assertEquals(value, 42);
	});

	await t.step("resolved later", async () => {
		// Given: a deferred vow being awaited
		const { vow, resolve } = vowWithResolver<string>();
		const pending = wait(vow);

		// When: resolving it
		resolve("hello");

		// Then: the promise yields the value
		assertEquals(await pending, "hello");
	});
});

Deno.test("fromPromise() settles with Ok once the promise fulfils", async () => {
	// Given: a promise under external control
	const { promise, resolve } = Promise.withResolvers<number>();
	const vow = fromPromise(promise);
	const before = peek(vow);

	// When: fulfilling the promise and letting the vow settle
	resolve(7);
	const settled = await wait(vow);

	// Then: the vow moves from Pending to Resolved with Ok(value)
	assertEquals(before, ["Pending"]);
	assertEquals(settled, Ok(7));
	assertEquals(peek(vow), ["Resolved", Ok(7)]);
});

Deno.test("fromPromise() settles with Err once the promise rejects", async () => {
	// Given: a promise under external control
	const { promise, reject } = Promise.withResolvers<number>();
	const vow = fromPromise(promise);

	// When: rejecting the promise and letting the vow settle
	const reason = new Error("rejected");
	reject(reason);
	const settled = await wait(vow);

	// Then: the vow resolves with Err(reason), and nothing leaks unhandled
	assertEquals(settled, Err(reason));
	assertEquals(peek(vow), ["Resolved", Err(reason)]);
});
