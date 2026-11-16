import { isolate } from "@/src/core/mini/isolate.ts";
import type { Ordering } from "./core.ts";

/**
 * Returns true if the ordering indicates "less than".
 *
 * @param self - The Ordering to check
 * @returns true if self is Less, false otherwise
 *
 * @example
 * ```ts ignore
 * isLt(Less());    // true
 * isLt(Equal());   // false
 * isLt(Greater()); // false
 * ```
 */
export function isLt(self: Ordering): boolean {
	return isolate(self, "Less");
}

/**
 * Returns true if the ordering indicates "greater than".
 *
 * @param self - The Ordering to check
 * @returns true if self is Greater, false otherwise
 *
 * @example
 * ```ts ignore
 * isGt(Less());    // false
 * isGt(Equal());   // false
 * isGt(Greater()); // true
 * ```
 */
export function isGt(self: Ordering): boolean {
	return isolate(self, "Greater");
}

/**
 * Returns true if the ordering indicates "equal".
 *
 * @param self - The Ordering to check
 * @returns true if self is Equal, false otherwise
 *
 * @example
 * ```ts ignore
 * isEq(Less());    // false
 * isEq(Equal());   // true
 * isEq(Greater()); // false
 * ```
 */
export function isEq(self: Ordering): boolean {
	return isolate(self, "Equal");
}

/**
 * Returns true if the ordering indicates "not equal" (either less or greater).
 *
 * @param self - The Ordering to check
 * @returns true if self is Less or Greater, false if Equal
 *
 * @example
 * ```ts ignore
 * isNe(Less());    // true
 * isNe(Equal());   // false
 * isNe(Greater()); // true
 * ```
 */
export function isNe(self: Ordering): boolean {
	return !isolate(self, "Equal");
}

/**
 * Returns true if the ordering indicates "less than or equal".
 *
 * @param self - The Ordering to check
 * @returns true if self is Less or Equal, false if Greater
 *
 * @example
 * ```ts ignore
 * isLe(Less());    // true
 * isLe(Equal());   // true
 * isLe(Greater()); // false
 * ```
 */
export function isLe(self: Ordering): boolean {
	return !isolate(self, "Greater");
}

/**
 * Returns true if the ordering indicates "greater than or equal".
 *
 * @param self - The Ordering to check
 * @returns true if self is Greater or Equal, false if Less
 *
 * @example
 * ```ts ignore
 * isGe(Less());    // false
 * isGe(Equal());   // true
 * isGe(Greater()); // true
 * ```
 */
export function isGe(self: Ordering): boolean {
	return !isolate(self, "Less");
}
