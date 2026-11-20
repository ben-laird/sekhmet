import { union } from "@sekhmet/enum/core/mini/exit";
import { isolate } from "@sekhmet/enum/core/mini/isolate";
import { Err, Ok } from "@sekhmet/enum/result/mini/core";
import {
	definePanicRuntime,
	isPanicHookFailure,
	type PanicHookInfo,
	type PanicRuntime,
} from "@sekhmet/panic";
import {
	assert,
	assertEquals,
	assertInstanceOf,
	assertThrows,
} from "@std/assert";
import type { Vow } from "@/src/mini/core.ts";
import {
	andThen,
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

/** A panic runtime whose hook records what it reports, instead of logging. */
function recordingPanics(): {
	panics: PanicRuntime;
	reported: PanicHookInfo[];
} {
	const panics = definePanicRuntime();
	const reported: PanicHookInfo[] = [];
	panics.setHook((info) => reported.push(info));
	return { panics, reported };
}

/**
 * A promise that keeps every promise its `then` returns, so a test can see
 * how the callbacks it was given settle.
 */
class WatchedPromise<T> extends Promise<T> {
	readonly derived: Promise<unknown>[] = [];

	// biome-ignore lint/suspicious/noThenProperty: it overrides Promise's own then
	override then<A = T, B = never>(
		onFulfilled?: ((value: T) => A | PromiseLike<A>) | null,
		onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
	): Promise<A | B> {
		const next = super.then(onFulfilled, onRejected);
		this.derived.push(next);
		return next;
	}
}

/** Waits a macrotask, so any unhandled rejection has been raised by now. */
function nextMacrotask(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
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

Deno.test("andThen() chains a vow-returning step", async (t) => {
	await t.step("waits for self, then for the step's vow", () => {
		// Given: a pending source and a pending second step
		const source = vowWithResolver<number>();
		const step = vowWithResolver<string>();
		const calls: number[] = [];

		// When: chaining them and resolving each in turn
		const chained = andThen(source.vow, (n) => {
			calls.push(n);
			return step.vow;
		});
		const beforeSource = peek(chained);
		source.resolve(3);
		const beforeStep = peek(chained);
		step.resolve("three");

		// Then: it resolves only after both, calling next once with the value
		assertEquals(beforeSource, ["Pending"]);
		assertEquals(beforeStep, ["Pending"]);
		assertEquals(peek(chained), ["Resolved", "three"]);
		assertEquals(calls, [3]);
	});

	await t.step("is synchronous when every step is", () => {
		// Given: a resolved source and a step returning a resolved vow
		const source = resolved(2);

		// When: chaining them
		const chained = andThen(source, (n) => resolved(n * 10));

		// Then: the result is already resolved
		assertEquals(peek(chained), ["Resolved", 20]);
	});

	await t.step("propagates a throwing step to the resolver", () => {
		// Given: a pending source whose step throws
		const { vow, resolve } = vowWithResolver<number>();
		const error = new Error("bad step");
		const chained = andThen(vow, (): Vow<number> => {
			throw error;
		});

		// When: resolving the source
		const thrown = assertThrows(() => resolve(1), AggregateError);

		// Then: the error surfaces and the chained vow stays pending
		assertEquals(thrown.errors, [error]);
		assertEquals(peek(chained), ["Pending"]);
	});
});

Deno.test("andThen() obeys the monad laws", async (t) => {
	const inputs = [0, 1, -7, 42];
	const f = (n: number): Vow<number> => resolved(n + 1);
	const g = (n: number): Vow<string> => {
		const { vow, resolve } = vowWithResolver<string>();
		resolve(`${n}`);
		return vow;
	};

	await t.step("left identity: andThen(resolved(a), f) ≡ f(a)", () => {
		for (const input of inputs) {
			// Given: an input and a vow-returning step
			const lifted = resolved(input);

			// When: chaining the lifted input versus applying the step
			const chained = andThen(lifted, g);
			const applied = g(input);

			// Then: both hold the same value
			assertEquals(peek(chained), peek(applied));
		}
	});

	await t.step("right identity: andThen(v, resolved) ≡ v", () => {
		for (const input of inputs) {
			// Given: a resolved and a deferred vow of the input
			const eager = resolved(input);
			const { vow: lazy, resolve } = vowWithResolver<number>();

			// When: chaining each with resolved
			const chainedEager = andThen(eager, resolved);
			const chainedLazy = andThen(lazy, resolved);
			const lazyBefore = peek(chainedLazy);
			resolve(input);

			// Then: each matches the original, pending and resolved alike
			assertEquals(peek(chainedEager), peek(eager));
			assertEquals(lazyBefore, ["Pending"]);
			assertEquals(peek(chainedLazy), peek(lazy));
		}
	});

	await t.step(
		"associativity: andThen(andThen(v, f), g) ≡ andThen(v, x => andThen(f(x), g))",
		() => {
			for (const input of inputs) {
				// Given: a deferred vow of the input
				const { vow, resolve } = vowWithResolver<number>();

				// When: nesting the chain to the left versus to the right
				const left = andThen(andThen(vow, f), g);
				const right = andThen(vow, (x) => andThen(f(x), g));
				resolve(input);

				// Then: both resolve to the same value
				assertEquals(peek(left), peek(right));
				assertEquals(peek(right), ["Resolved", `${input + 1}`]);
			}
		},
	);
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
	const { panics, reported } = recordingPanics();
	const vow = fromPromise({ promise, panics });
	const before = peek(vow);

	// When: fulfilling the promise and letting the vow settle
	resolve(7);
	const settled = await wait(vow);

	// Then: the vow moves from Pending to Resolved with Ok(value)
	assertEquals(before, ["Pending"]);
	assertEquals(settled, Ok(7));
	assertEquals(peek(vow), ["Resolved", Ok(7)]);
	assertEquals(reported, []);
});

Deno.test("fromPromise() settles with Err once the promise rejects", async () => {
	// Given: a promise under external control
	const { promise, reject } = Promise.withResolvers<number>();
	const { panics, reported } = recordingPanics();
	const vow = fromPromise({ promise, panics });

	// When: rejecting the promise and letting the vow settle
	const reason = new Error("rejected");
	reject(reason);
	const settled = await wait(vow);

	// Then: the vow resolves with Err(reason), not a panic, and nothing leaks
	assertEquals(settled, Err(reason));
	assertEquals(peek(vow), ["Resolved", Err(reason)]);
	assertEquals(reported, []);
});

Deno.test("fromPromise() reports a throwing dependent through the panic runtime", async () => {
	// Given: a fromPromise vow with a throwing dependent between two healthy ones (#59)
	const { promise, resolve } = Promise.withResolvers<number>();
	const { panics, reported } = recordingPanics();
	const vow = fromPromise({ promise, panics });
	const error = new Error("bad dependent");
	const seen: string[] = [];
	map(vow, () => seen.push("before"));
	map(vow, () => {
		throw error;
	});
	map(vow, () => seen.push("after"));

	// When: the promise fulfils, and a macrotask passes for any unhandled rejection
	resolve(1);
	const settled = await wait(vow);
	await nextMacrotask();

	// Then: the hook reported the AggregateError once, every other dependent
	// ran once, the vow resolved, and the test runner saw no unhandled rejection
	assertEquals(reported.length, 1);
	const payload = reported[0]?.payload;
	assertInstanceOf(payload, AggregateError);
	assertEquals(payload.errors, [error]);
	assertEquals(seen, ["before", "after"]);
	assertEquals(settled, Ok(1));
});

Deno.test("fromPromise() reports a throwing dependent of a rejected promise", async () => {
	// Given: a fromPromise vow whose dependent throws on any outcome
	const { promise, reject } = Promise.withResolvers<number>();
	const { panics, reported } = recordingPanics();
	const vow = fromPromise({ promise, panics });
	const error = new Error("bad dependent");
	map(vow, () => {
		throw error;
	});

	// When: the promise rejects, and a macrotask passes
	reject("offline");
	const settled = await wait(vow);
	await nextMacrotask();

	// Then: the rejection is still an Err, and the throw was reported, not leaked
	assertEquals(settled, Err("offline"));
	assertEquals(reported.length, 1);
	assertInstanceOf(reported[0]?.payload, AggregateError);
});

Deno.test("fromPromise() lets a hook that throws escape its then callback", async () => {
	// Given: a runtime whose hook throws, and a fromPromise vow over a watched
	// promise, with a throwing dependent
	const panics = definePanicRuntime();
	panics.setHook(() => {
		throw new Error("reporter offline");
	});
	let fulfil!: (value: number) => void;
	const source = new WatchedPromise<number>((resolve) => {
		fulfil = resolve;
	});
	const vow = fromPromise({ promise: source, panics });
	map(vow, () => {
		throw new Error("bad dependent");
	});

	// When: the promise fulfils; the then callback's promise is caught here,
	// since in a program nothing holds it and it would crash the process
	const [callback] = source.derived;
	assert(callback !== undefined);
	const escaped = callback.then(
		() => undefined,
		(reason: unknown) => reason,
	);
	fulfil(1);
	const reason = await escaped;

	// Then: fromPromise attached one then callback, which rejected with the
	// runtime's Panic (PanicHook), and the vow still resolved
	assertEquals(source.derived.length, 1);
	assert(isPanicHookFailure(reason));
	assertEquals(peek(vow), ["Resolved", Ok(1)]);
});
