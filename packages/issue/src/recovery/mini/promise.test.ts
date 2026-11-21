import { Ok, unwrapErr } from "@sekhmet/enum/result/mini";
import { Panic, panic } from "@sekhmet/panic/mini/core";
import { definePanicRuntime } from "@sekhmet/panic/mini/runtime";
import { unwrapPanicked } from "@sekhmet/panic/outcome/mini";
import { isPending, map, wait } from "@sekhmet/vow/mini";
import { assert, assertEquals, assertInstanceOf } from "@std/assert";
import { issue } from "@/src/issue/mini/core.ts";
import { attempt } from "@/src/issue/mini/handling.ts";
import { isUnhandled } from "@/src/issue/mini/predicates.ts";
import { or } from "./combinators.ts";
import { run, succeed } from "./core.ts";
import { fromPromise } from "./promise.ts";

/** Resolves after every pending microtask, and a macrotask turn, have run. */
function settled(): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, 0);
	});
}

/** A repair whose promise rejects with a Panic. */
function panicking(_: string): Promise<number> {
	return Promise.resolve().then(() => {
		return panic({ message: "bad cache", cause: null });
	});
}

Deno.test("fromPromise() yields a fulfilled residue as Ok", async () => {
	// Given: a promise-returning repair
	const panics = definePanicRuntime();
	const fetchRemote = fromPromise({
		repair: (path: string) => Promise.resolve({ path, port: 9000 }),
		panics,
	});

	// When: it is run
	const result = run(fetchRemote, "app.json");

	// Then: it is pending until the promise settles, then Ok
	assert(isPending(result));
	assertEquals(await wait(result), Ok({ path: "app.json", port: 9000 }));
});

Deno.test("fromPromise() carries a rejection as Err, never unhandled", async () => {
	// Given: an async repair that rejects
	const panics = definePanicRuntime();
	const fetchRemote = fromPromise({
		repair: async (_: string): Promise<number> => {
			await Promise.resolve();
			throw new Error("offline");
		},
		panics,
	});

	// When: it is run and awaited
	const result = await wait(run(fetchRemote, "app.json"));

	// Then: the rejection reason is the Err
	const reason = unwrapErr(result);
	assertInstanceOf(reason, Error);
	assertEquals(reason.message, "offline");
});

Deno.test("fromPromise() reports a dependent that throws to the panic hook", async () => {
	// Given: a panic runtime with a recording hook, and a recovery
	const panics = definePanicRuntime();
	const reported: unknown[] = [];
	panics.setHook(({ payload }) => reported.push(payload));
	const fetchRemote = fromPromise({
		repair: (_: string) => Promise.resolve(1),
		panics,
	});

	// When: a dependent of its vow throws when it resolves
	const result = run(fetchRemote, "app.json");
	map(result, () => {
		throw new Error("bad dependent");
	});
	await wait(result);

	// Then: the hook reported it, rather than an unhandled rejection
	assertInstanceOf(reported[0], AggregateError);
});

Deno.test("fromPromise() reports a Panic rejection to the hook, not as Err", async () => {
	// Given: a panic runtime with a recording hook, and a repair that panics
	const panics = definePanicRuntime();
	const reported: unknown[] = [];
	panics.setHook(({ payload }) => reported.push(payload));
	const fetchRemote = fromPromise({ repair: panicking, panics });

	// When: it is run, and every callback has had its turn
	const result = run(fetchRemote, "app.json");
	await settled();

	// Then: the hook reported the Panic once, and the vow never resolves
	assertEquals(reported.length, 1);
	assertInstanceOf(reported[0], Panic);
	assert(isPending(result));
});

Deno.test("fromPromise() keeps a rejection that isn't a Panic as Err", async () => {
	// Given: a recording hook, and a repair rejecting with a plain Error
	const panics = definePanicRuntime();
	const reported: unknown[] = [];
	panics.setHook(({ payload }) => reported.push(payload));
	const fetchRemote = fromPromise({
		repair: (_: string): Promise<number> => {
			return Promise.reject(new Error("offline"));
		},
		panics,
	});

	// When: it is run and awaited
	const result = await wait(run(fetchRemote, "app.json"));

	// Then: the Error is the Err, and nothing was reported
	assertInstanceOf(unwrapErr(result), Error);
	assertEquals(reported, []);
});

Deno.test("a panic in an async repair stops or, and the issue stays unhandled", async () => {
	// Given: a panicking recovery with a fallback after it, and an issue
	const panics = definePanicRuntime();
	const reported: unknown[] = [];
	panics.setHook(({ payload }) => reported.push(payload));
	const recovery = or(
		fromPromise({ repair: panicking, panics }),
		succeed<string, number>(8080),
	);
	const notFound = issue<string, number>({
		value: "app.json",
		code: "config/NotFound",
		message: "No config file.",
	});

	// When: the issue is attempted, and every callback has had its turn
	const ended = attempt(notFound, recovery);
	await settled();

	// Then: the fallback never ran, the attempt never ends, and the panic was reported
	assert(isPending(ended));
	assert(isUnhandled(notFound));
	assertEquals(reported.length, 1);
});

Deno.test("fromPromise() doesn't report a panic its runtime already reported", async () => {
	// Given: a repair that catches a panic in a boundary of the same runtime,
	// then resumes it, so the rejection is a Panic already reported
	const panics = definePanicRuntime();
	const reported: unknown[] = [];
	panics.setHook(({ payload }) => reported.push(payload));
	const fetchRemote = fromPromise({
		repair: async (_: string): Promise<number> => {
			await Promise.resolve();
			const caught = panics.catchUnwind(() => {
				return panic({ message: "bad cache", cause: null });
			});
			return panics.resumeUnwind(unwrapPanicked(caught));
		},
		panics,
	});

	// When: it is run, and every callback has had its turn
	const result = run(fetchRemote, "app.json");
	await settled();

	// Then: the hook saw it once, from the inner boundary, and the vow is pending
	assertEquals(reported.length, 1);
	assert(isPending(result));
});
