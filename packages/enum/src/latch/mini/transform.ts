import { match, union } from "@/src/core/mini/exit.ts";
import { isolate } from "@/src/core/mini/isolate.ts";
import { None, type Option, Some } from "@/src/option/mini/core.ts";
import { Err, Ok, type Result } from "@/src/result/mini/core.ts";
import { Active, Inactive, type Latch } from "./core.ts";

/**
 * Extracts the active value as an Option.
 *
 * @template A The type of the active value
 * @template I The type of the inactive value
 * @param self The Latch to transform
 * @returns Some containing the active value if Active, None if Inactive
 *
 * @example
 * ```ts
 * import { Active, type Latch, active } from "@sekhmet/enum/latch/mini";
 *
 * const latch: Latch<number, string> = Active(42);
 * const opt = active(latch); // Some(42)
 * ```
 */
export function active<A, I>(self: Latch<A, I>): Option<A> {
	return match(self)({
		Active: Some,
		Inactive: None,
	});
}

/**
 * Extracts the inactive value as an Option.
 *
 * @template A The type of the active value
 * @template I The type of the inactive value
 * @param self The Latch to transform
 * @returns Some containing the inactive value if Inactive, None if Active
 *
 * @example
 * ```ts
 * import { Inactive, type Latch, inactive } from "@sekhmet/enum/latch/mini";
 *
 * const latch: Latch<number, string> = Inactive("paused");
 * const opt = inactive(latch); // Some("paused")
 * ```
 */
export function inactive<A, I>(self: Latch<A, I>): Option<I> {
	return match(self)({
		Active: None,
		Inactive: Some,
	});
}

/**
 * Converts a Latch to a Result, mapping Active to Ok and Inactive to Err.
 *
 * @template A The type of the active value
 * @template I The type of the inactive value
 * @param self The Latch to convert
 * @returns Ok with the active value, or Err with the inactive value
 *
 * @example
 * ```ts
 * import { Active, type Latch, toResult } from "@sekhmet/enum/latch/mini";
 *
 * const latch: Latch<number, string> = Active(42);
 * const result = toResult(latch); // Ok(42)
 * ```
 */
export function toResult<A, I>(self: Latch<A, I>): Result<A, I> {
	return match(self)({
		Active: (activeValue) => Ok(activeValue),
		Inactive: (inactiveValue) => Err(inactiveValue),
	});
}

/**
 * Transforms the active value using a mapping function.
 *
 * @template A The type of the active value
 * @template I The type of the inactive value
 * @template B The type of the transformed active value
 * @param self The Latch to transform
 * @param mapping Function to apply to the active value
 * @returns A new Latch with the mapped active value, or the original if Inactive
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Active, type Latch, map } from "@sekhmet/enum/latch/mini";
 *
 * const latch: Latch<number, string> = Active(42);
 * assertEquals(map(latch, (n) => n * 2), Active(84));
 * ```
 */
export function map<A, I, B>(
	self: Latch<A, I>,
	mapping: (activeValue: A) => B,
): Latch<B, I> {
	return match(self)({
		Active: (activeValue) => Active(mapping(activeValue)),
		Inactive,
	});
}

/**
 * Maps the active value or returns a default value if Inactive.
 *
 * @template A The type of the active value
 * @template I The type of the inactive value
 * @template B The type of the result
 * @param self The Latch to transform
 * @param defaultValue The value to return if Inactive
 * @param mapping Function to apply to the active value
 * @returns The mapped value if Active, otherwise the default value
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Active, Inactive, type Latch, mapOr } from "@sekhmet/enum/latch/mini";
 *
 * const latch: Latch<number, string> = Active(42);
 * assertEquals(mapOr(latch, 0, (n) => n * 2), 84);
 *
 * const paused: Latch<number, string> = Inactive("paused");
 * assertEquals(mapOr(paused, 0, (n) => n * 2), 0);
 * ```
 */
export function mapOr<A, I, B>(
	self: Latch<A, I>,
	defaultValue: B,
	mapping: (activeValue: A) => B,
): B {
	return match(self)({
		Active: mapping,
		Inactive: () => defaultValue,
	});
}

/**
 * Maps the value using one of two functions depending on the state.
 *
 * @template A The type of the active value
 * @template I The type of the inactive value
 * @template T The type of the result
 * @param self The Latch to transform
 * @param activeMapping Function to apply if Active
 * @param inactiveMapping Function to apply if Inactive
 * @returns The result of the appropriate mapping function
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Active, Inactive, type Latch, mapOrElse } from "@sekhmet/enum/latch/mini";
 *
 * const describe = (latch: Latch<number, string>): string =>
 *   mapOrElse(latch, (n) => "Value: " + n, (s) => "Paused: " + s);
 *
 * assertEquals(describe(Active(42)), "Value: 42");
 * assertEquals(describe(Inactive("user")), "Paused: user");
 * ```
 */
export function mapOrElse<A, I, T>(
	self: Latch<A, I>,
	activeMapping: (activeValue: A) => T,
	inactiveMapping: (inactiveValue: I) => T,
): T {
	return match(self)({
		Active: activeMapping,
		Inactive: inactiveMapping,
	});
}

/**
 * Transforms the inactive value using a mapping function.
 *
 * @template A The type of the active value
 * @template I The type of the inactive value
 * @template J The type of the transformed inactive value
 * @param self The Latch to transform
 * @param mapping Function to apply to the inactive value
 * @returns A new Latch with the mapped inactive value, or the original if Active
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Inactive, type Latch, mapInactive } from "@sekhmet/enum/latch/mini";
 *
 * const latch: Latch<number, string> = Inactive("error");
 * assertEquals(mapInactive(latch, (s) => s.toUpperCase()), Inactive("ERROR"));
 * ```
 */
export function mapInactive<A, I, J>(
	self: Latch<A, I>,
	mapping: (inactiveValue: I) => J,
): Latch<A, J> {
	return match(self)({
		Active,
		Inactive: (inactiveValue) => Inactive(mapping(inactiveValue)),
	});
}

/**
 * Executes an inspector function on the active value without consuming the Latch.
 *
 * @template A The type of the active value
 * @template I The type of the inactive value
 * @param self The Latch to inspect
 * @param inspector Function to execute with the active value
 * @returns The original Latch unchanged
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Active, type Latch, inspect } from "@sekhmet/enum/latch/mini";
 *
 * const seen: number[] = [];
 * const latch: Latch<number, string> = Active(42);
 *
 * assertEquals(inspect(latch, (n) => seen.push(n)), latch);
 * assertEquals(seen, [42]);
 * ```
 */
export function inspect<A, I>(
	self: Latch<A, I>,
	inspector: (activeValue: A) => void,
): Latch<A, I> {
	const variant = self;

	if (isolate(variant, "Active")) {
		inspector(union(variant));
	}

	return self;
}

/**
 * Executes an inspector function on the inactive value without consuming the Latch.
 *
 * @template A The type of the active value
 * @template I The type of the inactive value
 * @param self The Latch to inspect
 * @param inspector Function to execute with the inactive value
 * @returns The original Latch unchanged
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Inactive, type Latch, inspectInactive } from "@sekhmet/enum/latch/mini";
 *
 * const seen: string[] = [];
 * const latch: Latch<number, string> = Inactive("paused");
 *
 * assertEquals(inspectInactive(latch, (s) => seen.push(s)), latch);
 * assertEquals(seen, ["paused"]);
 * ```
 */
export function inspectInactive<A, I>(
	self: Latch<A, I>,
	inspector: (inactiveValue: I) => void,
): Latch<A, I> {
	const variant = self;

	if (isolate(variant, "Inactive")) {
		inspector(union(variant));
	}

	return self;
}

/**
 * Yields the active value if the Latch is Active.
 *
 * @template A The type of the active value
 * @template I The type of the inactive value
 * @param self The Latch to iterate
 * @yields The active value if Active
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Active, Inactive, type Latch, iter } from "@sekhmet/enum/latch/mini";
 *
 * const latch: Latch<number, string> = Active(42);
 * assertEquals(Array.from(iter(latch)), [42]);
 *
 * const paused: Latch<number, string> = Inactive("paused");
 * assertEquals(Array.from(iter(paused)), []);
 * ```
 */
export function* iter<A, I>(self: Latch<A, I>): Generator<A, void, undefined> {
	const variant = self;

	if (isolate(variant, "Active")) {
		yield union(variant);
	}
}

/**
 * Yields the inactive value if the Latch is Inactive.
 *
 * @template A The type of the active value
 * @template I The type of the inactive value
 * @param self The Latch to iterate
 * @yields The inactive value if Inactive
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Active, Inactive, type Latch, iterInactive } from "@sekhmet/enum/latch/mini";
 *
 * const latch: Latch<number, string> = Inactive("paused");
 * assertEquals(Array.from(iterInactive(latch)), ["paused"]);
 *
 * const running: Latch<number, string> = Active(42);
 * assertEquals(Array.from(iterInactive(running)), []);
 * ```
 */
export function* iterInactive<A, I>(
	self: Latch<A, I>,
): Generator<I, void, undefined> {
	const variant = self;

	if (isolate(variant, "Inactive")) {
		yield union(variant);
	}
}
