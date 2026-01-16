import { match } from "@/src/core/mini/exit.ts";
import { Active, Inactive, type Latch } from "./core.ts";

/**
 * Returns the other Latch if this one is Active, otherwise returns this Latch's Inactive.
 *
 * @template A The type of the active value
 * @template I The type of the inactive value
 * @template B The type of the other Latch's active value
 * @param self The Latch to check
 * @param otherLatch The Latch to return if Active
 * @returns The other Latch if Active, otherwise this Latch's Inactive state
 *
 * @example
 * ```ts ignore
 * const a: Latch<number, string> = Active(1);
 * const b: Latch<number, string> = Active(2);
 * const result = and(a, b); // Active(2)
 *
 * const c: Latch<number, string> = Inactive("error");
 * const result2 = and(c, b); // Inactive("error")
 * ```
 */
export function and<A, I, B>(
	self: Latch<A, I>,
	otherLatch: Latch<B, I>,
): Latch<B, I> {
	return match(self)({
		Active: () => otherLatch,
		Inactive,
	});
}

/**
 * Chains a Latch operation, only executing if this one is Active.
 *
 * @template A The type of the active value
 * @template I The type of the inactive value
 * @template B The type of the resulting Latch's active value
 * @param self The Latch to check
 * @param otherLatch Function to compute the next Latch from the active value
 * @returns The computed Latch if Active, otherwise this Latch's Inactive state
 *
 * @example
 * ```ts ignore
 * const latch: Latch<number, string> = Active(42);
 * const result = andThen(latch, (n) => n > 0 ? Active(n * 2) : Inactive("negative"));
 * // Active(84)
 * ```
 */
export function andThen<A, I, B>(
	self: Latch<A, I>,
	otherLatch: (activeValue: A) => Latch<B, I>,
): Latch<B, I> {
	return match(self)({
		Active: otherLatch,
		Inactive,
	});
}

/**
 * Returns this Latch if Active, otherwise returns the fallback.
 *
 * @template A The type of the active value
 * @template I The type of the inactive value
 * @template J The type of the fallback's inactive value
 * @param self The Latch to check
 * @param fallbackLatch The Latch to return if Inactive
 * @returns This Latch if Active, otherwise the fallback
 *
 * @example
 * ```ts ignore
 * const a: Latch<number, string> = Inactive("error");
 * const b: Latch<number, string> = Active(42);
 * const result = or(a, b); // Active(42)
 *
 * const c: Latch<number, string> = Active(1);
 * const result2 = or(c, b); // Active(1)
 * ```
 */
export function or<A, I, J>(
	self: Latch<A, I>,
	fallbackLatch: Latch<A, J>,
): Latch<A, J> {
	return match(self)({
		Active,
		Inactive: () => fallbackLatch,
	});
}

/**
 * Returns this Latch if Active, otherwise computes and returns a fallback.
 *
 * @template A The type of the active value
 * @template I The type of the inactive value
 * @template J The type of the fallback's inactive value
 * @param self The Latch to check
 * @param fallbackLatch Function to compute the fallback from the inactive value
 * @returns This Latch if Active, otherwise the computed fallback
 *
 * @example
 * ```ts ignore
 * const latch: Latch<number, string> = Inactive("error");
 * const result = orElse(latch, (s) => Active(s.length));
 * // Active(5)
 * ```
 */
export function orElse<A, I, J>(
	self: Latch<A, I>,
	fallbackLatch: (inactiveValue: I) => Latch<A, J>,
): Latch<A, J> {
	return match(self)({
		Active,
		Inactive: fallbackLatch,
	});
}

/**
 * Returns the active value or a default if Inactive.
 *
 * @template A The type of the active value
 * @template I The type of the inactive value
 * @param self The Latch to unwrap
 * @param defaultValue The value to return if Inactive
 * @returns The active value or the default
 *
 * @example
 * ```ts ignore
 * const active: Latch<number, string> = Active(42);
 * unwrapOr(active, 0); // 42
 *
 * const inactive: Latch<number, string> = Inactive("error");
 * unwrapOr(inactive, 0); // 0
 * ```
 */
export function unwrapOr<A, I>(self: Latch<A, I>, defaultValue: A): A {
	return match(self)({
		Active: (value) => value,
		Inactive: () => defaultValue,
	});
}

/**
 * Returns the active value or computes a default from the inactive value.
 *
 * @template A The type of the active value
 * @template I The type of the inactive value
 * @param self The Latch to unwrap
 * @param defaultValue Function to compute the default from the inactive value
 * @returns The active value or the computed default
 *
 * @example
 * ```ts ignore
 * const inactive: Latch<number, string> = Inactive("42");
 * unwrapOrElse(inactive, (s) => parseInt(s, 10)); // 42
 * ```
 */
export function unwrapOrElse<A, I>(
	self: Latch<A, I>,
	defaultValue: (inactiveValue: I) => A,
): A {
	return match(self)({
		Active: (value) => value,
		Inactive: defaultValue,
	});
}
