import { assertEquals, assertRejects } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import { Err, Ok, type Result } from "./core.ts";
import { promiseResult } from "./promise.ts";

Deno.test("promiseResult() settles with the executor's outcome", async (t) => {
	await t.step("resolve gives Ok", async () => {
		// Given: an executor that resolves
		const promise = promiseResult<number, string>((resolve) => {
			resolve(42);
		});

		// When: the promise settles
		const result = await promise;

		// Then: it holds Ok of the value
		assertEquals(result, Ok(42));
	});

	await t.step("reject gives Err, and the promise still fulfills", async () => {
		// Given: an executor that rejects
		const promise = promiseResult<number, string>((_resolve, reject) => {
			reject("nope");
		});

		// When: the promise settles
		const result = await promise;

		// Then: it holds Err of the error
		assertEquals(result, Err("nope"));
	});

	await t.step("a later resolve settles it", async () => {
		// Given: an executor that resolves asynchronously
		const promise = promiseResult<string, never>((resolve) => {
			setTimeout(() => resolve("later"), 0);
		});

		// When: the promise settles
		const result = await promise;

		// Then: it holds Ok of the later value
		assertEquals(result, Ok("later"));
	});

	await t.step("the executor runs at once", () => {
		// Given: a flag the executor sets
		let ran = false;

		// When: the promise is built
		void promiseResult(() => {
			ran = true;
		});

		// Then: the executor already ran
		assertEquals(ran, true);
	});
});

Deno.test("promiseResult() keeps the first settlement", async (t) => {
	await t.step("a reject after a resolve is ignored", async () => {
		// Given: an executor that resolves, then rejects
		const promise = promiseResult<number, string>((resolve, reject) => {
			resolve(1);
			reject("late");
		});

		// When: the promise settles
		const result = await promise;

		// Then: the resolve won
		assertEquals(result, Ok(1));
	});

	await t.step("a resolve after a reject is ignored", async () => {
		// Given: an executor that rejects, then resolves
		const promise = promiseResult<number, string>((resolve, reject) => {
			reject("first");
			resolve(1);
		});

		// When: the promise settles
		const result = await promise;

		// Then: the reject won
		assertEquals(result, Err("first"));
	});
});

Deno.test("promiseResult() rejects when the executor throws", async (t) => {
	await t.step("a throw before settling rejects the promise", async () => {
		// Given: an executor that throws
		const promise = promiseResult<number, string>(() => {
			throw new Error("panic");
		});

		// When / Then: the promise rejects with the thrown error
		await assertRejects(() => promise, Error, "panic");
	});

	await t.step("a throw after settling is ignored", async () => {
		// Given: an executor that resolves, then throws
		const promise = promiseResult<number, string>((resolve) => {
			resolve(1);
			throw new Error("ignored");
		});

		// When: the promise settles
		const result = await promise;

		// Then: the resolve won
		assertEquals(result, Ok(1));
	});
});

Deno.test("promiseResult() types its Result from its type arguments", () => {
	// Given: an executor with explicit types, and one without
	const typed = promiseResult<number, string>((resolve) => {
		resolve(1);
	});
	const untyped = promiseResult((resolve) => {
		resolve(1);
	});

	// When / Then: the explicit types are kept, and the rest are unknown
	assertType<IsExact<typeof typed, Promise<Result<number, string>>>>(true);
	assertType<IsExact<typeof untyped, Promise<Result<unknown, unknown>>>>(true);
});

Deno.test("promiseResult() rejects settling with the wrong type", () => {
	// Given: an executor typed for numbers and string errors
	void promiseResult<number, string>((resolve, reject) => {
		// When / Then: resolving with a string does not compile
		// @ts-expect-error resolve takes T, a number
		resolve("1");

		// When / Then: rejecting with a number does not compile
		// @ts-expect-error reject takes E, a string
		reject(1);
	});
});

Deno.test("promiseResult() rejects resolving with a thenable", () => {
	// Given: a promise, which promiseResult's resolve would not adopt
	const pending = Promise.resolve(1);

	// When / Then: a promised T leaves resolve uncallable
	void promiseResult<Promise<number>, string>((resolve) => {
		// @ts-expect-error resolve takes NotPromise<T>, never for a promise
		resolve(pending);
	});

	// Then: the awaited value resolves as usual
	void promiseResult<number, string>((resolve) => {
		void pending.then((value) => {
			resolve(value);
		});
	});
});

Deno.test("promiseResult() can't resolve with a caller's generic T", () => {
	// Given: a caller generic in the value it resolves with
	function later<T>(value: T): void {
		void promiseResult<T, string>((resolve) => {
			// When / Then: it can't prove T isn't a promise, so this doesn't compile
			// @ts-expect-error NotPromise<T> stays unresolved for a generic T
			resolve(value);
		});
	}

	// Then: a concrete T resolves as usual
	later(1);
	void promiseResult<number, string>((resolve) => resolve(1));
});

Deno.test("promiseResult() accepts a void-returning executor", async () => {
	// Given: an expression-bodied executor, as new Promise accepts
	const promise = promiseResult<number, string>((resolve) => resolve(1));

	// When: the promise settles
	const result = await promise;

	// Then: it holds Ok of the value
	assertEquals(result, Ok(1));
});

Deno.test("promiseResult() treats an async executor as new Promise does", async (t) => {
	await t.step("one that resolves after an await settles", async () => {
		// Given: an async executor resolving once a promise fulfills
		const promise = promiseResult<number, string>(async (resolve) => {
			resolve(await Promise.resolve(1));
		});

		// When: the promise settles
		const result = await promise;

		// Then: it holds Ok of the value
		assertEquals(result, Ok(1));
	});
});

Deno.test("promiseResult()'s promise is covariant in its Result", async () => {
	// Given: a narrow promised Result and a wide one
	const narrow = promiseResult<1, "e">((resolve) => {
		resolve(1);
	});
	const wide = promiseResult<number, string>((resolve) => {
		resolve(1);
	});

	// When / Then: widening is accepted
	const widened: Promise<Result<number, string>> = narrow;

	// Then: narrowing is rejected
	// @ts-expect-error a Result<number, string> is not a Result<1, "e">
	const narrowed: Promise<Result<1, "e">> = wide;

	// Then: widening still holds when checked after a rejection
	const widenedAgain: Promise<Result<unknown, unknown>> = narrow;
	const settled: unknown[] = await Promise.all([
		widened,
		narrowed,
		widenedAgain,
	]);
	assertEquals(settled, [Ok(1), Ok(1), Ok(1)]);
});
