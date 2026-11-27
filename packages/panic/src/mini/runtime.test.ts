import { intoInner } from "@sekhmet/enum/either/mini";
import { expectReady } from "@sekhmet/enum/poll/mini";
import { Err as ResultErr } from "@sekhmet/enum/result/mini/core";
import { poll } from "@sekhmet/vow/mini/accessors";
import type { Vow } from "@sekhmet/vow/mini/core";
import { map, wait } from "@sekhmet/vow/mini/impl";
import { isPending, isResolved } from "@sekhmet/vow/mini/predicates";
import {
	assert,
	assertEquals,
	assertInstanceOf,
	assertStrictEquals,
	assertThrows,
} from "@std/assert";
import { stub } from "@std/testing/mock";
import { assertType, type IsExact } from "@std/testing/types";
import { Panic, panic } from "@/src/mini/core.ts";
import {
	defaultPanicHook,
	definePanicRuntime,
	isPanicHookFailure,
	type PanicHook,
	type PanicHookInfo,
	type PanicRuntime,
} from "@/src/mini/runtime.ts";
import { Ok, type Outcome } from "@/src/outcome/mini/core.ts";
import { recover, unwrapPanicked } from "@/src/outcome/mini/panic.ts";
import { isPanicked } from "@/src/outcome/mini/predicates.ts";
import { unwrapErr, unwrap as unwrapOk } from "@/src/outcome/mini/unwrap.ts";

/** A runtime whose hook records every report instead of printing it. */
function recordingRuntime(): {
	runtime: PanicRuntime;
	reports: PanicHookInfo[];
} {
	const runtime = definePanicRuntime();
	const reports: PanicHookInfo[] = [];
	runtime.setHook((info) => {
		reports.push(info);
	});
	return { runtime, reports };
}

const boom = (): Panic<null> => new Panic({ message: "boom", cause: null });

/**
 * A promise that keeps every promise its `then` returns, so a test can see
 * how the callbacks it was given settle, without an unhandled rejection.
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

/** The outcome of sync work, which a boundary settles before it returns. */
function settledNow<T>(vow: Vow<T>): T {
	return expectReady(poll(vow), "sync work settles before catchUnwind returns");
}

/** A PromiseLike that is not a Promise, settled by `executor`. */
function thenable<T>(
	executor: (
		resolve: (value: T) => void,
		reject: (reason: unknown) => void,
	) => void,
): PromiseLike<T> {
	return {
		// biome-ignore lint/suspicious/noThenProperty: a thenable is the subject under test
		then: (onFulfilled, onRejected) =>
			new Promise<T>(executor).then(onFulfilled, onRejected),
	};
}

Deno.test("catchUnwind() of a returning fn is Ok and reports nothing", () => {
	// Given: a runtime with a recording hook
	const { runtime, reports } = recordingRuntime();

	// When: catching a function that returns normally
	const caught = runtime.catchUnwind(() => 42);

	// Then: the vow is already settled with Ok of the value, and the hook never ran
	assert(isResolved(caught));
	assertEquals(settledNow(caught), Ok(42));
	assertEquals(reports, []);
});

Deno.test("catchUnwind() turns every throw into Panicked of the same payload", async (t) => {
	const payloads: [kind: string, payload: unknown][] = [
		["Panic", boom()],
		["Error", new TypeError("not a panic")],
		["string", "plain string"],
		["undefined", undefined],
	];

	for (const [kind, payload] of payloads) {
		await t.step(kind, () => {
			// Given: a runtime and a function that throws the payload
			const { runtime } = recordingRuntime();

			// When: catching it
			const result = settledNow(
				runtime.catchUnwind(() => {
					throw payload;
				}),
			);

			// Then: the result is Panicked holding that very payload
			assert(isPanicked(result));
			assertStrictEquals(unwrapPanicked(result), payload);
		});
	}
});

Deno.test("catchUnwind() infers the value type from sync and async work", () => {
	// Given: a runtime
	const { runtime } = recordingRuntime();

	// When: catching sync work, a promise, a thenable, any, and a divergence
	const sync = runtime.catchUnwind(() => 1);
	const promised = runtime.catchUnwind(() => Promise.resolve(1));
	const then = runtime.catchUnwind(() => thenable<number>((r) => r(1)));
	const parsed = runtime.catchUnwind(() => JSON.parse("1"));
	const diverged = runtime.catchUnwind(() => {
		return panic({ message: "m", cause: null });
	});

	// Then: each is a vow of an Outcome of the settled value
	assertType<IsExact<typeof sync, Vow<Outcome<number, never, unknown>>>>(true);
	assertType<IsExact<typeof promised, typeof sync>>(true);
	assertType<IsExact<typeof then, typeof sync>>(true);
	assertType<IsExact<typeof diverged, Vow<Outcome<never, never, unknown>>>>(
		true,
	);
	assertEquals(settledNow(parsed), Ok(1));
	assert(isPanicked(settledNow(diverged)));
});

Deno.test("catchUnwind() reports the payload and its stack to the hook once", () => {
	// Given: a runtime with a recording hook and a Panic
	const { runtime, reports } = recordingRuntime();
	const payload = boom();

	// When: catching a function that throws it
	runtime.catchUnwind(() => {
		throw payload;
	});

	// Then: the hook saw exactly that payload, with its stack
	assertEquals(reports.length, 1);
	assertStrictEquals(reports[0]?.payload, payload);
	assertStrictEquals(reports[0]?.stack, payload.stack);
});

Deno.test("catchUnwind() gives no stack for a non-Error payload", () => {
	// Given: a runtime with a recording hook
	const { runtime, reports } = recordingRuntime();

	// When: catching a thrown plain object
	runtime.catchUnwind(() => {
		throw { code: 7 };
	});

	// Then: the report carries no stack
	assertEquals(reports.length, 1);
	assertEquals(reports[0]?.stack, undefined);
});

Deno.test("Nested boundaries report a payload only at the innermost", () => {
	// Given: one runtime with a recording hook and a Panic
	const { runtime, reports } = recordingRuntime();
	const payload = boom();

	// When: an inner boundary catches it and the outer one re-catches it
	const outer = runtime.catchUnwind(() => {
		runtime.catchUnwind(() => {
			throw payload;
		});
		throw payload;
	});

	// Then: the hook ran once, and the outer boundary still holds the payload
	assertEquals(reports.length, 1);
	assertStrictEquals(unwrapPanicked(settledNow(outer)), payload);
});

Deno.test("Every runtime a payload passes through reports it once", () => {
	// Given: an outer and an inner runtime, each with a recording hook
	const outer = recordingRuntime();
	const inner = recordingRuntime();
	const payload = new Error("crosses runtimes");

	// When: the inner runtime catches it twice and the outer one twice
	outer.runtime.catchUnwind(() => {
		outer.runtime.catchUnwind(() => {
			inner.runtime.catchUnwind(() => {
				inner.runtime.catchUnwind(() => {
					throw payload;
				});
				throw payload;
			});
			throw payload;
		});
		throw payload;
	});

	// Then: each runtime's hook saw it exactly once
	assertEquals(inner.reports.length, 1);
	assertEquals(outer.reports.length, 1);
});

Deno.test("Reporting never mutates the payload", () => {
	// Given: a runtime and an Error payload
	const { runtime } = recordingRuntime();
	const payload = new Error("untouched");
	const keysBefore = Reflect.ownKeys(payload);

	// When: the runtime catches and reports it
	runtime.catchUnwind(() => {
		throw payload;
	});

	// Then: the payload has exactly the own keys it had before
	assertEquals(Reflect.ownKeys(payload), keysBefore);
});

Deno.test("A frozen object payload is reported once per runtime", () => {
	// Given: a runtime and a frozen payload
	const { runtime, reports } = recordingRuntime();
	const payload = Object.freeze(new Error("frozen"));

	// When: an inner boundary catches it and an outer one re-catches it
	runtime.catchUnwind(() => {
		runtime.catchUnwind(() => {
			throw payload;
		});
		throw payload;
	});

	// Then: the hook ran once
	assertEquals(reports.length, 1);
});

Deno.test("Nested async boundaries report a payload once", async () => {
	// Given: a runtime with a recording hook and a Panic
	const { runtime, reports } = recordingRuntime();
	const payload = boom();

	// When: an inner async boundary catches it and an outer one re-catches it
	const outer = await wait(
		runtime.catchUnwind(async () => {
			await wait(runtime.catchUnwind(() => Promise.reject(payload)));
			throw payload;
		}),
	);

	// Then: the hook ran once and the outer boundary holds the payload
	assertEquals(reports.length, 1);
	assertStrictEquals(unwrapPanicked(outer), payload);
});

Deno.test("resumeUnwind() hands the outer boundary the same payload without re-reporting", () => {
	// Given: a runtime with a recording hook and a Panic
	const { runtime, reports } = recordingRuntime();
	const payload = boom();

	// When: an inner boundary catches it and resumes the unwind outward
	const outer = runtime.catchUnwind(() => {
		const inner = runtime.catchUnwind(() => {
			throw payload;
		});
		runtime.resumeUnwind(unwrapPanicked(settledNow(inner)));
	});

	// Then: the outer boundary holds the same payload, reported once
	assertStrictEquals(unwrapPanicked(settledNow(outer)), payload);
	assertEquals(reports.length, 1);
});

Deno.test("resumeUnwind() throws the payload unchanged and never reports", () => {
	// Given: a runtime with a recording hook and a fresh payload
	const { runtime, reports } = recordingRuntime();
	const payload = boom();

	// When: resuming the unwind outside any boundary
	const thrown = assertThrows(() => runtime.resumeUnwind(payload));

	// Then: the same payload is thrown and the hook never ran
	assertStrictEquals(thrown, payload);
	assertEquals(reports, []);
});

Deno.test("resumeUnwind() of a fresh payload is never reported by its own runtime", () => {
	// Given: a runtime with a recording hook
	const { runtime, reports } = recordingRuntime();

	// When: a boundary of that runtime catches a payload it never saw
	runtime.catchUnwind(() => runtime.resumeUnwind(new Error("fresh")));

	// Then: the hook never ran
	assertEquals(reports, []);
});

Deno.test("resumeUnwind() into another runtime is reported there once", () => {
	// Given: runtimes A and B, each with a recording hook
	const a = recordingRuntime();
	const b = recordingRuntime();

	// When: A resumes a payload into B's boundary
	b.runtime.catchUnwind(() => a.runtime.resumeUnwind(new Error("handed off")));

	// Then: B, which never saw it, reports it; A does not
	assertEquals(a.reports, []);
	assertEquals(b.reports.length, 1);
});

Deno.test("Primitive payloads are reported at every boundary that catches them", async (t) => {
	const payloads: [kind: string, payload: unknown][] = [
		["string", "plain string"],
		["undefined", undefined],
	];

	for (const [kind, payload] of payloads) {
		await t.step(kind, () => {
			// Given: a runtime with a recording hook
			const { runtime, reports } = recordingRuntime();

			// When: an inner boundary catches it and resumes it outward
			runtime.catchUnwind(() => {
				const inner = runtime.catchUnwind(() => {
					throw payload;
				});
				runtime.resumeUnwind(unwrapPanicked(settledNow(inner)));
			});

			// Then: both boundaries reported it
			assertEquals(reports.length, 2);
		});
	}
});

Deno.test("Hostile payloads are recovered, reported and never mistaken for a hook failure", async (t) => {
	const fail = (): never => {
		throw new Error("trap");
	};
	const revoked = Proxy.revocable({}, {});
	revoked.revoke();
	const payloads: [kind: string, payload: unknown][] = [
		["revoked Proxy", revoked.proxy],
		["throwing getPrototypeOf", new Proxy({}, { getPrototypeOf: fail })],
		["throwing get on an Error", new Proxy(new Error("x"), { get: fail })],
		["throwing defineProperty", new Proxy({}, { defineProperty: fail })],
		[
			"throwing getOwnPropertyDescriptor",
			new Proxy({}, { getOwnPropertyDescriptor: fail }),
		],
	];

	for (const [kind, payload] of payloads) {
		await t.step(kind, () => {
			// Given: a runtime with a recording hook
			const { runtime, reports } = recordingRuntime();

			// When: a boundary catches the hostile payload twice
			const result = settledNow(
				runtime.catchUnwind(() => {
					throw payload;
				}),
			);
			runtime.catchUnwind(() => {
				throw payload;
			});

			// Then: it is Panicked of that payload, reported once with no stack
			assertStrictEquals(unwrapPanicked(result), payload);
			assertEquals(reports.length, 1);
			assertStrictEquals(reports[0]?.payload, payload);
			assertEquals(reports[0]?.stack, undefined);
		});
	}
});

Deno.test("Two runtimes are isolated", () => {
	// Given: runtimes A and B, each with its own recording hook
	const a = recordingRuntime();
	const b = recordingRuntime();

	// When: B catches a panic
	b.runtime.catchUnwind(() => panic({ message: "in B", cause: null }));

	// Then: A's hook never saw it
	assertEquals(a.reports, []);
	assertEquals(b.reports.length, 1);
});

Deno.test("takeHook() returns the current hook and restores the default", () => {
	// Given: a runtime with a custom hook
	const runtime = definePanicRuntime();
	const custom: PanicHook = () => {};
	runtime.setHook(custom);

	// When: taking the hook twice
	const first = runtime.takeHook();
	const second = runtime.takeHook();

	// Then: the first take is the custom hook, the second the default
	assertStrictEquals(first, custom);
	assertStrictEquals(second, defaultPanicHook);
});

Deno.test("A new runtime starts with the default hook", () => {
	// Given: a fresh runtime
	const runtime = definePanicRuntime();

	// When: taking its hook
	const hook = runtime.takeHook();

	// Then: it is the default hook
	assertStrictEquals(hook, defaultPanicHook);
});

Deno.test("Chained hooks both run, the new one first", () => {
	// Given: a runtime with a first hook, then a second chained onto it
	const runtime = definePanicRuntime();
	const calls: string[] = [];
	runtime.setHook(() => {
		calls.push("first");
	});
	const previous = runtime.takeHook();
	runtime.setHook((info) => {
		calls.push("second");
		previous(info);
	});

	// When: a panic is caught
	runtime.catchUnwind(() => panic({ message: "m", cause: null }));

	// Then: both hooks ran, in chain order
	assertEquals(calls, ["second", "first"]);
});

Deno.test("A throwing hook panics out of the boundary", async (t) => {
	await t.step("the boundary throws a PanicHook panic", () => {
		// Given: a runtime whose hook throws
		const runtime = definePanicRuntime();
		const hookError = new Error("hook broke");
		runtime.setHook(() => {
			throw hookError;
		});
		const payload = boom();

		// When: the boundary catches an unwind
		const thrown = assertThrows(() =>
			runtime.catchUnwind(() => {
				throw payload;
			}),
		);

		// Then: a Panic escapes, carrying both the payload and the hook's throw
		assertInstanceOf(thrown, Panic);
		assertEquals(thrown.name, "Panic (PanicHook)");
		assertEquals(thrown.cause, { payload, thrown: hookError });
	});

	await t.step("the original payload stays reported in that runtime", () => {
		// Given: a runtime whose hook throws once, then records
		const runtime = definePanicRuntime();
		runtime.setHook(() => {
			throw new Error("hook broke");
		});
		const payload = boom();
		assertThrows(() =>
			runtime.catchUnwind(() => {
				throw payload;
			}),
		);
		const reports: PanicHookInfo[] = [];
		runtime.setHook((info) => {
			reports.push(info);
		});

		// When: the same runtime catches the original payload again
		const result = settledNow(
			runtime.catchUnwind(() => {
				throw payload;
			}),
		);

		// Then: it is recovered without being reported a second time
		assertStrictEquals(unwrapPanicked(result), payload);
		assertEquals(reports, []);
	});

	await t.step("an outer boundary reports and catches it", () => {
		// Given: an outer runtime with a recording hook around a throwing one
		const outer = recordingRuntime();
		const inner = definePanicRuntime();
		inner.setHook(() => {
			throw new Error("hook broke");
		});
		const payload = boom();

		// When: the inner boundary's hook throws
		const result = outer.runtime.catchUnwind(() => {
			return inner.catchUnwind(() => {
				throw payload;
			});
		});

		// Then: the outer boundary reports the PanicHook panic, not the payload
		const caught = unwrapPanicked(settledNow(result));
		assertInstanceOf(caught, Panic);
		assertEquals(caught.name, "Panic (PanicHook)");
		assertEquals(outer.reports.length, 1);
		assertStrictEquals(outer.reports[0]?.payload, caught);
	});
});

Deno.test("isPanicHookFailure() recognizes only a boundary's hook-failure panic", async (t) => {
	await t.step("the panic a boundary throws when its hook throws", () => {
		// Given: a runtime whose hook throws, and a payload
		const runtime = definePanicRuntime();
		const hookError = new Error("hook broke");
		runtime.setHook(() => {
			throw hookError;
		});
		const payload = boom();

		// When: the boundary's hook fails and the guard checks what escaped
		const thrown = assertThrows(() =>
			runtime.catchUnwind(() => {
				throw payload;
			}),
		);

		// Then: the guard accepts it and narrows the cause without a cast
		assert(isPanicHookFailure(thrown));
		assertStrictEquals(thrown.cause.payload, payload);
		assertStrictEquals(thrown.cause.thrown, hookError);
	});

	await t.step("look-alikes and other payloads", () => {
		// Given: a hand-made Panic with the same name and cause shape, and others
		const revoked = Proxy.revocable({}, {});
		revoked.revoke();
		const others: unknown[] = [
			new Panic({
				name: "PanicHook",
				message: "forged",
				cause: { payload: 1, thrown: 2 },
			}),
			new Error("plain"),
			"Panic (PanicHook)",
			undefined,
			revoked.proxy,
		];

		// When: the guard checks each
		const accepted = others.filter(isPanicHookFailure);

		// Then: it rejects them all, without throwing on the revoked Proxy
		assertEquals(accepted, []);
	});
});

Deno.test("catchUnwind() adopts async work", async (t) => {
	await t.step("a resolving promise settles Ok later", async () => {
		// Given: a runtime with a recording hook
		const { runtime, reports } = recordingRuntime();

		// When: catching a function that returns a resolving promise
		const caught = runtime.catchUnwind(() => Promise.resolve(7));

		// Then: the vow is pending, then settles Ok, and nothing was reported
		assert(isPending(caught));
		assertEquals(await wait(caught), Ok(7));
		assertEquals(reports, []);
	});

	await t.step("a rejection is Panicked, reported once", async () => {
		// Given: a runtime with a recording hook and a payload
		const { runtime, reports } = recordingRuntime();
		const payload = boom();

		// When: catching an async function that rejects with it
		const result = await wait(
			runtime.catchUnwind(() => Promise.reject(payload)),
		);

		// Then: the result is Panicked of the payload, reported once
		assertStrictEquals(unwrapPanicked(result), payload);
		assertEquals(reports.length, 1);
	});

	await t.step("a throw before any promise settles at once", () => {
		// Given: a runtime with a recording hook and a payload
		const { runtime, reports } = recordingRuntime();
		const payload = "thrown before any promise";

		// When: catching a function that throws before returning a promise
		const result = settledNow(
			runtime.catchUnwind((): Promise<number> => {
				throw payload;
			}),
		);

		// Then: the result is Panicked of the payload, reported once
		assertStrictEquals(unwrapPanicked(result), payload);
		assertEquals(reports.length, 1);
	});

	await t.step("a resolving thenable is Ok", async () => {
		// Given: a runtime and a thenable (not a Promise) that resolves
		const { runtime, reports } = recordingRuntime();

		// When: catching a function that returns it
		const result = await wait(
			runtime.catchUnwind(() => thenable<number>((resolve) => resolve(3))),
		);

		// Then: the result is Ok and nothing was reported
		assertEquals(result, Ok(3));
		assertEquals(reports, []);
	});

	await t.step("a rejecting thenable is Panicked", async () => {
		// Given: a runtime and a thenable that rejects with a payload
		const { runtime, reports } = recordingRuntime();
		const payload = boom();

		// When: catching a function that returns it
		const result = await wait(
			runtime.catchUnwind(() => {
				return thenable<number>((_resolve, reject) => reject(payload));
			}),
		);

		// Then: the result is Panicked of the payload, reported once
		assertStrictEquals(unwrapPanicked(result), payload);
		assertEquals(reports.length, 1);
	});

	await t.step("a thenable whose then throws is Panicked", async () => {
		// Given: a runtime and a thenable whose then method throws a payload
		const { runtime, reports } = recordingRuntime();
		const payload = boom();
		const hostile: PromiseLike<number> = {
			// biome-ignore lint/suspicious/noThenProperty: a thenable is the subject under test
			then: () => {
				throw payload;
			},
		};

		// When: catching a function that returns it
		const result = await wait(runtime.catchUnwind(() => hostile));

		// Then: the result is Panicked of the payload, reported once
		assertStrictEquals(unwrapPanicked(result), payload);
		assertEquals(reports.length, 1);
	});

	await t.step("a then getter that throws is Panicked at once", () => {
		// Given: a runtime and a value whose then getter throws a payload
		const { runtime, reports } = recordingRuntime();
		const payload = boom();
		const hostile = {
			// biome-ignore lint/suspicious/noThenProperty: a hostile then getter is the subject under test
			get then(): never {
				throw payload;
			},
		};

		// When: catching a function that returns it
		const result = settledNow(runtime.catchUnwind(() => hostile));

		// Then: reading then was user code, so it is Panicked, reported once
		assertStrictEquals(unwrapPanicked(result), payload);
		assertEquals(reports.length, 1);
	});

	await t.step("a thenable returned as data is flattened", async () => {
		// Given: a runtime and sync work whose value is a promise
		const { runtime } = recordingRuntime();
		const data = Promise.resolve("inner");

		// When: catching it bare, and boxed
		const bare = runtime.catchUnwind(() => data);
		const boxed = settledNow(runtime.catchUnwind(() => ({ data })));

		// Then: bare is adopted as await adopts it, and the box keeps the value
		assertEquals(await wait(bare), Ok("inner"));
		assertStrictEquals(unwrapOk(boxed).data, data);
	});
});

Deno.test("catchUnwind() follows a thenable a thenable fulfils with", async () => {
	// Given: a thenable that fulfils with another thenable
	const { runtime, reports } = recordingRuntime();
	const inner = thenable<number>((resolve) => resolve(5));
	// A non-conforming thenable: it hands over a thenable, not a value
	const outer = {
		// biome-ignore lint/suspicious/noThenProperty: a thenable is the subject under test
		then: (onFulfilled: (value: PromiseLike<number>) => void): void => {
			onFulfilled(inner);
		},
	};

	// When: catching a function that returns the outer one
	const result = await wait(runtime.catchUnwind<unknown>(() => outer));

	// Then: the inner thenable's value is the Ok, as await would give
	assertEquals(result, Ok(5));
	assertEquals(reports, []);
});

Deno.test("catchUnwind() heeds only a thenable's first callback", () => {
	// Given: a thenable that fulfils, then rejects, then throws
	const { runtime, reports } = recordingRuntime();
	const fickle: PromiseLike<number> = {
		// biome-ignore lint/suspicious/noThenProperty: a thenable is the subject under test
		then: (onFulfilled, onRejected) => {
			onFulfilled?.(1);
			onRejected?.(boom());
			throw boom();
		},
	};

	// When: catching a function that returns it
	const result = settledNow(runtime.catchUnwind(() => fickle));

	// Then: it settled with the first callback, at once, and reported nothing
	assertEquals(result, Ok(1));
	assertEquals(reports, []);
});

Deno.test("A hook that throws on async work escapes after the vow settles", async () => {
	// Given: a runtime whose hook throws, and async work over a watched promise
	const runtime = definePanicRuntime();
	runtime.setHook(() => {
		throw new Error("reporter offline");
	});
	const payload = boom();
	let fail!: (reason: unknown) => void;
	const source = new WatchedPromise<number>((_resolve, reject) => {
		fail = reject;
	});
	const caught = runtime.catchUnwind(() => source);

	// When: the promise rejects; the callback's promise is caught here, since
	// in a program nothing holds it and it would crash the process
	const [callback] = source.derived;
	assert(callback !== undefined);
	const escaped = callback.then(
		() => undefined,
		(reason: unknown) => reason,
	);
	fail(payload);
	const reason = await escaped;

	// Then: the vow settled as Panicked, and the Panic (PanicHook) escaped
	assertEquals(source.derived.length, 1);
	assertStrictEquals(unwrapPanicked(settledNow(caught)), payload);
	assert(isPanicHookFailure(reason));
	assertStrictEquals(reason.cause.payload, payload);
});

Deno.test("A hook that throws on a throwing dependent escapes its callback", async () => {
	// Given: a runtime whose hook throws, async work, and a throwing dependent
	const runtime = definePanicRuntime();
	runtime.setHook(() => {
		throw new Error("reporter offline");
	});
	let fulfil!: (value: number) => void;
	const source = new WatchedPromise<number>((resolve) => {
		fulfil = resolve;
	});
	const caught = runtime.catchUnwind(() => source);
	map(caught, () => {
		throw new Error("bad dependent");
	});

	// When: the promise fulfils, with the callback's promise caught here
	const [callback] = source.derived;
	assert(callback !== undefined);
	const escaped = callback.then(
		() => undefined,
		(reason: unknown) => reason,
	);
	fulfil(1);
	const reason = await escaped;

	// Then: the vow still resolved, and the Panic (PanicHook) escaped
	assertEquals(settledNow(caught), Ok(1));
	assert(isPanicHookFailure(reason));
	assertInstanceOf(reason.cause.payload, AggregateError);
});

Deno.test("Dependents of an async boundary's vow run inside it", async () => {
	// Given: a runtime with a recording hook and async work
	const { runtime, reports } = recordingRuntime();
	const bug = new Error("bad dependent");
	const caught = runtime.catchUnwind(() => Promise.resolve(1));
	const seen: unknown[] = [];

	// When: one dependent throws, and another records the outcome
	map(caught, () => {
		throw bug;
	});
	map(caught, (outcome) => seen.push(outcome));
	await wait(caught);

	// Then: every dependent ran, and the throw was reported, not left unhandled
	assertEquals(seen, [Ok(1)]);
	assertEquals(reports.length, 1);
	const reported = reports[0]?.payload;
	assertInstanceOf(reported, AggregateError);
	assertEquals(reported.errors, [bug]);
});

Deno.test("recover() converts a caught payload into an app error", () => {
	// Given: a runtime and an app-level conversion
	const { runtime } = recordingRuntime();
	const toAppError = (payload: unknown) => {
		return ResultErr(
			payload instanceof Panic ? `panic: ${payload.message}` : "unknown",
		);
	};

	// When: catching a panic and recovering from it
	const result = recover(
		settledNow(
			runtime.catchUnwind(() => panic({ message: "bad state", cause: null })),
		),
		toAppError,
	);

	// Then: the Err holds the converted value, on the handler's side
	assertEquals(intoInner(unwrapErr(result)), "panic: bad state");
});

Deno.test("defaultPanicHook writes a 'panicked:' report to console.error", async (t) => {
	await t.step("Error payload prints its own header once, then frames", () => {
		// Given: a stubbed console.error and a Panic with this engine's stack
		using error = stub(console, "error");
		const payload = boom();

		// When: the default hook reports it
		defaultPanicHook({ payload, stack: payload.stack });

		// Then: the first line is the header, whatever the engine's stack format,
		// and the engine's own header (if any) is not repeated below it
		assertEquals(error.calls.length, 1);
		const [header, next] = String(error.calls[0]?.args[0]).split("\n");
		assertEquals(header, "panicked: Panic: boom");
		assert(next === undefined || !next.endsWith(": boom"));
	});

	const stacks: [
		engine: string,
		payload: Error,
		stack: string,
		report: string,
	][] = [
		[
			"V8",
			boom(),
			"Panic: boom\n    at f (a.js:1:1)",
			"panicked: Panic: boom\n    at f (a.js:1:1)",
		],
		[
			"Bun, whose header names the base class",
			boom(),
			"Error: boom\n    at f (a.js:1:1)",
			"panicked: Panic: boom\n    at f (a.js:1:1)",
		],
		[
			"Firefox and WebKit, frames only",
			boom(),
			"f@a.js:1:1\n@a.js:2:1\n",
			"panicked: Panic: boom\nf@a.js:1:1\n@a.js:2:1",
		],
		[
			"a multi-line message",
			new Panic({ message: "one\ntwo", cause: null }),
			"Panic: one\ntwo\n    at f (a.js:1:1)",
			"panicked: Panic: one\ntwo\n    at f (a.js:1:1)",
		],
		[
			"a multi-line message, frames only",
			new Panic({ message: "one\ntwo", cause: null }),
			"f@a.js:1:1",
			"panicked: Panic: one\ntwo\nf@a.js:1:1",
		],
		["no frames", boom(), "Panic: boom", "panicked: Panic: boom"],
		[
			"an empty message (V8)",
			new Error(""),
			"Error\n    at f (a.js:1:1)",
			"panicked: Error\n    at f (a.js:1:1)",
		],
		[
			"an empty message, frames only",
			new Error(""),
			"f@a.js:1:1",
			"panicked: Error\nf@a.js:1:1",
		],
	];

	for (const [engine, payload, stack, report] of stacks) {
		await t.step(`stack format: ${engine}`, () => {
			// Given: a stubbed console.error and an Error with that stack format
			using error = stub(console, "error");

			// When: the default hook reports it
			defaultPanicHook({ payload, stack });

			// Then: the payload's header comes first, then the frames alone
			assertEquals(error.calls[0]?.args, [report]);
		});
	}

	await t.step("primitive payload prints as a string", () => {
		// Given: a stubbed console.error
		using error = stub(console, "error");

		// When: the default hook reports a symbol
		defaultPanicHook({ payload: Symbol("s"), stack: undefined });

		// Then: it prints the payload's string form
		assertEquals(error.calls[0]?.args, ["panicked: Symbol(s)"]);
	});

	await t.step("object payload is handed to the console to format", () => {
		// Given: a stubbed console.error and an object payload
		using error = stub(console, "error");
		const payload = Object.create(null);

		// When: the default hook reports it
		defaultPanicHook({ payload, stack: undefined });

		// Then: the object is passed through unformatted
		assertEquals(error.calls[0]?.args.length, 2);
		assertStrictEquals(error.calls[0]?.args[1], payload);
	});

	await t.step("a fresh runtime reports through it", () => {
		// Given: a stubbed console.error and a fresh runtime
		using error = stub(console, "error");
		const runtime = definePanicRuntime();

		// When: the runtime catches a panic
		runtime.catchUnwind(() => panic({ message: "default", cause: null }));

		// Then: the default hook printed one report
		assertEquals(error.calls.length, 1);
	});
});
