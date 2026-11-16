import { assert, assertEquals, assertThrows } from "@std/assert";
import { watchUncaught } from "./uncaught.ts";

type Handler = (value: unknown) => void;

/** A stand-in for Node's `process`: a handler list per event name. */
function fakeProcess(): {
	on: (event: string, handler: Handler) => void;
	off: (event: string, handler: Handler) => void;
	emit: (event: string, value: unknown) => void;
	count: () => number;
} {
	const handlers = new Map<string, Set<Handler>>();
	return {
		on: (event, handler) => {
			handlers.set(event, (handlers.get(event) ?? new Set()).add(handler));
		},
		off: (event, handler) => {
			handlers.get(event)?.delete(handler);
		},
		emit: (event, value) => {
			for (const handler of handlers.get(event) ?? []) handler(value);
		},
		count: () =>
			[...handlers.values()].reduce((total, set) => total + set.size, 0),
	};
}

Deno.test("watchUncaught() uses process events where the host has them", () => {
	// Given: a Node-like host
	const process = fakeProcess();
	const seen: unknown[] = [];

	// When: it is watched, both events fire, then it is unwatched
	const unwatch = watchUncaught({
		host: { process },
		listener: (error) => seen.push(error),
	});
	process.emit("unhandledRejection", "rejected");
	process.emit("uncaughtException", "thrown");
	unwatch();
	process.emit("uncaughtException", "after");

	// Then: both errors reached the listener, and unwatching removed the handlers
	assertEquals(seen, ["rejected", "thrown"]);
	assertEquals(process.count(), 0);
});

Deno.test("watchUncaught() uses global events otherwise, and suppresses their default", () => {
	// Given: a browser-like host
	const host = new EventTarget();
	const seen: unknown[] = [];
	const rejection = Object.assign(
		new Event("unhandledrejection", { cancelable: true }),
		{ reason: "rejected" },
	);
	const error = Object.assign(new Event("error", { cancelable: true }), {
		error: "thrown",
	});
	const bare = Object.assign(new Event("error", { cancelable: true }), {
		message: "Script error.",
	});

	// When: it is watched, the events fire, then it is unwatched
	const unwatch = watchUncaught({
		host,
		listener: (caught) => seen.push(caught),
	});
	host.dispatchEvent(rejection);
	host.dispatchEvent(error);
	host.dispatchEvent(bare);
	unwatch();
	host.dispatchEvent(new Event("error"));

	// Then: each reason or error reached the listener (the message when an
	// error event carries no error), and the host's default report was stopped
	assertEquals(seen, ["rejected", "thrown", "Script error."]);
	assert(rejection.defaultPrevented);
	assert(error.defaultPrevented);
});

Deno.test("watchUncaught() forwards a throw from a timer callback on an event host", () => {
	// Given: a workerd-like host whose timer keeps its callbacks to fire by hand
	const pending: Array<() => unknown> = [];
	const setTimeout = (callback: () => unknown): number =>
		pending.push(callback);
	const host = Object.assign(new EventTarget(), { setTimeout });
	const seen: unknown[] = [];

	// When: a callback scheduled while watched throws, before and after unwatching
	const unwatch = watchUncaught({
		host,
		listener: (caught) => seen.push(caught),
	});
	host.setTimeout(() => {
		throw "first";
	});
	host.setTimeout(() => {
		throw "second";
	});
	pending[0]?.();
	unwatch();

	// Then: the first throw reached the listener; once unwatched, the timer is
	// the original again and a late callback throws as it would have unguarded
	assertEquals(seen, ["first"]);
	assertEquals(host.setTimeout, setTimeout);
	assertThrows(() => pending[1]?.());
});

Deno.test("watchUncaught() panics on a host with no way to report", () => {
	// Given/When/Then: a host with neither process nor global events
	assertThrows(
		() => watchUncaught({ host: {}, listener: () => {} }),
		TypeError,
	);
});
