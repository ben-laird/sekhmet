import { isolate, match, union } from "@sekhmet/enum/core/mini";
import { Some } from "@sekhmet/enum/option/mini";
import { isErr, unwrap, unwrapErr } from "@sekhmet/enum/result/mini";
import {
	definePanicRuntime,
	isPanicHookFailure,
	Panic,
	type PanicRuntime,
} from "@sekhmet/panic";
import {
	isResolved,
	type Vow,
	value as vowValue,
	wait,
} from "@sekhmet/vow/mini";
import { assert, assertEquals, assertThrows } from "@std/assert";
import { Resource, type SetupEnd } from "@/mod.ts";

type Cause = "done" | "cancelled" | "shutdown";

/** A panic runtime that records what its hook reports. */
function recordingPanics(): {
	readonly panics: PanicRuntime;
	readonly reported: unknown[];
} {
	const panics = definePanicRuntime();
	const reported: unknown[] = [];
	panics.setHook(({ payload }) => {
		reported.push(payload);
	});
	return { panics, reported };
}

/** A panic runtime whose hook throws: every panic it reports is a double fault. */
function brokenPanics(): PanicRuntime {
	const panics = definePanicRuntime();
	panics.setHook(() => {
		throw new Error("reporter offline");
	});
	return panics;
}

/** A settled vow's value (the examples with a sync init). */
function settled<T>(vow: Vow<T>): T {
	const current = vowValue(vow);
	assert(isolate(current, "Some"), "expected a settled vow");
	return union(current);
}

/** Renders why a setup was torn down, for logs. */
function show(end: SetupEnd<Cause>): string {
	return match(end)({
		Ended: (cause) => `ended: ${cause}`,
		InitPanicked: (panic) => `init panicked: ${panic.message}`,
	});
}

Deno.test("a sync init gives a lifetime at once; deinit runs on end, before what init deferred", () => {
	// Given: a database resource whose init defers a cleanup of its own
	const { panics } = recordingPanics();
	const log: string[] = [];
	const database = new Resource<string, { readonly url: string }, Cause>({
		init: (url, setup) => {
			log.push(`open ${url}`);
			setup.defer((cause) => void log.push(`setup cleanup: ${show(cause)}`));
			return { url };
		},
		deinit: (client, cause) => void log.push(`close ${client.url}: ${cause}`),
	});

	// When: it's started, used and ended
	const starting = database.start({ input: "postgres://a", panics });
	const db = unwrap(settled(starting));
	const url = db.with((client) => client.url);
	db.end("done");

	// Then: it settled synchronously; open, then deinit with the cause, then init's own cleanup
	assertEquals(url, Some("postgres://a"));
	assertEquals(log, [
		"open postgres://a",
		"close postgres://a: done",
		"setup cleanup: ended: done",
	]);
});

Deno.test("an async init settles later, and `await using` tears it down", async () => {
	// Given: a resource whose init awaits a connection
	const { panics } = recordingPanics();
	const log: string[] = [];
	const pool = new Resource<number, { readonly size: number }, Cause>({
		init: async (size) => {
			await Promise.resolve();
			log.push(`open pool of ${size}`);
			return { size };
		},
		deinit: async (_pool, cause) => {
			await Promise.resolve();
			log.push(`drain pool: ${cause}`);
		},
	});

	// When: it's started and used under `await using`
	const starting = pool.start({ input: 4, panics, disposeCause: "shutdown" });
	const pendingAtFirst = !isResolved(starting);
	{
		await using connections = unwrap(await wait(starting));
		connections.with((p) => void log.push(`size ${p.size}`));
	}

	// Then: pending until init finished; drained on scope exit
	assert(pendingAtFirst);
	assertEquals(log, ["open pool of 4", "size 4", "drain pool: shutdown"]);
});

Deno.test("an init that panics returns Err, after releasing what it had acquired", async () => {
	// Given: a resource whose init acquires something, then throws (sync) or rejects (async)
	const { panics, reported } = recordingPanics();
	const released: string[] = [];
	const flaky = new Resource<"sync" | "async", never, Cause>({
		init: (mode, setup) => {
			setup.defer((cause) => void released.push(`${mode}: ${show(cause)}`));
			if (mode === "sync") {
				throw new Error("handshake failed");
			}
			return Promise.reject(new Error("timed out"));
		},
		deinit: () => {},
	});

	// When: both are started
	const syncResult = settled(flaky.start({ input: "sync", panics }));
	const asyncResult = await wait(flaky.start({ input: "async", panics }));

	// Then: both are Err with a Panic, reported to the hook; init's acquisitions learned why they were released
	assert(isErr(syncResult) && unwrapErr(syncResult) instanceof Panic);
	assert(isErr(asyncResult) && unwrapErr(asyncResult) instanceof Panic);
	assertEquals(unwrapErr(syncResult).name, "Panic (InitFailed)");
	assertEquals(released, [
		"sync: init panicked: handshake failed",
		"async: init panicked: timed out",
	]);
	assertEquals(reported.length, 2);
});

Deno.test("an init's async setup teardown is awaited before start settles with Err", async () => {
	// Given: an init that acquires something released asynchronously, then throws
	const { panics } = recordingPanics();
	let released = false;
	const flaky = new Resource<undefined, never, Cause>({
		init: (_input, setup) => {
			setup.defer(async () => {
				await Promise.resolve();
				released = true;
			});
			throw new Error("handshake failed");
		},
		deinit: () => {},
	});

	// When: it's started
	const starting = flaky.start({ input: undefined, panics });
	const pendingAtFirst = !isResolved(starting);
	const result = await wait(starting);

	// Then: Err only once setup was released
	assert(pendingAtFirst);
	assert(isErr(result) && released);
});

Deno.test("stacking resources: an inner resource started in init outlives the outer deinit", () => {
	// Given: a repository built on a connection that its init starts and adopts
	const { panics } = recordingPanics();
	const order: string[] = [];
	type ConnectionCause = "closed" | "aborted";
	const connection = new Resource<string, string, ConnectionCause>({
		init: (url) => {
			order.push(`connect ${url}`);
			return url;
		},
		deinit: (url, cause) => void order.push(`disconnect ${url}: ${cause}`),
	});
	const repository = new Resource<string, { readonly table: string }, Cause>({
		init: (table, setup) => {
			const conn = unwrap(
				settled(connection.start({ input: "db://main", panics })),
			);
			setup.adopt({
				child: conn,
				fromParent: (end): ConnectionCause => {
					return isolate(end, "Ended") ? "closed" : "aborted";
				},
			});
			order.push(`prepare ${table}`);
			return { table };
		},
		deinit: (repo) => void order.push(`flush ${repo.table}`),
	});

	// When: the repository is started, then ended
	const repo = unwrap(settled(repository.start({ input: "users", panics })));
	repo.end("done");

	// Then: torn down in reverse: the outer deinit runs while the connection is still open
	assertEquals(order, [
		"connect db://main",
		"prepare users",
		"flush users",
		"disconnect db://main: closed",
	]);
});

Deno.test("a started lifetime takes the dispose cause given to start", () => {
	// Given: a resource started with a dispose cause
	const { panics } = recordingPanics();
	const log: string[] = [];
	const file = new Resource<string, string, Cause>({
		init: (path) => path,
		deinit: (path, cause) => void log.push(`close ${path}: ${cause}`),
	});

	// When: it's used under `using`
	{
		using handle = unwrap(
			settled(file.start({ input: "a.txt", panics, disposeCause: "done" })),
		);
		handle.with((path) => void log.push(`read ${path}`));
	}

	// Then: deinit got the dispose cause
	assertEquals(log, ["read a.txt", "close a.txt: done"]);
});

// --- Double faults: the panic hook throws while reporting ---

Deno.test("a double fault in a sync init tears setup down, then start rethrows it", () => {
	// Given: under a throwing hook, an init that acquires something, then throws
	const released: string[] = [];
	const flaky = new Resource<undefined, never, Cause>({
		init: (_input, setup) => {
			setup.defer((cause) => void released.push(show(cause)));
			throw new Error("handshake failed");
		},
		deinit: () => {},
	});

	// When: it's started
	const thrown = assertThrows(() => {
		flaky.start({ input: undefined, panics: brokenPanics() });
	});

	// Then: setup was released with the PanicHook panic, which start rethrew
	assert(isPanicHookFailure(thrown));
	assertEquals(released, [
		"init panicked: the panic hook threw while reporting a panic",
	]);
});

Deno.test("a double fault in an async init is never thrown: it is the Err's panic", async () => {
	// Given: under a throwing hook, an init that acquires something, then rejects
	const released: string[] = [];
	const flaky = new Resource<undefined, never, Cause>({
		init: (_input, setup) => {
			setup.defer((cause) => void released.push(show(cause)));
			return Promise.reject(new Error("timed out"));
		},
		deinit: () => {},
	});

	// When: it's started
	const result = await wait(
		flaky.start({ input: undefined, panics: brokenPanics() }),
	);

	// Then: Err with the PanicHook panic, and setup was released
	assert(isErr(result) && isPanicHookFailure(unwrapErr(result)));
	assertEquals(released.length, 1);
});
