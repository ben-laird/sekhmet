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
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { None, Some, map } from "@sekhmet/enum/option/mini";
 *
 * assertEquals(map(Some(10), (x) => x * 2), Some(20));
 * assertEquals(map(None<number>(), (x) => x * 2), None());
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
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { None, Some, inspect } from "@sekhmet/enum/option/mini";
 *
 * const seen: number[] = [];
 *
 * assertEquals(inspect(Some(42), (x) => seen.push(x)), Some(42));
 * assertEquals(inspect(None<number>(), (x) => seen.push(x)), None());
 * assertEquals(seen, [42]);
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
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { None, Some, inspectNone } from "@sekhmet/enum/option/mini";
 *
 * let calls = 0;
 *
 * assertEquals(inspectNone(None(), () => calls++), None());
 * assertEquals(inspectNone(Some(42), () => calls++), Some(42));
 * assertEquals(calls, 1);
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
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { None, Some, mapOr } from "@sekhmet/enum/option/mini";
 *
 * // Object style
 * assertEquals(mapOr(Some(10), { defaultValue: 0, mapping: (x) => x * 2 }), 20);
 * assertEquals(mapOr(None<number>(), { defaultValue: 0, mapping: (x) => x * 2 }), 0);
 *
 * // Positional style
 * assertEquals(mapOr(Some(10), 0, (x) => x * 2), 20);
 * assertEquals(mapOr(None<number>(), 0, (x) => x * 2), 0);
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
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { None, Some, mapOrElse } from "@sekhmet/enum/option/mini";
 *
 * // Object style
 * assertEquals(mapOrElse(Some(10), { Some: (x) => x * 2, None: () => 0 }), 20);
 *
 * // Positional style
 * assertEquals(mapOrElse(Some(10), () => 0, (x) => x * 2), 20);
 * assertEquals(mapOrElse(None<number>(), () => 0, (x) => x * 2), 0);
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
