import { DispatchController, DispatchSignal } from "@sekhmet/dispatch";
import { isolate, match, union } from "@sekhmet/enum/core/mini";
import { None, type Option, Some } from "@sekhmet/enum/option/mini";
import { Ready } from "@sekhmet/enum/poll/mini";
import { isErr, isOk, Ok, unwrapErr } from "@sekhmet/enum/result/mini";
import {
	definePanicRuntime,
	isPanicHookFailure,
	Panic,
	type PanicRuntime,
} from "@sekhmet/panic";
import { wait } from "@sekhmet/vow/mini";
import { assert, assertEquals, assertThrows } from "@std/assert";
import { type EndReport, Lifetime } from "@/mod.ts";

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

/** A root holding nothing, ending with "shutdown" under `using`. */
function app(): Lifetime<undefined, Cause> {
	return new Lifetime<undefined, Cause>({
		value: undefined,
		panics: recordingPanics().panics,
		disposeCause: "shutdown",
	});
}

/** The report `ended` has dispatched, failing if it hasn't yet. */
function reportOf<C>(lifetime: Lifetime<unknown, C>): EndReport<C> {
	const polled = lifetime.ended.poll();
	assert(isolate(polled, "Ready"), "expected the lifetime to have ended");
	return union(polled);
}

Deno.test("the value exists only while Alive", () => {
	// Given: a child holding a connection-like value
	const root = app();
	const conn = root.child({ value: { port: 5432 } });

	// When: it's read while alive, then after ending
	const before = conn.with((c) => c.port);
	conn.end("done");
	const after = conn.with((c) => c.port);

	// Then: Some while alive, None after, and the phase says why
	assertEquals(before, Some(5432));
	assertEquals(after, None());
	assertEquals(conn.value(), None());
	assert(isolate(conn.phase(), "Ended"));
});

Deno.test("the phase is Ending while an async teardown runs", async () => {
	// Given: a lifetime whose cleanup awaits
	const root = app();
	root.defer(() => Promise.resolve());

	// When: it ends
	root.end("cancelled");
	const during = root.phase();
	await root.ended.wait();

	// Then: Ending with the cause, then Ended
	assertEquals(
		match(during)({
			Alive: () => "alive",
			Ending: (cause) => `ending: ${cause}`,
			Ended: () => "ended",
		}),
		"ending: cancelled",
	);
	assert(isolate(root.phase(), "Ended"));
});

Deno.test("teardown runs in reverse acquisition order, cleanups and children alike", () => {
	// Given: cleanups and children acquired in an interleaved order
	const root = app();
	const order: string[] = [];
	root.defer(() => void order.push("cleanup 1"));
	root.child({ value: "a" }).defer(() => void order.push("child a"));
	root.defer(() => void order.push("cleanup 2"));
	root.child({ value: "b" }).defer(() => void order.push("child b"));

	// When: the root ends
	root.end("done");

	// Then: last acquired, first released, like RAII
	assertEquals(order, ["child b", "cleanup 2", "child a", "cleanup 1"]);
});

Deno.test("ending is one-way and idempotent: the first cause wins", () => {
	// Given: a lifetime
	const root = app();

	// When: it's ended twice with different causes
	const first = root.end("cancelled");
	const second = root.end("done");

	// Then: both return `ended`, reporting the first cause
	assert(first === second && first === root.ended);
	assertEquals(first.poll(), Ready(Ok("cancelled")));
});

Deno.test("sync cleanups end synchronously; an async one leaves `ended` pending", async () => {
	// Given: one lifetime with a sync cleanup, another closing a 'db' asynchronously
	const sync = app();
	sync.defer(() => {});
	const db = app();
	let closed = false;
	db.defer(async () => {
		await Promise.resolve();
		closed = true;
	});

	// When: both end
	const syncEnd = sync.end("done");
	const dbEnd = db.end("done");

	// Then: the sync one has ended; the db one ends once closed
	assert(isolate(syncEnd.poll(), "Ready"));
	assert(isolate(dbEnd.poll(), "Pending"));
	assert(isOk(await dbEnd.wait()) && closed);
});

Deno.test("an async cleanup is awaited before the next entry runs", async () => {
	// Given: an async cleanup above a sync one
	const root = app();
	const order: string[] = [];
	root.defer(() => void order.push("sync, acquired first"));
	root.defer(async () => {
		await Promise.resolve();
		order.push("async, acquired last");
	});

	// When: it ends
	await root.end("done").wait();

	// Then: the sync one waited for the async one
	assertEquals(order, ["async, acquired last", "sync, acquired first"]);
});

Deno.test("every cleanup runs and receives the cause; a throw is a Panic in the report", () => {
	// Given: three cleanups, the middle one throwing
	const { panics, reported } = recordingPanics();
	const root = new Lifetime<undefined, Cause>({ value: undefined, panics });
	const ran: string[] = [];
	root.defer((cause) => void ran.push(`first: ${cause}`));
	root.defer(() => {
		throw new Error("socket already closed");
	});
	root.defer((cause) => void ran.push(`third: ${cause}`));

	// When: it ends
	const polled = root.end("cancelled").poll();

	// Then: all ran, LIFO, with the cause; the report is Err with one Panic, reported once
	assertEquals(ran, ["third: cancelled", "first: cancelled"]);
	assert(isolate(polled, "Ready"));
	const report = union(polled);
	assert(isErr(report));
	assertEquals(unwrapErr(report).cause, "cancelled");
	assertEquals(unwrapErr(report).panics[0]?.name, "Panic (CleanupFailed)");
	assertEquals(unwrapErr(report).panics[0]?.message, "socket already closed");
	assertEquals(reported.length, 1);
});

Deno.test("a rejecting cleanup is a Panic in the report, kept as is when it is one", async () => {
	// Given: one cleanup rejecting with an Error, one rejecting with a Panic
	const root = app();
	const own = new Panic({ name: "Mine", message: "already a panic", cause: 1 });
	root.defer(() => Promise.reject(new Error("timed out")));
	root.defer(() => Promise.reject(own));

	// When: it ends
	const report = await root.end("done").wait();

	// Then: both panics, in run order; the Panic is the same object
	assert(isErr(report));
	const [first, second] = unwrapErr(report).panics;
	assert(first === own);
	assertEquals(second?.name, "Panic (CleanupFailed)");
	assertEquals(second?.message, "timed out");
});

Deno.test("registering after the end runs at once and says so; during the end joins the pass", async () => {
	// Given: one ended lifetime, and one whose cleanup registers another mid-teardown
	const ended = app();
	ended.end("done");
	const ending = app();
	const ran: string[] = [];
	let during: Option<string> = None();
	ending.defer(() => {
		const registration = ending.defer(
			() => void ran.push("registered mid-teardown"),
		);
		during = Some(isolate(registration, "DuringEnd") ? "DuringEnd" : "other");
		ran.push("outer");
	});

	// When: a cleanup is registered late on the first, and the second ends
	const late = ended.defer((cause) => void ran.push(`late: ${cause}`));
	ending.end("done");

	// Then: the late one already ran; the mid-teardown one ran in the same pass
	assert(isolate(late, "AfterEnd"));
	assertEquals(await wait(union(late)), Ok(undefined));
	assertEquals(during, Some("DuringEnd"));
	assertEquals(ran, ["late: done", "outer", "registered mid-teardown"]);
});

Deno.test("a cleanup registered after the end that throws reports it in AfterEnd", async () => {
	// Given: an ended lifetime
	const root = app();
	root.end("done");

	// When: a throwing cleanup is registered
	const late = root.defer(() => {
		throw new Error("too late");
	});

	// Then: its panic comes back in the vow
	assert(isolate(late, "AfterEnd"));
	const ran = await wait(union(late));
	assert(isErr(ran));
	assertEquals(unwrapErr(ran).message, "too late");
});

Deno.test("unregistering removes a cleanup only while Alive", () => {
	// Given: two registered cleanups
	const root = app();
	const ran: string[] = [];
	const first = root.defer(() => void ran.push("first"));
	const second = root.defer(() => void ran.push("second"));
	const unregister = (registration: typeof first): boolean => {
		return match(registration)({
			Registered: (stop) => stop(),
			DuringEnd: () => false,
			AfterEnd: () => false,
		});
	};

	// When: the first is unregistered twice, then it ends, then the second is unregistered
	const removed = unregister(first);
	const again = unregister(first);
	root.end("done");
	const afterEnd = unregister(second);

	// Then: only the first unregister removed anything
	assertEquals([removed, again, afterEnd], [true, false, false]);
	assertEquals(ran, ["second"]);
});

Deno.test("each transition is a DispatchSignal: ending carries the cause, ended the report", () => {
	// Given: a lifetime with a cleanup, observers of both transitions, and a platform signal
	const root = app();
	const heard: string[] = [];
	root.defer(() => void heard.push("cleanup"));
	root.ending.whenDispatched((cause) => void heard.push(`ending: ${cause}`));
	root.ended.whenDispatched(
		(report) => void heard.push(`ended: ${isOk(report)}`),
	);
	const forFetch = root.ending.toAbortSignal();

	// When: it's cancelled
	root.end("cancelled");

	// Then: ending before teardown, ended after it; the AbortSignal carries the cause
	assertEquals(heard, ["ending: cancelled", "cleanup", "ended: true"]);
	assertEquals(forFetch.reason, "cancelled");
});

Deno.test("a child can map its parent's cause into its own, produced only when the end reaches it", () => {
	// Given: a request lifetime whose cause type differs from the app's
	type RequestCause =
		| { readonly kind: "served" }
		| { readonly kind: "aborted"; readonly because: Cause };
	// {}
	const root = app();
	let produced = 0;
	const request = root.child({
		value: { path: "/" },
		fromParent: (because): RequestCause => {
			produced++;
			return { kind: "aborted", because };
		},
	});
	const beforeEnd = produced;

	// When: the app shuts down
	root.end("shutdown");

	// Then: the child ended with its own cause, produced at that moment
	assertEquals(beforeEnd, 0);
	assertEquals(
		request.ending.poll(),
		Ready({ kind: "aborted", because: "shutdown" }),
	);
});

Deno.test("a child that ends on its own keeps its cause and leaves its owner", () => {
	// Given: a mapped child
	const root = app();
	let mapped = 0;
	const job = root.child({
		value: 1,
		fromParent: (): "parent gone" | "finished" => {
			mapped++;
			return "parent gone";
		},
	});

	// When: the child finishes by itself, then the parent ends
	job.end("finished");
	root.end("done");

	// Then: the child kept its own cause, and the parent no longer reached it
	assertEquals(job.ending.poll(), Ready("finished"));
	assertEquals(mapped, 0);
});

Deno.test("a child's failed cleanups are in its parent's report", () => {
	// Given: a child whose cleanup throws
	const root = app();
	root.child({ value: 1 }).defer(() => {
		throw new Error("child cleanup failed");
	});

	// When: the parent ends
	root.end("done");
	const report = reportOf(root);

	// Then: the parent's report carries the child's panic
	assert(isErr(report));
	assertEquals(
		unwrapErr(report).panics.map((panic) => panic.message),
		["child cleanup failed"],
	);
});

Deno.test("a fromParent that throws is a Panic in the parent's report", () => {
	// Given: a child whose cause mapping throws
	const root = app();
	root.child({
		value: 1,
		fromParent: (): string => {
			throw new Error("no mapping");
		},
	});

	// When: the parent ends
	root.end("done");

	// Then: the mapping's throw is in the report
	const report = reportOf(root);
	assert(isErr(report));
	assertEquals(unwrapErr(report).panics[0]?.name, "Panic (CauseMappingFailed)");
});

Deno.test("a fromParent that throws releases the child: Alive, a root again, adoptable and endable", () => {
	// Given: a child whose cause mapping throws, under a root with a dispose cause
	const { panics } = recordingPanics();
	const root = app();
	const orphan = root.child({
		value: 1,
		fromParent: (): string => {
			throw new Error("no mapping");
		},
	});
	const closed: string[] = [];
	orphan.defer((cause) => void closed.push(cause));

	// When: the root ends, then another lifetime adopts the child and ends
	root.end("done");
	const aliveAfterRoot = isolate(orphan.phase(), "Alive");
	const disposeThrown = assertThrows(() => orphan[Symbol.dispose]());
	const next = new Lifetime<undefined, string>({ value: undefined, panics });
	const adoption = next.adopt({ child: orphan });
	next.end("adopted, then ended");

	// Then: it outlived the root with no owner left, so it had no dispose
	// cause and was adoptable; its new owner ended it
	assert(aliveAfterRoot);
	assert(
		disposeThrown instanceof Panic &&
			disposeThrown.name === "Panic (NoDisposeCause)",
	);
	assert(isolate(adoption, "Adopted"));
	assertEquals(closed, ["adopted, then ended"]);
});

Deno.test("you can build lifetimes yourself: a new Lifetime is a root until adopted", () => {
	// Given: hand-built lifetimes
	const { panics } = recordingPanics();
	const parent = new Lifetime<string, Cause>({ value: "parent", panics });
	const child = new Lifetime<string, Cause>({ value: "child", panics });
	const other = new Lifetime<string, Cause>({ value: "other", panics });
	const grandchild = new Lifetime<string, Cause>({ value: "grand", panics });

	// When: they're wired up, including mistakes
	const adopted = parent.adopt({ child });
	const twice = other.adopt({ child });
	const cycle = child.adopt({ child: parent });
	const self = parent.adopt({ child: parent });
	child.adopt({ child: grandchild });
	const deepCycle = grandchild.adopt({ child: parent });

	// Then: one owner each, and no cycles, however deep
	assert(isolate(adopted, "Adopted"));
	assert(isolate(twice, "AlreadyOwned"));
	assert(isolate(cycle, "WouldCycle"));
	assert(isolate(self, "WouldCycle"));
	assert(isolate(deepCycle, "WouldCycle"));
});

Deno.test("adopting into an ending parent ends the child at once; adopting an ended child does nothing", () => {
	// Given: an ended parent, a live child, and an ended child
	const { panics } = recordingPanics();
	const parent = app();
	parent.end("shutdown");
	const live = new Lifetime<number, Cause>({ value: 1, panics });
	const gone = new Lifetime<number, Cause>({ value: 2, panics });
	gone.end("done");

	// When: each is adopted
	const intoEnded = parent.adopt({ child: live });
	const ofEnded = app().adopt({ child: gone });

	// Then: born dead, never leaked; and nothing to own
	assert(isolate(intoEnded, "ParentEnded"));
	assertEquals(live.ending.poll(), Ready("shutdown"));
	assert(isolate(ofEnded, "ChildEnded"));
});

Deno.test("adopting during the parent's teardown ends the child with the mapped cause", () => {
	// Given: a parent whose cleanup adopts a child while it ends
	const { panics } = recordingPanics();
	const parent = app();
	const late = new Lifetime<number, string>({ value: 1, panics });
	let adoption = "";
	parent.defer(() => {
		const result = parent.adopt({
			child: late,
			fromParent: (cause) => `late: ${cause}`,
		});
		adoption = isolate(result, "ParentEnded") ? "ParentEnded" : "other";
	});

	// When: the parent ends
	parent.end("cancelled");

	// Then: the child was born dead, with the mapped cause
	assertEquals(adoption, "ParentEnded");
	assertEquals(late.ending.poll(), Ready("late: cancelled"));
});

Deno.test("endWhen links a lifetime to outside signals; the first to dispatch decides", () => {
	// Given: a lifetime that ends on a timeout or a user's cancel
	const { panics } = recordingPanics();
	const root = new Lifetime<undefined, Cause>({ value: undefined, panics });
	const timeout = new DispatchController<Cause>(panics.catchUnwind);
	const user = new DispatchController<Cause>(panics.catchUnwind);
	root.endWhen(DispatchSignal.any([timeout.signal, user.signal]));

	// When: the user cancels, then the timeout fires
	user.dispatch("cancelled");
	timeout.dispatch("done");

	// Then: the user's cause won
	assertEquals(root.ending.poll(), Ready("cancelled"));
});

Deno.test("endWhen's link is released by its Unsubscribe, or when the lifetime ends", () => {
	// Given: two lifetimes linked to the same signal, one unlinked, one ended
	const { panics } = recordingPanics();
	const unlinked = new Lifetime<undefined, Cause>({ value: undefined, panics });
	const ended = new Lifetime<undefined, Cause>({ value: undefined, panics });
	const signal = new DispatchController<Cause>(panics.catchUnwind);
	const unlink = unlinked.endWhen(signal.signal);
	const release = ended.endWhen(signal.signal);

	// When: one is unlinked, the other ends, then the signal dispatches
	const wasLinked = unlink();
	ended.end("done");
	const stillLinked = release();
	signal.dispatch("cancelled");

	// Then: the unlinked one stays alive; the ended one had already let go
	assert(wasLinked);
	assert(!stillLinked);
	assert(isolate(unlinked.phase(), "Alive"));
	assertEquals(ended.ending.poll(), Ready("done"));
});

Deno.test("`using` needs a dispose cause: its own, or one mapped from its owner's", () => {
	// Given: a root with no dispose cause, and a child adopted under one that has one
	const { panics } = recordingPanics();
	const bare = new Lifetime<undefined, Cause>({ value: undefined, panics });
	const root = app();
	const request = root.child({
		value: 1,
		fromParent: (cause: Cause) => `request ${cause}`,
	});

	// When: each is disposed
	const thrown = assertThrows(() => bare[Symbol.dispose]());
	request[Symbol.dispose]();

	// Then: the bare root can't be; the child used the mapped "shutdown"
	assert(thrown instanceof Panic && thrown.name === "Panic (NoDisposeCause)");
	assertEquals(request.ending.poll(), Ready("request shutdown"));
});

Deno.test("a child's dispose cause comes from its owner's owner, even when adopted before it", () => {
	// Given: a child adopted by a parent that has no dispose cause yet
	const { panics } = recordingPanics();
	const parent = new Lifetime<undefined, Cause>({ value: undefined, panics });
	const child = parent.child({ value: 1 });
	const root = app();
	root.adopt({ child: parent });

	// When: the child is disposed
	child[Symbol.dispose]();

	// Then: it used the root's "shutdown", passed down through its parent
	assertEquals(child.ending.poll(), Ready("shutdown"));
});

Deno.test("disposing a lifetime that has already ended needs no dispose cause", () => {
	// Given: a root with no dispose cause, ended by hand
	const { panics } = recordingPanics();
	const bare = new Lifetime<undefined, Cause>({ value: undefined, panics });
	bare.end("done");

	// When: it's disposed
	bare[Symbol.dispose]();

	// Then: nothing panicked, and the first cause stands
	assertEquals(bare.ending.poll(), Ready("done"));
});

Deno.test("`using` works for sync cleanups; an async one asks for `await using`", async () => {
	// Given: one lifetime with a sync cleanup, one with an async cleanup
	let syncReleased = false;
	{
		using root = app();
		root.defer(() => {
			syncReleased = true;
		});
	}
	const asyncRoot = app();
	asyncRoot.defer(() => Promise.resolve());

	// When: the async one is disposed synchronously
	const thrown = assertThrows(() => asyncRoot[Symbol.dispose]());

	// Then: `using` released the sync one; the async one points at `await using`, which works
	assert(syncReleased);
	assert(
		thrown instanceof Panic && thrown.name === "Panic (AsyncCleanupUnderUsing)",
	);
	await asyncRoot.ended.wait();
	let asyncReleased = false;
	{
		await using db = app();
		db.defer(async () => {
			await Promise.resolve();
			asyncReleased = true;
		});
	}
	assert(asyncReleased);
});

Deno.test("only the `using` boundary throws: one panic as it is, several as a SuppressedError chain", async () => {
	// Given: one lifetime with one failing cleanup, one with two
	const one = app();
	one.defer(() => {
		throw new Error("only");
	});
	const two = app();
	two.defer(() => {
		throw new Error("acquired first, ran last");
	});
	two.defer(() => {
		throw new Error("acquired last, ran first");
	});

	// When: each is disposed
	const single = assertThrows(() => one[Symbol.dispose]());
	let chained: unknown;
	try {
		await two[Symbol.asyncDispose]();
	} catch (thrown: unknown) {
		chained = thrown;
	}

	// Then: the single panic is thrown as is; the latest is outermost in the chain
	assert(single instanceof Panic && single.message === "only");
	assert(chained instanceof Error && chained.name === "SuppressedError");
	assert("error" in chained && "suppressed" in chained);
	const { error, suppressed } = chained;
	assert(
		error instanceof Panic && error.message === "acquired first, ran last",
	);
	assert(
		suppressed instanceof Panic &&
			suppressed.message === "acquired last, ran first",
	);
});

Deno.test("Lifetime is invariant in its cause, since end takes a C", () => {
	// Given: lifetimes of a narrow and a wide cause
	const { panics } = recordingPanics();
	const narrow = new Lifetime<undefined, "done">({ value: undefined, panics });
	const wide = new Lifetime<undefined, string>({ value: undefined, panics });

	// When: each is used where the other is expected
	// @ts-expect-error: end would accept causes the narrow lifetime can't handle
	const widened: Lifetime<undefined, string> = narrow;
	// @ts-expect-error: ending would dispatch causes a narrow reader doesn't expect
	const narrowed: Lifetime<undefined, "done"> = wide;

	// Then: the type checker refused both (the runtime values are unchanged)
	assert(widened === narrow && narrowed === wide);
});

Deno.test("a long synchronous teardown doesn't grow the stack", () => {
	// Given: a lifetime with many sync cleanups
	const root = app();
	let ran = 0;
	for (let i = 0; i < 50_000; i++) {
		root.defer(() => {
			ran++;
		});
	}

	// When: it ends
	root.end("done");
	const report = reportOf(root);

	// Then: every cleanup ran
	assertEquals(ran, 50_000);
	assert(isOk(report));
});

Deno.test("a child that ends on its own still holds up its parent's end until its async teardown finishes", async () => {
	// Given: a child that ends on its own, with an async cleanup
	const root = app();
	const order: string[] = [];
	root.defer(() => void order.push("parent cleanup"));
	const db = root.child({ value: "db" });
	db.defer(async () => {
		await Promise.resolve();
		await Promise.resolve();
		order.push("db closed");
	});

	// When: the child ends, then the parent ends while the child is still closing
	db.end("done");
	await root.end("shutdown").wait();
	order.push("parent ended");

	// Then: the parent waited for the child, in its stack position
	assertEquals(order, ["db closed", "parent cleanup", "parent ended"]);
});

Deno.test("a child that has finished ending on its own leaves no entry behind", () => {
	// Given: many children that each end on their own, synchronously
	const root = app();
	for (let i = 0; i < 1_000; i++) {
		root.child({ value: i }).end("done");
	}

	// When: the parent ends
	const polled = root.end("shutdown").poll();

	// Then: it ended at once and cleanly, with nothing to wait for
	assertEquals(polled, Ready(Ok("shutdown")));
});

Deno.test("a child adopted while its parent is ending is ended at once, and awaited", async () => {
	// Given: a parent whose teardown adopts a child with an async cleanup
	const { panics } = recordingPanics();
	const root = app();
	const order: string[] = [];
	root.defer(() => void order.push("first acquired, last released"));
	const late = new Lifetime<undefined, Cause>({ value: undefined, panics });
	late.defer(async () => {
		await Promise.resolve();
		order.push("late child released");
	});
	root.defer(() => {
		root.adopt({ child: late });
	});

	// When: the parent ends
	const ended = root.end("shutdown");
	const lateEnding = late.ending.poll();
	await ended.wait();

	// Then: the child started ending at once; the parent waited for it
	assertEquals(lateEnding, Ready("shutdown"));
	assertEquals(order, ["late child released", "first acquired, last released"]);
});

Deno.test("a fromParent that throws while adopting into an ending parent is in its report; the child stays a root", () => {
	// Given: a parent whose teardown adopts a child with a throwing mapping
	const { panics, reported } = recordingPanics();
	const root = new Lifetime<undefined, Cause>({ value: undefined, panics });
	const child = new Lifetime<number, string>({ value: 1, panics });
	root.defer(() => {
		root.adopt({
			child,
			fromParent: (): string => {
				throw new Error("no mapping");
			},
		});
	});

	// When: the parent ends
	root.end("done");

	// Then: the panic was reported and is in the report; the child is an Alive root
	const report = reportOf(root);
	assert(isErr(report));
	assertEquals(unwrapErr(report).panics[0]?.name, "Panic (CauseMappingFailed)");
	assertEquals(reported.length, 1);
	assert(isolate(child.phase(), "Alive"));
	const next = new Lifetime<undefined, string>({ value: undefined, panics });
	assert(isolate(next.adopt({ child }), "Adopted"));
});

Deno.test("a fromParent that throws while adopting into an ended parent is reported, never thrown raw", () => {
	// Given: an ended parent and a live child
	const { panics, reported } = recordingPanics();
	const root = new Lifetime<undefined, Cause>({ value: undefined, panics });
	root.end("done");
	const child = new Lifetime<number, string>({ value: 1, panics });

	// When: the child is adopted with a throwing mapping
	const adoption = root.adopt({
		child,
		fromParent: (): string => {
			throw new Error("no mapping");
		},
	});

	// Then: no throw; the hook saw it; the child is still an Alive root
	assert(isolate(adoption, "ParentEnded"));
	assertEquals(reported.length, 1);
	assert(isolate(child.phase(), "Alive"));
});

Deno.test("a fromParent that throws while mapping a dispose cause surfaces a Panic and releases the child", () => {
	// Given: a child of a root with a dispose cause, mapped by a throwing fromParent
	const { panics } = recordingPanics();
	const root = app();
	const child = root.child({
		value: 1,
		fromParent: (): string => {
			throw new Error("no mapping");
		},
	});

	// When: the child is disposed, then the root ends
	const thrown = assertThrows(() => child[Symbol.dispose]());
	root.end("shutdown");

	// Then: a Panic, not a raw Error; the child is a root the root's end didn't reach
	assert(
		thrown instanceof Panic && thrown.name === "Panic (CauseMappingFailed)",
	);
	assert(isolate(child.phase(), "Alive"));
	assertEquals(reportOf(root), Ok("shutdown"));
	const next = new Lifetime<undefined, string>({ value: undefined, panics });
	assert(isolate(next.adopt({ child }), "Adopted"));
});

Deno.test("disposing a lifetime that `end` already ended does nothing, even after failures", async () => {
	// Given: lifetimes whose teardown failed, ended by hand and handled there
	const sync = app();
	sync.defer(() => {
		throw new Error("handled by the caller of end");
	});
	sync.end("done");
	const handled = reportOf(sync);
	const async = app();
	async.defer(() => Promise.reject(new Error("handled too")));
	async.end("done");

	// When: each is disposed, twice
	sync[Symbol.dispose]();
	sync[Symbol.dispose]();
	await async[Symbol.asyncDispose]();
	await async[Symbol.asyncDispose]();

	// Then: nothing was thrown again; the reports are as end left them
	assert(isErr(handled));
	assert(isErr(reportOf(async)));
});

Deno.test("disposing a lifetime whose async teardown is running does nothing under using, and awaits it under await using", async () => {
	// Given: a lifetime already ending, with an async cleanup
	const root = app();
	let closed = false;
	root.defer(async () => {
		await Promise.resolve();
		closed = true;
	});
	root.end("done");

	// When: it's disposed synchronously, then asynchronously
	root[Symbol.dispose]();
	const before = closed;
	await root[Symbol.asyncDispose]();

	// Then: the sync dispose didn't panic; the async one waited for the teardown
	assert(!before);
	assert(closed);
});

// --- Double faults: the panic hook throws while reporting ---

Deno.test("a double fault in a sync teardown drains the stack, then end rethrows it", () => {
	// Given: a lifetime under a throwing hook, with a throwing cleanup between two others
	const root = new Lifetime<undefined, Cause>({
		value: undefined,
		panics: brokenPanics(),
	});
	const ran: string[] = [];
	root.defer(() => void ran.push("first"));
	root.defer(() => {
		throw new Error("socket already closed");
	});
	root.defer(() => void ran.push("third"));

	// When: it ends
	const thrown = assertThrows(() => root.end("done"));

	// Then: every cleanup ran and ended dispatched; end threw the PanicHook panic, also in the report
	assert(isPanicHookFailure(thrown));
	assertEquals(ran, ["third", "first"]);
	const report = reportOf(root);
	assert(isErr(report));
	assert(unwrapErr(report).panics[0] === thrown);
});

Deno.test("a double fault in an ending listener is rethrown after the teardown, and reported", () => {
	// Given: a lifetime under a throwing hook, with a throwing ending listener
	const root = new Lifetime<undefined, Cause>({
		value: undefined,
		panics: brokenPanics(),
	});
	const ran: string[] = [];
	root.ending.whenDispatched(() => {
		throw new Error("listener bug");
	});
	root.defer(() => void ran.push("cleanup"));

	// When: it ends
	const thrown = assertThrows(() => root.end("done"));

	// Then: the cleanup still ran; the report carries the double fault
	assert(isPanicHookFailure(thrown));
	assertEquals(ran, ["cleanup"]);
	const report = reportOf(root);
	assert(isErr(report) && unwrapErr(report).panics[0] === thrown);
});

Deno.test("a double fault in an async continuation is never thrown: it is in the report", async () => {
	// Given: under a throwing hook, a sync throwing cleanup beneath an async one, and a rejecting one
	const root = new Lifetime<undefined, Cause>({
		value: undefined,
		panics: brokenPanics(),
	});
	root.defer(() => {
		throw new Error("runs after the await");
	});
	root.defer(() => Promise.reject(new Error("rejected")));

	// When: it ends, and the teardown finishes
	const ended = root.end("done");
	const report = await ended.wait();

	// Then: end returned normally; both double faults are PanicHook panics in the report
	assert(isErr(report));
	const { panics } = unwrapErr(report);
	assertEquals(panics.length, 2);
	assert(panics.every((panic) => isPanicHookFailure(panic)));
});

Deno.test("a child's sync double fault reaches its parent's end", () => {
	// Given: under a throwing hook, a parent with a child whose cleanup throws
	const panics = brokenPanics();
	const root = new Lifetime<undefined, Cause>({ value: undefined, panics });
	const ran: string[] = [];
	root.defer(() => void ran.push("parent cleanup"));
	root.child({ value: 1 }).defer(() => {
		throw new Error("child cleanup failed");
	});

	// When: the parent ends
	const thrown = assertThrows(() => root.end("done"));

	// Then: the parent drained, rethrew, and its report carries the child's panic once
	assert(isPanicHookFailure(thrown));
	assertEquals(ran, ["parent cleanup"]);
	const report = reportOf(root);
	assert(isErr(report));
	assertEquals(unwrapErr(report).panics, [thrown]);
});

Deno.test("a cleanup registered after the end rethrows its sync double fault", () => {
	// Given: an ended lifetime under a throwing hook
	const root = new Lifetime<undefined, Cause>({
		value: undefined,
		panics: brokenPanics(),
	});
	root.end("done");

	// When: a throwing cleanup is registered
	const thrown = assertThrows(() => {
		root.defer(() => {
			throw new Error("too late");
		});
	});

	// Then: the double fault propagates, as a late dispatch listener's does
	assert(isPanicHookFailure(thrown));
});
