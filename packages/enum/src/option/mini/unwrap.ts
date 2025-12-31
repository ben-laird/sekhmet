import { match, union } from "@/src/core/mini/exit.ts";
import { assertIsolated } from "@/src/core/mini/isolate.ts";
import type { Option } from "./core.ts";

/**
 * Unwraps an Option, yielding the contained value or throwing an error with a custom message.
 *
 * @param self - The Option to unwrap
 * @param message - Custom error message to use if the Option is None
 * @returns The contained value
 * @throws Error with the provided message if the Option is None
 *
 * @example
 * ```ts ignore
 * expect(Some(42), "value should exist"); // 42
 * expect(None(), "value should exist");   // throws Error: "value should exist"
 * ```
 */
export function expect<T>(self: Option<T>, message: string): T {
	assertIsolated(self, "Some", message);

	return union(self);
}

/**
 * Unwraps an Option, yielding the contained value or throwing a generic error.
 *
 * Use this when you're certain the Option contains a value. For production code,
 * consider using expect() with a descriptive message or unwrapOr() instead.
 *
 * @param self - The Option to unwrap
 * @returns The contained value
 * @throws Error with message "Option unwrap failed!" if the Option is None
 *
 * @example
 * ```ts ignore
 * unwrap(Some(42)); // 42
 * unwrap(None());   // throws Error: "Option unwrap failed!"
 * ```
 */
export function unwrap<T>(self: Option<T>): T {
	return expect(self, "Option unwrap failed!");
}

/**
 * Returns the contained value if Some, or a default value if None.
 *
 * This is a safe way to extract values from Options without throwing errors.
 *
 * @param self - The Option to unwrap
 * @param defaultValue - The value to return if self is None
 * @returns The contained value if self is Some, otherwise defaultValue
 *
 * @example
 * ```ts ignore
 * unwrapOr(Some(42), 0); // 42
 * unwrapOr(None(), 0);   // 0
 * ```
 */
export function unwrapOr<T>(self: Option<T>, defaultValue: T): T {
	return match(self)({
		Some: (value) => value,
		None: () => defaultValue,
	});
}
