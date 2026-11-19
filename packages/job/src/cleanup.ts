/**
 * {@linkcode Cleanup}: a job's cleanup stack, as its context factory and its
 * `run` see it. The runner owns the stack and disposes it once the job's
 * `run` settles; job code only registers what to dispose.
 *
 * It mirrors the standard `AsyncDisposableStack`'s `defer`, `use` and
 * `adopt`, but it isn't the native stack: Safari and WebKit lack one, and
 * this reads `Symbol.asyncDispose` and `Symbol.dispose` only where the
 * runtime defines them, polyfilling nothing.
 *
 * @module
 */

import { panic } from "@sekhmet/panic/mini/core";

/**
 * A job's cleanup stack: what the job registers is disposed in reverse
 * order (LIFO) once its `run` settles, however it settles. The context
 * factory registers first, so its resources go last.
 *
 * The methods mirror `AsyncDisposableStack`'s names and meaning, and so its
 * positional parameters too. There is no `disposeAsync`: the runner owns
 * disposal. Registering once disposal has started is a bug, and panics
 * (`CleanupAfterDispose`).
 */
export interface Cleanup {
	/**
	 * Registers `onDispose`, called with no arguments at disposal.
	 *
	 * @param onDispose What to do at disposal; awaited if it returns a promise
	 */
	defer(onDispose: () => void | Promise<void>): void;
	/**
	 * Registers `resource`'s `[Symbol.asyncDispose]()`, or its
	 * `[Symbol.dispose]()` if it has no async one, and returns it. `null`
	 * and `undefined` are returned as they are, registering nothing. A
	 * resource with neither method is a bug, and panics (`NotDisposable`).
	 *
	 * @param resource The resource to dispose
	 * @returns `resource`
	 */
	use<R extends AsyncDisposable | Disposable | null | undefined>(
		resource: R,
	): R;
	/**
	 * Registers `onDispose(value)`, for a value that isn't disposable itself,
	 * and returns `value`.
	 *
	 * @param value The value to dispose
	 * @param onDispose How to dispose it; awaited if it returns a promise
	 * @returns `value`
	 */
	adopt<V>(value: V, onDispose: (value: V) => void | Promise<void>): V;
}

/**
 * The cause of a `Cleanup` misuse panic: `CleanupAfterDispose` (a
 * registration once disposal started) or `NotDisposable` (`use` with a
 * value that has neither dispose method).
 */
export interface CleanupMisuseCause {
	/** The method that was misused */
	readonly method: "defer" | "use" | "adopt";
}

/**
 * Something thrown, kept as a value.
 */
export interface Thrown {
	/** What was thrown */
	readonly error: unknown;
}

/**
 * A cleanup stack as its owner, the runner, holds it.
 */
export interface CleanupStack {
	/** The stack as job code sees it */
	readonly cleanup: Cleanup;
	/**
	 * Disposes every registration, LIFO, once; a later call does nothing.
	 * Each throw is composed onto the error so far as `SuppressedError` does:
	 * the new one is `error`, the earlier one `suppressed`.
	 *
	 * @param prior What the job's `run` threw, if it threw
	 * @returns `prior` itself when no disposal threw, else the composed error
	 */
	readonly dispose: (prior: Thrown | undefined) => Promise<Thrown | undefined>;
}

/**
 * Makes an empty cleanup stack.
 *
 * @returns The stack, and the way to dispose it
 */
export function cleanupStack(): CleanupStack {
	const disposers: (() => unknown)[] = [];
	let disposing = false;

	const register = ({
		method,
		disposer,
	}: {
		readonly method: CleanupMisuseCause["method"];
		readonly disposer: () => unknown;
	}): void => {
		if (disposing) {
			panic<CleanupMisuseCause>({
				name: "CleanupAfterDispose",
				message: `cleanup.${method}() was called after the job's cleanup started`,
				cause: { method },
			});
		}
		disposers.push(disposer);
	};

	const cleanup: Cleanup = {
		defer: (onDispose) => {
			register({ method: "defer", disposer: onDispose });
		},
		use: (resource) => {
			if (resource === null || resource === undefined) {
				register({ method: "use", disposer: () => {} });
				return resource;
			}
			const disposer = disposerOf(resource);
			if (disposer === undefined) {
				return panic<CleanupMisuseCause>({
					name: "NotDisposable",
					message:
						"cleanup.use() was given a value with neither Symbol.asyncDispose nor Symbol.dispose",
					cause: { method: "use" },
				});
			}
			register({ method: "use", disposer });
			return resource;
		},
		adopt: (value, onDispose) => {
			register({ method: "adopt", disposer: () => onDispose(value) });
			return value;
		},
	};

	const dispose = async (
		prior: Thrown | undefined,
	): Promise<Thrown | undefined> => {
		if (disposing) return prior;
		disposing = true;
		let thrown = prior;
		for (const disposer of disposers.toReversed()) {
			try {
				await disposer();
			} catch (error) {
				thrown = { error: compose({ error, earlier: thrown }) };
			}
		}
		disposers.length = 0;
		return thrown;
	};

	return { cleanup, dispose };
}

/** The error a disposal throw leaves: itself, or it suppressing `earlier`. */
function compose({
	error,
	earlier,
}: {
	readonly error: unknown;
	readonly earlier: Thrown | undefined;
}): unknown {
	if (earlier === undefined) return error;
	return suppressedError({
		error,
		suppressed: earlier.error,
		native: nativeSuppressedError(),
	});
}

/**
 * `error` suppressing `suppressed`: the runtime's `SuppressedError` where it
 * has one, else a {@linkcode LocalSuppressedError} of the same shape.
 *
 * @param options The new error, and the earlier one it suppresses
 * @returns The composed error
 */
export function suppressedError({
	error,
	suppressed,
	native,
}: {
	readonly error: unknown;
	readonly suppressed: unknown;
	/** The runtime's `SuppressedError`, or `undefined` where it has none */
	readonly native: SuppressedErrorConstructor | undefined;
}): Error {
	if (native !== undefined) {
		return new native(error, suppressed, SUPPRESSED_MESSAGE);
	}
	return new LocalSuppressedError({ error, suppressed });
}

const SUPPRESSED_MESSAGE = "An error was suppressed during a job's cleanup";

/**
 * A `SuppressedError` for runtimes without one: the same `name`, `error`
 * and `suppressed`, without touching the global.
 */
export class LocalSuppressedError extends Error {
	override readonly name: "SuppressedError" = "SuppressedError";
	/** The error thrown last */
	readonly error: unknown;
	/** The earlier error it suppressed */
	readonly suppressed: unknown;

	constructor({
		error,
		suppressed,
	}: {
		readonly error: unknown;
		readonly suppressed: unknown;
	}) {
		super(SUPPRESSED_MESSAGE);
		this.error = error;
		this.suppressed = suppressed;
	}
}

/** The runtime's `SuppressedError`, read only if it defines one. */
function nativeSuppressedError(): SuppressedErrorConstructor | undefined {
	const native: unknown = globalThis.SuppressedError;
	if (typeof native !== "function") return undefined;
	return globalThis.SuppressedError;
}

/**
 * How to dispose `resource`, as `AsyncDisposableStack.use` finds it: its
 * `[Symbol.asyncDispose]`, else its `[Symbol.dispose]` (whose result isn't
 * awaited), reading each symbol only if the runtime defines it.
 */
function disposerOf(resource: object): (() => unknown) | undefined {
	const asyncDispose = methodOf({ resource, key: wellKnown("asyncDispose") });
	if (asyncDispose !== undefined) return asyncDispose;
	const dispose = methodOf({ resource, key: wellKnown("dispose") });
	if (dispose === undefined) return undefined;
	return () => {
		dispose();
	};
}

/** `Symbol[name]`, if the runtime defines it. */
function wellKnown(name: "asyncDispose" | "dispose"): symbol | undefined {
	const symbol: unknown = Reflect.get(Symbol, name);
	return typeof symbol === "symbol" ? symbol : undefined;
}

/** Calls `resource[key]()`, if `key` is defined and names a function. */
function methodOf({
	resource,
	key,
}: {
	readonly resource: object;
	readonly key: symbol | undefined;
}): (() => unknown) | undefined {
	if (key === undefined) return undefined;
	const method: unknown = Reflect.get(resource, key);
	if (typeof method !== "function") return undefined;
	return () => Reflect.apply(method, resource, []);
}
