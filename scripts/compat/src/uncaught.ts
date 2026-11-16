/**
 * Catches errors no test awaited: a rejection nothing handled, or a throw from
 * a callback such as a timer. Deno fails a test run on either; without a
 * watcher, other runtimes only log them (browsers), drop them (workerd, for a
 * timer callback) or crash the process before it reports (Node, Bun).
 *
 * This module is bundled into every runtime, so it must not use Deno APIs.
 *
 * @module
 */

/** Receives each uncaught error: the rejection reason or the thrown value. */
export type UncaughtListener = (error: unknown) => void;

/** Removes the listeners a watcher installed. */
export type Unwatch = () => void;

type Handler = (value: unknown) => void;

/** Node's and Bun's `process` events. */
interface ProcessEvents {
	on: (event: string, handler: Handler) => unknown;
	off: (event: string, handler: Handler) => unknown;
}

/** A global `EventTarget`, as in browsers and workerd. */
interface EventHost {
	addEventListener: (type: string, handler: Handler) => void;
	removeEventListener: (type: string, handler: Handler) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isProcessEvents(value: unknown): value is ProcessEvents {
	return (
		isRecord(value) &&
		typeof value.on === "function" &&
		typeof value.off === "function"
	);
}

function isEventHost(
	value: unknown,
): value is EventHost & Record<string, unknown> {
	return (
		isRecord(value) &&
		typeof value.addEventListener === "function" &&
		typeof value.removeEventListener === "function"
	);
}

function field(value: unknown, key: string): unknown {
	return isRecord(value) ? value[key] : undefined;
}

/** Stops the host's default report, since the suite reports the error itself. */
function suppress(event: unknown): void {
	const preventDefault = field(event, "preventDefault");
	if (typeof preventDefault === "function") preventDefault.call(event);
}

function watchProcess({
	process,
	listener,
}: {
	process: ProcessEvents;
	listener: UncaughtListener;
}): Unwatch {
	const handler: Handler = (error) => listener(error);
	process.on("unhandledRejection", handler);
	process.on("uncaughtException", handler);
	return () => {
		process.off("unhandledRejection", handler);
		process.off("uncaughtException", handler);
	};
}

/** The timer functions whose callbacks {@linkcode guardTimer} wraps. */
const TIMERS = ["setTimeout", "setInterval"] as const;

/**
 * Replaces the host's timer `name` with one whose callbacks forward a throw
 * to `listener`: workerd drops a throw from a timer callback without firing
 * `error`. Unwatching restores the original; a callback that fires after
 * that rethrows, as it would have without the guard.
 */
function guardTimer({
	host,
	name,
	listener,
}: {
	host: Record<string, unknown>;
	name: (typeof TIMERS)[number];
	listener: UncaughtListener;
}): Unwatch {
	const original = host[name];
	if (typeof original !== "function") return () => {};
	let active = true;
	const guard =
		(callback: unknown) =>
		(...args: unknown[]): unknown => {
			if (typeof callback !== "function") return undefined;
			try {
				return Reflect.apply(callback, undefined, args);
			} catch (caught: unknown) {
				if (!active) throw caught;
				listener(caught);
				return undefined;
			}
		};
	host[name] = (callback: unknown, ...rest: unknown[]): unknown =>
		Reflect.apply(original, host, [
			typeof callback === "function" ? guard(callback) : callback,
			...rest,
		]);
	return () => {
		active = false;
		host[name] = original;
	};
}

function watchEvents({
	host,
	listener,
}: {
	host: EventHost & Record<string, unknown>;
	listener: UncaughtListener;
}): Unwatch {
	const onRejection: Handler = (event) => {
		suppress(event);
		listener(field(event, "reason"));
	};
	const onError: Handler = (event) => {
		suppress(event);
		listener(field(event, "error") ?? field(event, "message"));
	};
	host.addEventListener("unhandledrejection", onRejection);
	host.addEventListener("error", onError);
	const unguard = TIMERS.map((name) => guardTimer({ host, name, listener }));
	return () => {
		host.removeEventListener("unhandledrejection", onRejection);
		host.removeEventListener("error", onError);
		for (const restore of unguard) restore();
	};
}

/**
 * Sends every uncaught error on `host` to `listener` until unwatched: through
 * `process`'s `unhandledRejection` and `uncaughtException` events where the
 * host has them (Node, Bun; they also keep the process alive), otherwise
 * through the global `unhandledrejection` and `error` events (browsers,
 * workerd), whose default report is suppressed, plus a guard on
 * `setTimeout`/`setInterval` callbacks, whose throws workerd otherwise drops.
 *
 * Panics on a host with neither: the suite could not keep its promise to
 * report uncaught errors there.
 *
 * @param options.host - The global object, `globalThis` in the bundle
 * @param options.listener - Receives each uncaught error
 * @returns A function that removes the listeners and restores the timers
 */
export function watchUncaught({
	host,
	listener,
}: {
	host: unknown;
	listener: UncaughtListener;
}): Unwatch {
	const process = field(host, "process");
	if (isProcessEvents(process)) return watchProcess({ process, listener });
	if (isEventHost(host)) return watchEvents({ host, listener });
	throw new TypeError(
		"compat: the runtime has no way to report uncaught errors",
	);
}
