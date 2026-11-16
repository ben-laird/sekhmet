import { match, union } from "@/src/core/mini/exit.ts";
import { isolate } from "@/src/core/mini/isolate.ts";
import { None, type Option, Some } from "./core.ts";

/**
 * Transforms the value inside an Option by applying a function to it.
 *
 * If the Option is Some(value), returns Some(mapping(value)).
 * If the Option is None, returns None.
 *
 * @param self - The Option to transform
 * @param mapping - Function to apply to the value
 * @returns Some containing the transformed value if self is Some, otherwise None
 *
 * @example
 * ```ts ignore
 * map(Some(10), (x) => x * 2); // Some(20)
 * map(None(), (x) => x * 2);   // None
 * ```
 */
export function map<T, U>(
	self: Option<T>,
	mapping: (value: T) => U,
): Option<U> {
	return match(self)({
		Some: (value) => Some(mapping(value)),
		None,
	});
}

/**
 * Calls a function with the contained value if the Option is Some, then returns the Option unchanged.
 *
 * This is useful for debugging or performing side effects without consuming the Option.
 * The Option is always returned as-is.
 *
 * @param self - The Option to inspect
 * @param inspector - Function to call with the value if the Option is Some
 * @returns The original Option unchanged
 *
 * @example
 * ```ts ignore
 * inspect(Some(42), (x) => console.log(x)); // logs 42, returns Some(42)
 * inspect(None(), (x) => console.log(x));   // logs nothing, returns None
 * ```
 */
export function inspect<T>(
	self: Option<T>,
	inspector: (value: T) => void,
): Option<T> {
	const variant = self;

	if (isolate(variant, "Some")) {
		inspector(union(variant));
	}

	return self;
}

/**
 * Calls a function if the Option is None, then returns the Option unchanged.
 *
 * This is useful for debugging or performing side effects when an Option is empty.
 * The Option is always returned as-is.
 *
 * @param self - The Option to inspect
 * @param inspector - Function to call if the Option is None
 * @returns The original Option unchanged
 *
 * @example
 * ```ts ignore
 * inspectNone(None(), () => console.log("empty")); // logs "empty", returns None
 * inspectNone(Some(42), () => console.log("empty")); // logs nothing, returns Some(42)
 * ```
 */
export function inspectNone<T>(
	self: Option<T>,
	inspector: () => void,
): Option<T> {
	if (isolate(self, "None")) {
		inspector();
	}

	return self;
}

/**
 * Maps an Option to a value by applying a function to the contained value or returning a default.
 *
 * Supports both object-based and positional parameter styles.
 *
 * @param self - The Option to map
 * @param handlers - Either an object with `defaultValue` and `mapping`, or positional parameters
 * @returns The result of mapping if self is Some, otherwise the default value
 *
 * @example
 * ```ts ignore
 * // Object style
 * mapOr(Some(10), { defaultValue: 0, mapping: (x) => x * 2 }); // 20
 * mapOr(None(), { defaultValue: 0, mapping: (x) => x * 2 });   // 0
 *
 * // Positional style
 * mapOr(Some(10), 0, (x) => x * 2); // 20
 * mapOr(None(), 0, (x) => x * 2);   // 0
 * ```
 */
export function mapOr<T, U>(
	self: Option<T>,
	handlers: {
		defaultValue: U;
		mapping: (value: T) => U;
	},
): U;
/**
 * Maps an Option to a value by applying a function to the contained value or returning a default.
 *
 * @param self - The Option to map
 * @param handlers - Positional parameters: defaultValue and mapping function
 * @returns The result of mapping if self is Some, otherwise the default value
 */
export function mapOr<T, U>(
	self: Option<T>,
	...handlers: [defaultValue: U, mapping: (value: T) => U]
): U;
export function mapOr<T, U>(
	self: Option<T>,
	...handlers:
		| [{ defaultValue: U; mapping: (value: T) => U }]
		| [defaultValue: U, mapping: (value: T) => U]
): U {
	return match(self)({
		Some(value) {
			if (handlers.length === 2) {
				return handlers[1](value);
			}

			const { mapping } = handlers[0];

			return mapping(value);
		},
		None() {
			if (handlers.length === 2) {
				return handlers[0];
			}

			const { defaultValue } = handlers[0];

			return defaultValue;
		},
	});
}

/**
 * Maps an Option to a value by applying one of two functions.
 *
 * Calls the Some function with the contained value if the Option is Some,
 * or calls the None function if the Option is None. Supports both object-based
 * and positional parameter styles.
 *
 * @param self - The Option to map
 * @param handlers - Either an object with `Some` and `None` functions, or positional parameters
 * @returns The result of calling the appropriate handler function
 *
 * @example
 * ```ts ignore
 * // Object style
 * mapOrElse(Some(10), {
 *   Some: (x) => x * 2,
 *   None: () => 0
 * }); // 20
 *
 * // Positional style
 * mapOrElse(Some(10), () => 0, (x) => x * 2); // 20
 * mapOrElse(None(), () => 0, (x) => x * 2);   // 0
 * ```
 */
export function mapOrElse<T, U>(
	self: Option<T>,
	handlers: {
		None: () => U;
		Some: (value: T) => U;
	},
): U;
/**
 * Maps an Option to a value by applying one of two functions.
 *
 * @param self - The Option to map
 * @param handlers - Positional parameters: None function and Some function
 * @returns The result of calling the appropriate handler function
 */
export function mapOrElse<T, U>(
	self: Option<T>,
	...handlers: [None: () => U, Some: (value: T) => U]
): U;
export function mapOrElse<T, U>(
	self: Option<T>,
	...handlers:
		| [{ None: () => U; Some: (value: T) => U }]
		| [None: () => U, Some: (value: T) => U]
): U {
	const h = (() => {
		if (handlers.length === 1) return handlers[0];

		const [None, Some] = handlers;
		return { Some, None };
	})();

	return match(self)(h);
}
