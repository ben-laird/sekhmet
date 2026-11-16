import { Ok } from "@sekhmet/enum/result/mini/core";
import { isErr } from "@sekhmet/enum/result/mini/predicates";
import { mapErr } from "@sekhmet/enum/result/mini/transform";
import { unwrapErr } from "@sekhmet/enum/result/mini/unwrap";
import {
	assert,
	assertEquals,
	assertInstanceOf,
	assertMatch,
	assertRejects,
	assertStrictEquals,
	assertThrows,
} from "@std/assert";
import { stub } from "@std/testing/mock";
import { Panic, panic } from "@/src/mini/core.ts";
import {
	defaultPanicHook,
	definePanicRuntime,
	type PanicHook,
	type PanicHookInfo,
	type PanicRuntime,
} from "@/src/mini/runtime.ts";

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

Deno.test("catchUnwind() of a returning fn is Ok and reports nothing", () => {
	// Given: a runtime with a recording hook
	const { runtime, reports } = recordingRuntime();

	// When: catching a function that returns normally
	const result = runtime.catchUnwind(() => 42);

	// Then: the result is Ok of the value and the hook never ran
	assertEquals(result, Ok(42));
	assertEquals(reports, []);
});

Deno.test("catchUnwind() turns every throw into Err of the same payload", async (t) => {
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
			const result = runtime.catchUnwind(() => {
				throw payload;
			});

			// Then: the result is Err holding that very payload
			assert(isErr(result));
			assertStrictEquals(unwrapErr(result), payload);
		});
	}
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
	assertStrictEquals(unwrapErr(outer), payload);
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

Deno.test("Nested catchUnwindAsync boundaries report a payload once", async () => {
	// Given: a runtime with a recording hook and a Panic
	const { runtime, reports } = recordingRuntime();
	const payload = boom();

	// When: an inner async boundary catches it and an outer one re-catches it
	const outer = await runtime.catchUnwindAsync(async () => {
		await runtime.catchUnwindAsync(() => Promise.reject(payload));
		throw payload;
	});

	// Then: the hook ran once and the outer boundary holds the payload
	assertEquals(reports.length, 1);
	assertStrictEquals(unwrapErr(outer), payload);
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
		runtime.resumeUnwind(unwrapErr(inner));
	});

	// Then: the outer boundary holds the same payload, reported once
	assertStrictEquals(unwrapErr(outer), payload);
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
				runtime.resumeUnwind(unwrapErr(inner));
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
			const result = runtime.catchUnwind(() => {
				throw payload;
			});
			runtime.catchUnwind(() => {
				throw payload;
			});

			// Then: it is Err of that payload, reported once with no stack
			assertStrictEquals(unwrapErr(result), payload);
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
		const result = runtime.catchUnwind(() => {
			throw payload;
		});

		// Then: it is recovered without being reported a second time
		assertStrictEquals(unwrapErr(result), payload);
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
		const result = outer.runtime.catchUnwind(() =>
			inner.catchUnwind(() => {
				throw payload;
			}),
		);

		// Then: the outer boundary reports the PanicHook panic, not the payload
		const caught = unwrapErr(result);
		assertInstanceOf(caught, Panic);
		assertEquals(caught.name, "Panic (PanicHook)");
		assertEquals(outer.reports.length, 1);
		assertStrictEquals(outer.reports[0]?.payload, caught);
	});
});

Deno.test("catchUnwindAsync() covers resolve, rejection and synchronous throw", async (t) => {
	await t.step("resolve", async () => {
		// Given: a runtime with a recording hook
		const { runtime, reports } = recordingRuntime();

		// When: catching an async function that resolves
		const result = await runtime.catchUnwindAsync(() => Promise.resolve(7));

		// Then: the result is Ok and nothing was reported
		assertEquals(result, Ok(7));
		assertEquals(reports, []);
	});

	await t.step("rejection", async () => {
		// Given: a runtime with a recording hook and a payload
		const { runtime, reports } = recordingRuntime();
		const payload = boom();

		// When: catching an async function that rejects with it
		const result = await runtime.catchUnwindAsync(() =>
			Promise.reject(payload),
		);

		// Then: the result is Err of the payload, reported once
		assertStrictEquals(unwrapErr(result), payload);
		assertEquals(reports.length, 1);
	});

	await t.step("synchronous throw", async () => {
		// Given: a runtime with a recording hook and a payload
		const { runtime, reports } = recordingRuntime();
		const payload = "thrown before any promise";

		// When: catching a function that throws before returning a promise
		const result = await runtime.catchUnwindAsync((): Promise<number> => {
			throw payload;
		});

		// Then: the result is Err of the payload, reported once
		assertStrictEquals(unwrapErr(result), payload);
		assertEquals(reports.length, 1);
	});

	await t.step("throwing hook rejects with a PanicHook panic", async () => {
		// Given: a runtime whose hook throws
		const runtime = definePanicRuntime();
		runtime.setHook(() => {
			throw new Error("hook broke");
		});

		// When: catching an async function that rejects
		// Then: the returned promise rejects with the PanicHook panic
		const rejected = await assertRejects(() =>
			runtime.catchUnwindAsync(() => Promise.reject(boom())),
		);
		assertInstanceOf(rejected, Panic);
		assertEquals(rejected.name, "Panic (PanicHook)");
	});
});

Deno.test("mapErr() converts a caught payload into an app error", () => {
	// Given: a runtime and an app-level conversion
	const { runtime } = recordingRuntime();
	const toAppError = (payload: unknown): string =>
		payload instanceof Panic ? `panic: ${payload.message}` : "unknown";

	// When: catching a panic and mapping the error
	const result = mapErr(
		runtime.catchUnwind(() => panic({ message: "bad state", cause: null })),
		toAppError,
	);

	// Then: the Err holds the converted value
	assertEquals(unwrapErr(result), "panic: bad state");
});

Deno.test("defaultPanicHook writes a 'panicked:' report to console.error", async (t) => {
	await t.step("Error payload prints its stack", () => {
		// Given: a stubbed console.error and a Panic
		using error = stub(console, "error");
		const payload = boom();

		// When: the default hook reports it
		defaultPanicHook({ payload, stack: payload.stack });

		// Then: it prints 'panicked: ' followed by the stack
		assertEquals(error.calls.length, 1);
		assertEquals(error.calls[0]?.args, [`panicked: ${payload.stack}`]);
		assertMatch(String(error.calls[0]?.args[0]), /^panicked: Panic: boom/);
	});

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
