import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import { Err, Ok, type Result } from "./core.ts";
import { fallible, fallibleAsync } from "./fallible.ts";

Deno.test("fallible() turns fn's outcome into a Result", async (t) => {
	await t.step("a return is Ok", () => {
		// Given: a wrapped function that returns
		const double = fallible({
			fn: (n: number) => n * 2,
			parseErr: () => "unreachable",
		});

		// When: it is called
		const result = double(21);

		// Then: the return value is Ok
		assertEquals(result, Ok(42));
	});

	await t.step("a throw is Err of parseErr's value", () => {
		// Given: a wrapped function that throws, and a parser recording its input
		const seen: unknown[] = [];
		const boom = new Error("boom");
		const fail = fallible({
			fn: (_label: string, _count: number): number => {
				throw boom;
			},
			parseErr: ({ error, args }) => {
				seen.push(error, args);
				return "failed";
			},
		});

		// When: it is called
		const result = fail("a", 1);

		// Then: parseErr got the thrown value and the arguments, and its value is Err
		assertEquals(result, Err("failed"));
		assertEquals(seen, [boom, ["a", 1]]);
	});

	await t.step("a falsy throw is still Err", () => {
		// Given: a wrapped function that throws undefined
		const fail = fallible({
			fn: (): number => {
				throw undefined;
			},
			parseErr: ({ error }) => ({ error }),
		});

		// When: it is called
		const result = fail();

		// Then: the throw was captured all the same
		assertEquals(result, Err({ error: undefined }));
	});
});

Deno.test("fallible() runs cleanup in a finally block", async (t) => {
	await t.step("cleanup runs after a return, with the arguments", () => {
		// Given: a wrapped function logging each step
		const log: unknown[] = [];
		const wrapped = fallible({
			fn: (n: number) => {
				log.push("fn");
				return n;
			},
			parseErr: () => {
				log.push("parseErr");
				return "e";
			},
			cleanup: ({ args }) => {
				log.push(["cleanup", args]);
			},
		});

		// When: it returns
		const result = wrapped(7);

		// Then: cleanup ran after fn and parseErr never ran
		assertEquals(result, Ok(7));
		assertEquals(log, ["fn", ["cleanup", [7]]]);
	});

	await t.step("cleanup runs after parseErr when fn throws", () => {
		// Given: a throwing wrapped function logging each step
		const log: unknown[] = [];
		const wrapped = fallible({
			fn: (_n: number): number => {
				log.push("fn");
				throw new Error("boom");
			},
			parseErr: () => {
				log.push("parseErr");
				return "e";
			},
			cleanup: ({ args }) => {
				log.push(["cleanup", args]);
			},
		});

		// When: it throws
		const result = wrapped(7);

		// Then: the steps ran in try/catch/finally order
		assertEquals(result, Err("e"));
		assertEquals(log, ["fn", "parseErr", ["cleanup", [7]]]);
	});
});

Deno.test("fallible() lets parseErr and cleanup throws propagate", async (t) => {
	await t.step("a throw from parseErr propagates, after cleanup", () => {
		// Given: a parser that throws, and a cleanup that logs
		const log: string[] = [];
		const wrapped = fallible({
			fn: (): number => {
				throw new Error("from fn");
			},
			parseErr: (): string => {
				throw new Error("from parseErr");
			},
			cleanup: () => {
				log.push("cleanup");
			},
		});

		// When / Then: the call throws parseErr's error
		assertThrows(() => wrapped(), Error, "from parseErr");

		// Then: cleanup still ran
		assertEquals(log, ["cleanup"]);
	});

	await t.step("a throw from cleanup replaces an Ok", () => {
		// Given: a function that returns and a cleanup that throws
		const wrapped = fallible({
			fn: () => 1,
			parseErr: () => "e",
			cleanup: () => {
				throw new Error("from cleanup");
			},
		});

		// When / Then: the call throws cleanup's error
		assertThrows(() => wrapped(), Error, "from cleanup");
	});

	await t.step("a throw from cleanup replaces parseErr's throw", () => {
		// Given: a parser and a cleanup that both throw
		const wrapped = fallible({
			fn: (): number => {
				throw new Error("from fn");
			},
			parseErr: (): string => {
				throw new Error("from parseErr");
			},
			cleanup: () => {
				throw new Error("from cleanup");
			},
		});

		// When / Then: the call throws cleanup's error, as a finally block would
		assertThrows(() => wrapped(), Error, "from cleanup");
	});
});

Deno.test("fallibleAsync() turns fn's outcome into a Result", async (t) => {
	await t.step("a resolved value is Ok", async () => {
		// Given: a wrapped async function that resolves
		const double = fallibleAsync({
			fn: async (n: number) => {
				await Promise.resolve();
				return n * 2;
			},
			parseErr: () => "unreachable",
		});

		// When: it is called
		const result = await double(21);

		// Then: the resolved value is Ok
		assertEquals(result, Ok(42));
	});

	await t.step("a sync return is Ok", async () => {
		// Given: a wrapped sync function
		const double = fallibleAsync({
			fn: (n: number) => n * 2,
			parseErr: () => "unreachable",
		});

		// When: it is called
		const result = await double(21);

		// Then: the returned value is Ok
		assertEquals(result, Ok(42));
	});

	await t.step("a rejection is Err of parseErr's value", async () => {
		// Given: a wrapped function that rejects, and an async parser
		const seen: unknown[] = [];
		const boom = new Error("boom");
		const fail = fallibleAsync({
			fn: async (_id: number): Promise<string> => {
				await Promise.resolve();
				throw boom;
			},
			parseErr: async ({ error, args }) => {
				await Promise.resolve();
				seen.push(error, args);
				return "failed";
			},
		});

		// When: it is called
		const result = await fail(3);

		// Then: parseErr got the rejection and the arguments, and its value is Err
		assertEquals(result, Err("failed"));
		assertEquals(seen, [boom, [3]]);
	});

	await t.step("a sync throw is Err too", async () => {
		// Given: a wrapped function that throws before returning a promise
		const fail = fallibleAsync({
			fn: (): Promise<number> => {
				throw new Error("sync");
			},
			parseErr: ({ error }) => String(error),
		});

		// When: it is called
		const result = await fail();

		// Then: the sync throw was captured
		assertEquals(result, Err("Error: sync"));
	});
});

Deno.test("fallibleAsync() awaits cleanup in a finally block", async (t) => {
	await t.step("cleanup settles before the result, after a value", async () => {
		// Given: a wrapped function with an async cleanup, logging each step
		const log: unknown[] = [];
		const wrapped = fallibleAsync({
			fn: async (n: number) => {
				await Promise.resolve();
				log.push("fn");
				return n;
			},
			parseErr: () => "e",
			cleanup: async ({ args }) => {
				await Promise.resolve();
				log.push(["cleanup", args]);
			},
		});

		// When: it resolves
		const result = await wrapped(7);
		log.push("result");

		// Then: cleanup finished before the result was delivered
		assertEquals(result, Ok(7));
		assertEquals(log, ["fn", ["cleanup", [7]], "result"]);
	});

	await t.step("cleanup runs after parseErr when fn rejects", async () => {
		// Given: a rejecting wrapped function logging each step
		const log: unknown[] = [];
		const wrapped = fallibleAsync({
			fn: async (_n: number): Promise<number> => {
				await Promise.resolve();
				log.push("fn");
				throw new Error("boom");
			},
			parseErr: async () => {
				await Promise.resolve();
				log.push("parseErr");
				return "e";
			},
			cleanup: async ({ args }) => {
				await Promise.resolve();
				log.push(["cleanup", args]);
			},
		});

		// When: it rejects
		const result = await wrapped(7);

		// Then: the steps ran in try/catch/finally order
		assertEquals(result, Err("e"));
		assertEquals(log, ["fn", "parseErr", ["cleanup", [7]]]);
	});
});

Deno.test("fallibleAsync() rejects when parseErr or cleanup fails", async (t) => {
	await t.step("a rejection from parseErr rejects, after cleanup", async () => {
		// Given: a parser that rejects, and a cleanup that logs
		const log: string[] = [];
		const wrapped = fallibleAsync({
			fn: (): Promise<number> => Promise.reject(new Error("from fn")),
			parseErr: (): Promise<string> => {
				return Promise.reject(new Error("from parseErr"));
			},
			cleanup: () => {
				log.push("cleanup");
			},
		});

		// When / Then: the call rejects with parseErr's error
		await assertRejects(() => wrapped(), Error, "from parseErr");

		// Then: cleanup still ran
		assertEquals(log, ["cleanup"]);
	});

	await t.step("a rejection from cleanup replaces an Ok", async () => {
		// Given: a function that resolves and a cleanup that rejects
		const wrapped = fallibleAsync({
			fn: () => Promise.resolve(1),
			parseErr: () => "e",
			cleanup: () => Promise.reject(new Error("from cleanup")),
		});

		// When / Then: the call rejects with cleanup's error
		await assertRejects(() => wrapped(), Error, "from cleanup");
	});

	await t.step(
		"a sync throw from cleanup replaces parseErr's rejection",
		async () => {
			// Given: a parser that rejects and a cleanup that throws
			const wrapped = fallibleAsync({
				fn: (): Promise<number> => Promise.reject(new Error("from fn")),
				parseErr: (): Promise<string> => {
					return Promise.reject(new Error("from parseErr"));
				},
				cleanup: () => {
					throw new Error("from cleanup");
				},
			});

			// When / Then: the call rejects with cleanup's error
			await assertRejects(() => wrapped(), Error, "from cleanup");
		},
	);
});

Deno.test("fallible() infers the arguments, value and error", () => {
	// Given: a wrapped function with typed parameters and a typed error
	const wrapped = fallible({
		fn: (text: string, radix: number) => Number.parseInt(text, radix),
		parseErr: ({ args }) => ({ input: args[0] }),
	});

	// When / Then: the wrapper keeps fn's parameters and infers U and E
	assertType<
		IsExact<
			typeof wrapped,
			(text: string, radix: number) => Result<number, { input: string }>
		>
	>(true);
	assertEquals(wrapped("ff", 16), Ok(255));
});

Deno.test("fallibleAsync() infers the resolved value and error", () => {
	// Given: async fn and parseErr
	const wrapped = fallibleAsync({
		fn: async (id: number) => {
			await Promise.resolve();
			return { id };
		},
		parseErr: async () => {
			await Promise.resolve();
			return "missing" as const;
		},
	});

	// When / Then: U and E are the awaited types, not promises
	assertType<
		IsExact<
			typeof wrapped,
			(id: number) => Promise<Result<{ id: number }, "missing">>
		>
	>(true);
});

Deno.test("fallible() rejects mismatched arguments", () => {
	// Given: a wrapped function of one number
	const wrapped = fallible({
		fn: (n: number) => n,
		parseErr: ({ args }) => {
			// @ts-expect-error args is [n: number], so it has no second element
			const second: number = args[1];
			return second;
		},
	});

	// When / Then: calling it with a string does not compile
	// @ts-expect-error the wrapper takes fn's parameters
	wrapped("1");

	// Then: a parseErr expecting other arguments does not compile
	fallible({
		fn: (n: number) => n,
		// @ts-expect-error parseErr's args are fn's, not [string]
		parseErr: ({ args }: { error: unknown; args: [string] }) => args[0],
	});
});

Deno.test("fallible callbacks see the arguments as readonly", () => {
	// Given: a function of an array
	const fn = (xs: number[]): number => {
		throw new Error(String(xs));
	};

	// When / Then: parseErr can't replace an argument cleanup will see
	fallible({
		fn,
		parseErr: ({ args }) => {
			// @ts-expect-error args is readonly
			args[0] = [];
			return 0;
		},
	});

	// When / Then: neither can fallibleAsync's parseErr
	fallibleAsync({
		fn,
		parseErr: ({ args }) => {
			// @ts-expect-error args is readonly
			args[0] = [];
			return 0;
		},
	});
});

Deno.test("fallible() does not forward this to fn", () => {
	// Given: a wrapped function that reports its this
	const wrapped = fallible({
		fn: function (this: unknown) {
			return this;
		},
		parseErr: () => "e",
	});
	const receiver = { wrapped };

	// When: it is called as a method
	const result = receiver.wrapped();

	// Then: fn ran without the receiver as its this
	assertEquals(result, Ok(undefined));
});

Deno.test("fallible() rejects async callbacks", () => {
	// Given: synchronous callbacks for the parts not under test
	const fn = (n: number) => n;
	const parseErr = () => "e";

	// When / Then: an async fn does not compile, rather than giving Ok(promise)
	// @ts-expect-error fn must not return a promise
	fallible({ fn: (n: number) => Promise.resolve(n), parseErr });

	// When / Then: an async parseErr does not compile, rather than Err(promise)
	// @ts-expect-error parseErr must not return a promise
	fallible({ fn, parseErr: () => Promise.resolve("e") });

	// When / Then: an async cleanup does not compile, since nothing awaits it
	// @ts-expect-error cleanup must not return a promise
	fallible({ fn, parseErr, cleanup: () => Promise.resolve() });

	// Then: the synchronous forms compile
	const wrapped = fallible({ fn, parseErr, cleanup: () => {} });
	assertEquals(wrapped(1), Ok(1));
});

Deno.test("fallible() can't wrap a caller's generic return type", () => {
	// Given: a caller generic in what its function returns
	function wrap<T>(g: () => T): (() => Result<T, string>) | undefined {
		// When / Then: it can't prove T isn't a promise, so this doesn't compile
		// @ts-expect-error NotPromise<T> stays unresolved for a generic T
		void fallible({ fn: g, parseErr: () => "e" });
		return undefined;
	}

	// Then: a concrete return type wraps as usual
	const concrete = fallible({ fn: () => 1, parseErr: () => "e" });
	assertEquals([wrap(() => 1), concrete()], [undefined, Ok(1)]);
});

Deno.test("fallible() accepts a cleanup returning void or a value", () => {
	// Given: cleanups that log, by expression body and by reference, and one
	// that returns a value
	const logged: unknown[] = [];
	const record = (entry: unknown): void => {
		logged.push(entry);
	};
	function log({ args }: { args: readonly [number] }): void {
		record(["log", ...args]);
	}
	const cleanups = [
		({ args }: { args: readonly [number] }) => record(["inline", ...args]),
		log,
		() => 1,
	];

	// When: each wraps the same function and it is called
	const results = cleanups.map((cleanup) => {
		return fallible({ fn: (n: number) => n, parseErr: () => "e", cleanup })(7);
	});

	// Then: every one compiled, ran, and left the outcome alone
	assertEquals(results, [Ok(7), Ok(7), Ok(7)]);
	assertEquals(logged, [
		["inline", 7],
		["log", 7],
	]);
});

Deno.test("fallible()'s wrapper is covariant in its Result", () => {
	// Given: a wrapper with a narrow value and error
	const narrow = fallible({
		fn: (n: number) => n,
		parseErr: () => "e" as const,
	});
	const wide = fallible({
		fn: (n: number): number | string => n,
		parseErr: (): string => "e",
	});

	// When / Then: widening its value and error is accepted
	const widened: (n: number) => Result<number | string, string> = narrow;

	// Then: narrowing a wide wrapper is rejected
	// @ts-expect-error a number | string value is not a number
	const narrowed: (n: number) => Result<number, "e"> = wide;

	// Then: widening still holds when checked after a rejection
	const widenedAgain: (n: number) => Result<unknown, unknown> = narrow;
	assertEquals(
		[widened(1), narrowed(1), widenedAgain(1)],
		[Ok(1), Ok(1), Ok(1)],
	);
});

/** A thenable that is not a `Promise`, settling as `settled` does. */
function thenable<T>(settled: Promise<T>): PromiseLike<T> {
	return {
		// biome-ignore lint/suspicious/noThenProperty: a thenable is the subject under test
		then: (onFulfilled, onRejected) => settled.then(onFulfilled, onRejected),
	};
}

Deno.test("fallibleAsync() adopts a thenable that is not a Promise", async (t) => {
	await t.step("a thenable that fulfills is Ok", async () => {
		// Given: fn returning a bare thenable rather than a Promise
		const wrapped = fallibleAsync({
			fn: (n: number) => thenable(Promise.resolve(n * 2)),
			parseErr: () => "e",
		});

		// When: it is called
		const result = await wrapped(21);

		// Then: the thenable was adopted and its value is Ok
		assertEquals(result, Ok(42));
	});

	await t.step("a thenable that rejects is Err", async () => {
		// Given: fn returning a bare thenable that rejects
		const wrapped = fallibleAsync({
			fn: () => thenable<number>(Promise.reject("bad")),
			parseErr: ({ error }) => ({ error }),
		});

		// When: it is called
		const result = await wrapped();

		// Then: the rejection reached parseErr
		assertEquals(result, Err({ error: "bad" }));
	});
});

Deno.test("fallibleAsync() rejects mismatched arguments", () => {
	// Given: a wrapped async function of one number
	const wrapped = fallibleAsync({
		fn: (n: number) => Promise.resolve(n),
		parseErr: ({ args }) => {
			// @ts-expect-error args is [n: number], so it has no second element
			const second: number = args[1];
			return second;
		},
	});

	// When / Then: calling it with a string does not compile
	// @ts-expect-error the wrapper takes fn's parameters
	void wrapped("1");

	// Then: a parseErr expecting other arguments does not compile
	fallibleAsync({
		fn: (n: number) => Promise.resolve(n),
		// @ts-expect-error parseErr's args are fn's, not [string]
		parseErr: ({ args }: { error: unknown; args: [string] }) => args[0],
	});
});

Deno.test("fallibleAsync()'s wrapper is covariant in its Result", async () => {
	// Given: a wrapper with a narrow value and error, and a wide one
	const narrow = fallibleAsync({
		fn: (n: number) => Promise.resolve(n),
		parseErr: () => "e" as const,
	});
	const wide = fallibleAsync({
		fn: (n: number): Promise<number | string> => Promise.resolve(n),
		parseErr: (): string => "e",
	});

	// When / Then: widening its value and error is accepted
	const widened: (n: number) => Promise<Result<number | string, string>> =
		narrow;

	// Then: narrowing a wide wrapper is rejected
	// @ts-expect-error a number | string value is not a number
	const narrowed: (n: number) => Promise<Result<number, "e">> = wide;

	// Then: widening still holds when checked after a rejection
	const widenedAgain: (n: number) => Promise<Result<unknown, unknown>> = narrow;
	const settled: unknown[] = await Promise.all([
		widened(1),
		narrowed(1),
		widenedAgain(1),
	]);
	assertEquals(settled, [Ok(1), Ok(1), Ok(1)]);
});
