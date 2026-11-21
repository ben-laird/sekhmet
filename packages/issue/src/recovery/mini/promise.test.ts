import { Ok, unwrapErr } from "@sekhmet/enum/result/mini";
import { definePanicRuntime } from "@sekhmet/panic/mini/runtime";
import { isPending, map, wait } from "@sekhmet/vow/mini";
import { assert, assertEquals, assertInstanceOf } from "@std/assert";
import { run } from "./core.ts";
import { fromPromise } from "./promise.ts";

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
