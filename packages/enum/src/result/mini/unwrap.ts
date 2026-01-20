import { match, union } from "@/src/core/mini/exit.ts";
import { assertIsolated } from "@/src/core/mini/isolate.ts";
import type { Result } from "./core.ts";

/**
 * Returns the success value, or throws with a custom message if Err.
 *
 * Use this when you want to provide a meaningful error message that explains
 * why the Result should have been Ok. This is preferred over `unwrap` when
 * the expectation has context that would help debugging.
 *
 * @template T The type of the success value
 * @template E The type of the error value
 * @param self The Result to unwrap
 * @param message The error message to throw if the Result is Err
 * @returns The success value
 * @throws Error with the provided message if the Result is Err
 *
 * @example
 * ```ts ignore
 * const config = Ok({ port: 8080 });
 * const port = expect(config, "Config must be loaded").port; // 8080
 *
 * const missing = Err("file not found");
 * expect(missing, "Config file is required"); // Throws: "Config file is required"
 * ```
 */
export function expect<T, E>(self: Result<T, E>, message: string): T {
	assertIsolated(self, "Ok", message);

	return union(self);
}

/**
 * Returns the success value, or throws if Err.
 *
 * This is a convenience method that throws a generic error message. Prefer
 * `expect` when you have context about why the Result should be Ok, as it
 * produces better error messages for debugging.
 *
 * @template T The type of the success value
 * @template E The type of the error value
 * @param self The Result to unwrap
 * @returns The success value
 * @throws Error if the Result is Err
 *
 * @example
 * ```ts ignore
 * const success = Ok(42);
 * const value = unwrap(success); // 42
 *
 * const error = Err("failed");
 * unwrap(error); // Throws: "Result unwrap failed!"
 * ```
 */
export function unwrap<T, E>(self: Result<T, E>): T {
	return expect(self, "Result unwrap failed!");
}

/**
 * Returns the error value, or throws with a custom message if Ok.
 *
 * Use this when you expect a Result to be an error and want to extract
 * the error value. This is useful in tests or when error handling requires
 * access to the error details.
 *
 * @template T The type of the success value
 * @template E The type of the error value
 * @param self The Result to unwrap
 * @param message The error message to throw if the Result is Ok
 * @returns The error value
 * @throws Error with the provided message if the Result is Ok
 *
 * @example
 * ```ts ignore
 * const error = Err({ code: 404, message: "Not found" });
 * const errValue = expectErr(error, "Should have failed"); // { code: 404, ... }
 *
 * const success = Ok(42);
 * expectErr(success, "Expected an error"); // Throws: "Expected an error"
 * ```
 */
export function expectErr<T, E>(self: Result<T, E>, message: string): E {
	assertIsolated(self, "Err", message);

	return union(self);
}

/**
 * Returns the error value, or throws if Ok.
 *
 * This is a convenience method that throws a generic error message. Prefer
 * `expectErr` when you have context about why the Result should be Err, as it
 * produces better error messages for debugging.
 *
 * @template T The type of the success value
 * @template E The type of the error value
 * @param self The Result to unwrap
 * @returns The error value
 * @throws Error if the Result is Ok
 *
 * @example
 * ```ts ignore
 * const error = Err("something went wrong");
 * const errValue = unwrapErr(error); // "something went wrong"
 *
 * const success = Ok(42);
 * unwrapErr(success); // Throws: "Result unwrap failed!"
 * ```
 */
export function unwrapErr<T, E>(self: Result<T, E>): E {
	return expectErr(self, "Result unwrap failed!");
}

/**
 * Returns the success value, or a default value if Err.
 *
 * This is a safe way to extract a value from a Result without throwing,
 * providing a fallback when the operation failed.
 *
 * @template T The type of the success value and default value
 * @template E The type of the error value
 * @param self The Result to unwrap
 * @param defaultValue The value to return if the Result is Err
 * @returns The success value if Ok, otherwise the default value
 *
 * @example
 * ```ts ignore
 * const success = Ok(42);
 * const value = unwrapOr(success, 0); // 42
 *
 * const error = Err("failed");
 * const fallback = unwrapOr(error, 0); // 0
 * ```
 */
export function unwrapOr<T, E>(self: Result<T, E>, defaultValue: T): T {
	return match(self)({
		Ok: (value) => value,
		Err: () => defaultValue,
	});
}

/**
 * Returns the success value, or computes a fallback from the error.
 *
 * This is similar to `unwrapOr` but allows the fallback value to be computed
 * lazily and can use information from the error to produce the fallback.
 *
 * @template T The type of the success value
 * @template E The type of the error value
 * @param self The Result to unwrap
 * @param fallback A function that takes the error value and returns a fallback
 * @returns The success value if Ok, otherwise the result of the fallback function
 *
 * @example
 * ```ts ignore
 * const success = Ok(42);
 * const value = unwrapOrElse(success, () => expensiveComputation()); // 42
 *
 * const error = Err({ code: 404 });
 * const fallback = unwrapOrElse(error, (e) => e.code === 404 ? 0 : -1); // 0
 * ```
 */
export function unwrapOrElse<T, E>(
	self: Result<T, E>,
	fallback: (err: E) => T,
): T {
	return match(self)({
		Ok: (value) => value,
		Err: fallback,
	});
}
