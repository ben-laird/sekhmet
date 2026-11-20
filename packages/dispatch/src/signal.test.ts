import { isolate, union } from "@sekhmet/enum/core/mini";
import { isPending, isReady, Pending, Ready } from "@sekhmet/enum/poll/mini";
import { definePanicRuntime, Panic, type PanicRuntime } from "@sekhmet/panic";
import { isResolved } from "@sekhmet/vow/mini";
import { assert, assertEquals, assertThrows } from "@std/assert";
import { DispatchController, DispatchSignal } from "@/mod.ts";

/** A panic runtime whose reports the test can read. */
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

/** A platform AbortSignal that counts its live abort listeners, and aborts it. */
function countingAbortSignal(): {
	readonly signal: AbortSignal;
	readonly abort: (reason: unknown) => void;
	readonly live: () => number;
} {
	const controller = new AbortController();
	const { signal } = controller;
	const listeners = new Set<unknown>();
	const once = new Set<unknown>();
	const add = signal.addEventListener.bind(signal);
	const remove = signal.removeEventListener.bind(signal);
	// The platform drops `once` listeners as the abort fires; count that too.
	add("abort", () => {
		for (const listener of once) {
			listeners.delete(listener);
		}
		once.clear();
	});
	signal.addEventListener = (
		type: string,
		listener: EventListenerOrEventListenerObject,
		options?: boolean | AddEventListenerOptions,
	): void => {
		listeners.add(listener);
		if (typeof options === "object" && options.once === true) {
			once.add(listener);
		}
		add(type, listener, options);
	};
	signal.removeEventListener = (
		type: string,
		listener: EventListenerOrEventListenerObject,
		options?: boolean | EventListenerOptions,
	): void => {
		listeners.delete(listener);
		remove(type, listener, options);
	};
	return {
		signal,
		abort: (reason) => {
			controller.abort(reason);
		},
		live: () => listeners.size,
	};
}

Deno.test("map and zip derive new signals", () => {
	// Given: two signals and a signal derived from them
	const { panics } = recordingPanics();
	const port = new DispatchController<number>(panics.catchUnwind);
	const host = new DispatchController<string>(panics.catchUnwind);
	const url = host.signal.zip(port.signal).map(([h, p]) => `http://${h}:${p}`);
	let heard: string | undefined;
	url.whenDispatched((value) => {
		heard = value;
	});

	// When: one dispatches, then the other
	host.dispatch("localhost");
	const halfway = url.poll();
	port.dispatch(8080);

	// Then: the derived signal waits for both
	assert(isPending(halfway));
	assertEquals(url.poll(), Ready("http://localhost:8080"));
	assertEquals(heard, "http://localhost:8080");
});

Deno.test("map runs its mapping once, however many readers it has", () => {
	// Given: a mapped signal that counts its calls, with two listeners
	const { panics } = recordingPanics();
	const controller = new DispatchController<number>(panics.catchUnwind);
	let calls = 0;
	const doubled = controller.signal.map((n) => {
		calls += 1;
		return n * 2;
	});
	doubled.whenDispatched(() => {});
	doubled.whenDispatched(() => {});

	// When: it dispatches and is polled twice
	controller.dispatch(21);
	const polls = [doubled.poll(), doubled.poll()];

	// Then: the mapping ran once
	assertEquals(calls, 1);
	assertEquals(polls, [Ready(42), Ready(42)]);
});

Deno.test("a throwing mapping poisons map: it runs once, and every later read is a poison panic", () => {
	// Given: a mapped signal whose mapping throws, with two listeners
	const { panics, reported } = recordingPanics();
	const controller = new DispatchController<number>(panics.catchUnwind);
	const payload = new Error("mapping bug");
	let runs = 0;
	const mapped = controller.signal.map((): number => {
		runs += 1;
		throw payload;
	});
	const heard: number[] = [];
	mapped.whenDispatched((value) => void heard.push(value));
	mapped.whenDispatched((value) => void heard.push(value));

	// When: it dispatches, then the mapped signal is polled
	controller.dispatch(1);
	const polled = assertThrows(() => mapped.poll());

	// Then: the mapping ran once; the first listener's boundary reported its throw, the second a poison panic
	assertEquals(runs, 1);
	assertEquals(heard, []);
	assertEquals(reported.length, 2);
	assert(reported[0] === payload);
	const poison = reported[1];
	assert(poison instanceof Panic && poison.name === "Panic (Poisoned)");
	assert(poison.cause === payload);
	// Then: poll threw a poison panic of its own to its caller
	assert(polled instanceof Panic && polled.cause === payload);
	assert(polled !== poison);
});

Deno.test("a derived signal holds a source's subscription only while it has listeners", () => {
	// Given: two long-lived platform sources and signals derived from them
	const { panics } = recordingPanics();
	const source = countingAbortSignal();
	const other = countingAbortSignal();
	const first = DispatchSignal.fromAbortSignal({
		signal: source.signal,
		catchUnwind: panics.catchUnwind,
	});
	const second = DispatchSignal.fromAbortSignal({
		signal: other.signal,
		catchUnwind: panics.catchUnwind,
	});
	const mapped = first.map(String);
	const zipped = first.zip(second);
	const either = DispatchSignal.any([first, second]);

	// When: the derived signals are polled, then listened to, then let go
	mapped.poll();
	zipped.poll();
	either.poll();
	const idle = source.live();
	const stops = [
		mapped.whenDispatched(() => {}),
		either.whenDispatched(() => {}),
	];
	const listening = source.live();
	for (const stop of stops) {
		stop();
	}

	// Then: the platform signal holds listeners only while someone listens downstream
	assertEquals(idle, 0);
	assertEquals(listening, 2);
	assertEquals(source.live(), 0);
	assertEquals(other.live(), 0);
});

Deno.test("zip holds only its first source until it fires, then only its second", () => {
	// Given: a zip of two platform sources, with a listener
	const { panics } = recordingPanics();
	const source = countingAbortSignal();
	const other = countingAbortSignal();
	const zipped = DispatchSignal.fromAbortSignal({
		signal: source.signal,
		catchUnwind: panics.catchUnwind,
	}).zip(
		DispatchSignal.fromAbortSignal({
			signal: other.signal,
			catchUnwind: panics.catchUnwind,
		}),
	);
	const stop = zipped.whenDispatched(() => {});
	const beforeFirst = [source.live(), other.live()];

	// When: the first source fires, then the listener is let go
	source.abort("a");
	const afterFirst = [source.live(), other.live()];
	const removed = stop();

	// Then: it held A alone, then B alone, then nothing
	assertEquals(beforeFirst, [1, 0]);
	assertEquals(afterFirst, [0, 1]);
	assert(removed);
	assertEquals([source.live(), other.live()], [0, 0]);
});

Deno.test("toAbortSignal on a signal that has already dispatched aborts at once", () => {
	// Given: a signal that has already dispatched
	const { panics } = recordingPanics();
	const controller = new DispatchController<string>(panics.catchUnwind);
	controller.dispatch("gone");

	// When: it's converted
	const platform = controller.signal.toAbortSignal();

	// Then: the platform signal is already aborted with the value
	assert(platform.aborted);
	assertEquals(platform.reason, "gone");
});

Deno.test("a DispatchSignal can't be built without a controller", () => {
	// Given: no token (only the package holds it)
	const forged = Symbol("DispatchSignal");

	// When: someone builds one anyway, bypassing the types
	const attempt = (): unknown => {
		return new DispatchSignal({
			// @ts-expect-error: the token's type is unexported, so no outside value fits
			token: forged,
			source: {
				poll: () => Pending(),
				listen: () => () => false,
			},
		});
	};

	// Then: it throws, like new AbortSignal()
	assertThrows(attempt, TypeError, "Illegal constructor");
});

Deno.test("any dispatches with the first source and lets go of the rest", () => {
	// Given: three sources combined with any, with a listener
	const { panics } = recordingPanics();
	const timeout = new DispatchController<string>(panics.catchUnwind);
	const user = new DispatchController<string>(panics.catchUnwind);
	const shutdown = new DispatchController<string>(panics.catchUnwind);
	const stop = DispatchSignal.any([
		timeout.signal,
		user.signal,
		shutdown.signal,
	]);
	const heard: string[] = [];
	stop.whenDispatched((reason) => void heard.push(reason));

	// When: the user source fires first, then another
	user.dispatch("user pressed stop");
	timeout.dispatch("timed out");

	// Then: the first one decided it, once
	assertEquals(stop.poll(), Ready("user pressed stop"));
	assertEquals(heard, ["user pressed stop"]);
	assert(isPending(DispatchSignal.any<string>([]).poll()));
});

Deno.test("an Unsubscribe reports true only the first time it removes a waiting listener", () => {
	// Given: a waiting listener on any and on zip, and listeners on dispatched and never
	const { panics } = recordingPanics();
	const a = new DispatchController<string>(panics.catchUnwind);
	const b = new DispatchController<number>(panics.catchUnwind);
	const heard: string[] = [];
	const stops = {
		any: DispatchSignal.any([a.signal]).whenDispatched(() => {
			heard.push("any");
		}),
		zip: a.signal.zip(b.signal).whenDispatched(() => {
			heard.push("zip");
		}),
		dispatched: DispatchSignal.dispatched({
			value: "done",
			catchUnwind: panics.catchUnwind,
		}).whenDispatched(() => {}),
		never: DispatchSignal.never<string>().whenDispatched(() => {}),
	};

	// When: each is unsubscribed twice, then the sources dispatch
	const first = Object.values(stops).map((stop) => stop());
	const second = Object.values(stops).map((stop) => stop());
	a.dispatch("a");
	b.dispatch(1);

	// Then: only the waiting ones were removed, once, and neither ran
	assertEquals(first, [true, true, false, false]);
	assertEquals(second, [false, false, false, false]);
	assertEquals(heard, []);
});

Deno.test("any's Unsubscribe reports false once its listener has run", () => {
	// Given: a listener on any
	const { panics } = recordingPanics();
	const a = new DispatchController<string>(panics.catchUnwind);
	const stop = DispatchSignal.any([a.signal]).whenDispatched(() => {});

	// When: its source dispatches
	a.dispatch("a");

	// Then: there's nothing left to remove
	assertEquals(stop(), false);
});

Deno.test("any, read after its sources dispatched, picks the earliest in order", () => {
	// Given: two sources that have both dispatched, the later one first
	const { panics } = recordingPanics();
	const a = new DispatchController<string>(panics.catchUnwind);
	const b = new DispatchController<string>(panics.catchUnwind);
	b.dispatch("b");
	a.dispatch("a");
	const either = DispatchSignal.any([a.signal, b.signal]);

	// When: a listener is added
	const heard: string[] = [];
	const stop = either.whenDispatched((value) => void heard.push(value));

	// Then: the earliest in the list won, the listener ran at once, and nothing is held
	assertEquals(either.poll(), Ready("a"));
	assertEquals(heard, ["a"]);
	assertEquals(stop(), false);
});

Deno.test("it bridges to AbortSignal both ways, for fetch and friends", async () => {
	// Given: a dispatch signal and a platform AbortController
	const { panics } = recordingPanics();
	const cancel = new DispatchController<string>(panics.catchUnwind);
	const forFetch = cancel.signal.toAbortSignal();
	const platform = new AbortController();
	const fromPlatform = DispatchSignal.fromAbortSignal({
		signal: platform.signal,
		catchUnwind: panics.catchUnwind,
	});
	const heard = fromPlatform.wait();

	// When: each side fires
	cancel.dispatch("user cancelled");
	platform.abort("socket closed");

	// Then: the AbortSignal aborted with the typed value, and the dispatch carries the abort reason
	assert(forFetch.aborted);
	assertEquals(forFetch.reason, "user cancelled");
	assertEquals(await heard, "socket closed");
	assertEquals(fromPlatform.poll(), Ready("socket closed"));
});

Deno.test("a throwing listener on an aborted platform signal is a reported panic", () => {
	// Given: a dispatch signal over a platform signal, with a throwing listener
	const { panics, reported } = recordingPanics();
	const platform = new AbortController();
	const fromPlatform = DispatchSignal.fromAbortSignal({
		signal: platform.signal,
		catchUnwind: panics.catchUnwind,
	});
	fromPlatform.whenDispatched(() => {
		throw new Error("listener bug");
	});

	// When: the platform signal aborts
	platform.abort("closed");

	// Then: the throw reached the hook instead of the platform's event dispatch
	assertEquals(reported.length, 1);
	assert(
		reported[0] instanceof Error && reported[0].message === "listener bug",
	);
});

Deno.test("toVow makes a new Vow, settled synchronously", () => {
	// Given: a signal and two vows of it
	const { panics } = recordingPanics();
	const controller = new DispatchController<number>(panics.catchUnwind);
	const first = controller.signal.toVow();
	const second = controller.signal.toVow();

	// When: it dispatches
	controller.dispatch(42);

	// Then: each call made its own vow, and both resolved with no microtask in between
	assert(first !== second);
	assert(isResolved(first) && isResolved(second));
});

Deno.test("dispatched and never are signals with no controller", () => {
	// Given: one of each
	const { panics } = recordingPanics();
	const done = DispatchSignal.dispatched({
		value: "done",
		catchUnwind: panics.catchUnwind,
	});
	const forever = DispatchSignal.never<string>();

	// When: each is polled
	const polled = [done.poll(), forever.poll()];

	// Then: one is ready, the other pending
	assert(isReady(polled[0] ?? Pending()));
	const value = polled[0];
	assert(
		value !== undefined && isolate(value, "Ready") && union(value) === "done",
	);
	assert(isPending(polled[1] ?? Ready("")));
});

Deno.test("an async listener is a compile error", () => {
	// Given: a signal
	const { panics } = recordingPanics();
	const controller = new DispatchController<string>(panics.catchUnwind);
	const heard: string[] = [];

	// When: a synchronous listener and an async one are added
	controller.signal.whenDispatched((value) => {
		heard.push(value);
	});
	const stop = controller.signal.whenDispatched(
		// @ts-expect-error: a listener returns undefined, never a promise
		async (value: string): Promise<void> => {
			await Promise.resolve();
			heard.push(`async ${value}`);
		},
	);
	stop();
	controller.dispatch("x");

	// Then: only the synchronous one type-checks (the async one was removed before it could run)
	assertEquals(heard, ["x"]);
});

Deno.test("DispatchSignal is covariant", () => {
	// Given: a signal of a narrow type
	const { panics } = recordingPanics();
	const narrow: DispatchSignal<"done" | "cancelled"> = new DispatchController<
		"done" | "cancelled"
	>(panics.catchUnwind).signal;

	// When: it's used where a wider signal is expected
	const wide: DispatchSignal<string> = narrow;

	// Then: it type-checks (and the reverse would not)
	// @ts-expect-error: a DispatchSignal<string> is not a DispatchSignal<"done" | "cancelled">
	const back: DispatchSignal<"done" | "cancelled"> = wide;
	assert(back === narrow);
});
