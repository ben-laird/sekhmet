import { Err, Ok, type Result } from "@sekhmet/enum/result/mini/core";
import { Panic } from "./core.ts";

/**
 * A function that wraps another function with panic handling.
 *
 * @template E The error type returned when a panic is caught
 */
export interface WithPanicHook<E> {
	/**
	 * Executes a function and catches any Panic, converting it to a Result.
	 *
	 * @template T The return type of the function
	 * @param fn The function to execute
	 * @returns Ok with the result, or Err with the converted panic
	 */
	<T>(fn: () => T): Result<T, E>;
	/** The underlying panic handler */
	handler: PanicHandler<E>;
}

/**
 * A function that converts a Panic to an error type.
 *
 * @template E The error type to convert to
 */
export type PanicHook<E> = (err: Panic<unknown>) => E;

/**
 * Parameters for creating a panic hook.
 *
 * @template E The error type returned when a panic is caught
 */
export interface PanicHookParams<E> {
	/** The hook function to convert panics to errors */
	hook: PanicHook<E>;
	/** Whether to wrap non-Panic errors as Panics (default: true) */
	wrapNonPanics?: boolean | undefined;
}

/**
 * Creates a function that catches Panics and converts them to Results.
 *
 * This is useful for defining error boundaries where panics should be
 * caught and converted to a specific error type rather than propagating.
 *
 * @template E The error type to convert panics to
 * @param params Configuration for the panic hook
 * @returns A function that wraps other functions with panic handling
 *
 * @example
 * ```ts ignore
 * const withPanic = definePanicHook({
 *   hook: (panic) => ({ type: "panic", message: panic.message }),
 *   wrapNonPanics: true,
 * });
 *
 * const result = withPanic(() => {
 *   if (condition) panic({ message: "Something went wrong", cause: null });
 *   return "success";
 * });
 *
 * match(result)({
 *   Ok: (value) => console.log("Success:", value),
 *   Err: (error) => console.log("Error:", error.message),
 * });
 * ```
 */
export function definePanicHook<E>({
	hook,
	wrapNonPanics = true,
}: PanicHookParams<E>): WithPanicHook<E> {
	const handler = new PanicHandler({ hook, wrapNonPanics });

	const runWithPanicHook: WithPanicHook<E> = (fn) => {
		try {
			return Ok(fn());
		} catch (cause: unknown) {
			if (!(cause instanceof Panic)) {
				if (!wrapNonPanics) {
					throw cause;
				}

				throw new Panic({
					name: "NonPanic",
					get message() {
						const base = "Something other than a panic was thrown";
						return `${base}: ${cause}`;
					},
					cause,
				});
			}

			return Err(handler.panicHook(cause));
		}
	};

	runWithPanicHook.handler = handler;

	return runWithPanicHook;
}

interface PanicHandlerParams<E> {
	hook: PanicHook<E>;
	wrapNonPanics: boolean;
}

/**
 * Manages panic handling configuration and allows modification.
 *
 * @template E The error type returned when a panic is caught
 */
export class PanicHandler<E> {
	/**
	 * Creates a new PanicHandler instance.
	 *
	 * @param params Configuration parameters including the panic hook function
	 */
	constructor(params: PanicHandlerParams<E>) {
		this.#params = params;
	}

	#params: PanicHandlerParams<E>;

	/**
	 * The current panic hook function.
	 */
	get panicHook(): PanicHook<E> {
		return this.#params.hook;
	}

	/**
	 * Replaces the panic hook with a new one.
	 *
	 * @param replacementPanicHook The new hook function
	 * @returns This handler for chaining
	 */
	replace(replacementPanicHook: PanicHook<E>): this {
		this.#params.hook = replacementPanicHook;
		return this;
	}

	/**
	 * Creates a new panic hook that transforms the error type.
	 *
	 * @template F The new error type
	 * @param fn Function to transform the error
	 * @returns A new WithPanicHook with the transformed error type
	 */
	map<F>(fn: (err: E) => F): WithPanicHook<F> {
		return definePanicHook({
			hook: (panic) => {
				return fn(this.panicHook(panic));
			},
			wrapNonPanics: this.#params.wrapNonPanics,
		});
	}
}
