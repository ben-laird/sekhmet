import { isolate, match, union } from "@sekhmet/enum/core/mini";
import { Some } from "@sekhmet/enum/option/mini";
import {
	definePanicRuntime,
	isPanicHookFailure,
	Panic,
	type PanicRuntime,
} from "@sekhmet/panic";
import {
	isPanicked,
	type Outcome,
	unwrap,
	unwrapPanicked,
} from "@sekhmet/panic/outcome/mini";
import {
	isResolved,
	type Vow,
	value as vowValue,
	wait,
} from "@sekhmet/vow/mini";
import { assert, assertEquals, assertThrows } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import {
	isSetupTeardownPanic,
	Lifetime,
	Resource,
	type SetupEnd,
} from "@/mod.ts";

type Cause = "done" | "cancelled" | "shutdown";

/**
 * A promise that keeps every promise its `then` returns, so a test can catch
 * a double fault escaping a callback instead of leaving it unhandled.
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

/** A watched promise that rejects with `reason` once `reject` is called. */
function watchedRejection(reason: unknown): {
	readonly promise: WatchedPromise<never>;
	readonly reject: () => void;
} {
	let fail!: (reason: unknown) => void;
	const promise = new WatchedPromise<never>((_resolve, reject) => {
		fail = reject;
	});
	return { promise, reject: () => fail(reason) };
}

/**
 * What escaped the last callback chained onto `promise`: the boundary's, at
 * the end of the chain of first `then`s (start wraps init's rejection in a
 * `then` of its own before the boundary adopts it).
 */
function escapedFrom(promise: WatchedPromise<unknown>): Promise<unknown> {
	let callback = promise.derived[0];
	assert(callback !== undefined, "the boundary should have called then");
	while (callback instanceof WatchedPromise && callback.derived[0]) {
		callback = callback.derived[0];
	}
	return callback.then(
		() => undefined,
		(reason: unknown) => reason,
	);
}

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

Deno.test("start settles a Vow of an Outcome with no Err channel", () => {
	// Given: a resource
	const { panics } = recordingPanics();
	const plain = new Resource<string, string, Cause>({
		init: (input) => input,
		deinit: () => {},
	});

	// When: it's started
	const starting = plain.start({ input: "a", panics });

	// Then: Ok of a lifetime, or Panicked of an unknown payload, never Err
	assertType<
		IsExact<
			typeof starting,
			Vow<Outcome<Lifetime<string, Cause>, never, unknown>>
		>
	>(true);
	unwrap(settled(starting)).end("done");
});

Deno.test("an init that panics settles Panicked, after releasing what it had acquired", async () => {
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

	// Then: both are Panicked with a Panic, reported to the hook; init's acquisitions learned why they were released
	assert(isPanicked(syncResult) && isPanicked(asyncResult));
	const [syncPanic, asyncPanic] = [syncResult, asyncResult].map(unwrapPanicked);
	assert(syncPanic instanceof Panic && asyncPanic instanceof Panic);
	assertEquals(syncPanic.name, "Panic (InitFailed)");
	assertEquals(released, [
		"sync: init panicked: handshake failed",
		"async: init panicked: timed out",
	]);
	assertEquals(reported.length, 2);
});

Deno.test("an init's async setup teardown is awaited before start settles as Panicked", async () => {
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

	// Then: Panicked only once setup was released
	assert(pendingAtFirst);
	assert(isPanicked(result) && released);
});

Deno.test("an init panic whose setup teardown fails too settles both in one payload, each reported once", async () => {
	// Given: a resource whose init acquires something that fails to release, then throws (sync) or rejects (async)
	const { panics, reported } = recordingPanics();
	const flaky = new Resource<"sync" | "async", never, Cause>({
		init: (mode, setup) => {
			setup.defer(() => {
				return Promise.reject(new Error(`${mode}: temp dir already gone`));
			});
			setup.defer(() => {
				throw new Error(`${mode}: lock already released`);
			});
			if (mode === "sync") {
				throw new Error("handshake failed");
			}
			return Promise.reject(new Error("timed out"));
		},
		deinit: () => {},
	});

	// When: both are started
	const results = [
		await wait(flaky.start({ input: "sync", panics })),
		await wait(flaky.start({ input: "async", panics })),
	];

	// Then: each payload carries init's panic and setup's failures, in run
	// order; the hook saw each original panic once, and never the carrier
	const carried = results.map((result) => {
		assert(isPanicked(result));
		const failure = unwrapPanicked(result);
		assert(isSetupTeardownPanic(failure));
		assertEquals(failure.name, "Panic (SetupTeardownFailed)");
		return [
			failure.cause.init.message,
			...failure.cause.teardown.map((panic) => panic.message),
		];
	});
	assertEquals(carried, [
		[
			"handshake failed",
			"sync: lock already released",
			"sync: temp dir already gone",
		],
		[
			"timed out",
			"async: lock already released",
			"async: temp dir already gone",
		],
	]);
	assertEquals(reported.length, 6);
	assert(!reported.some((payload) => isSetupTeardownPanic(payload)));
});

Deno.test("a setup that init adopted elsewhere still ends right after deinit", () => {
	// Given: an init that wrongly gives setup another owner
	const { panics } = recordingPanics();
	const order: string[] = [];
	const elsewhere = new Lifetime<undefined, SetupEnd<Cause>>({
		value: undefined,
		panics,
	});
	const misused = new Resource<undefined, number, Cause>({
		init: (_input, setup) => {
			elsewhere.adopt({ child: setup });
			setup.defer((end) => void order.push(`setup released: ${show(end)}`));
			return 1;
		},
		deinit: () => void order.push("deinit"),
	});

	// When: it's started and ended
	unwrap(settled(misused.start({ input: undefined, panics }))).end("done");

	// Then: setup was released after deinit, synchronously, all the same
	assertEquals(order, ["deinit", "setup released: ended: done"]);
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

Deno.test("init's panic is reported once, as its wrapper, even when unwrapped into an outer boundary", async (t) => {
	await t.step("a sync throw", () => {
		// Given: a resource whose init throws, under a recording runtime
		const { panics, reported } = recordingPanics();
		const thrown = new Error("handshake failed");
		const flaky = new Resource<undefined, never, Cause>({
			init: () => {
				throw thrown;
			},
			deinit: () => {},
		});

		// When: it's started, and the Panicked is unwrapped into an outer boundary
		const started = settled(flaky.start({ input: undefined, panics }));
		const outer = settled(panics.catchUnwind(() => unwrap(started)));

		// Then: the hook saw one report, the wrapper, with the original as its cause
		assertEquals(reported.length, 1);
		const [wrapper] = reported;
		assert(wrapper instanceof Panic);
		assertEquals(wrapper.name, "Panic (InitFailed)");
		assertEquals(wrapper.cause, thrown);
		assert(unwrapPanicked(outer) === wrapper);
	});

	await t.step(
		"an async rejection whose setup teardown fails too",
		async () => {
			// Given: an init that acquires something that fails to release, then rejects
			const { panics, reported } = recordingPanics();
			const flaky = new Resource<undefined, never, Cause>({
				init: (_input, setup) => {
					setup.defer(() => {
						throw new Error("lock already released");
					});
					return Promise.reject(new Error("timed out"));
				},
				deinit: () => {},
			});

			// When: it's started, and the carrier is unwrapped into an outer boundary
			const started = await wait(flaky.start({ input: undefined, panics }));
			const outer = settled(panics.catchUnwind(() => unwrap(started)));

			// Then: the hook saw init's wrapper and the cleanup's panic, never the carrier
			assertEquals(reported.length, 2);
			assert(!reported.some((payload) => isSetupTeardownPanic(payload)));
			assert(isSetupTeardownPanic(unwrapPanicked(outer)));
		},
	);
});

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

Deno.test("a double fault in an async init is never thrown: init's panic is the payload", async () => {
	// Given: under a throwing hook, an init that acquires something, then rejects
	const released: string[] = [];
	const timedOut = new Error("timed out");
	const { promise, reject } = watchedRejection(timedOut);
	const flaky = new Resource<undefined, never, Cause>({
		init: (_input, setup) => {
			setup.defer((cause) => void released.push(show(cause)));
			return promise;
		},
		deinit: () => {},
	});

	// When: it's started and init rejects; the escaping double fault is caught
	// here, since in a program nothing holds it and it would crash the process
	const started = flaky.start({ input: undefined, panics: brokenPanics() });
	const escaped = escapedFrom(promise);
	reject();
	const result = await wait(started);

	// Then: Panicked with init's own panic, setup was released, and the PanicHook escaped
	assert(isPanicked(result));
	const payload = unwrapPanicked(result);
	assert(payload instanceof Panic);
	assertEquals(payload.cause, timedOut);
	assertEquals(released.length, 1);
	assert(isPanicHookFailure(await escaped));
});
