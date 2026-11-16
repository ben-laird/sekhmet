import { isolate } from "@/src/core/mini/isolate.ts";
import type { Ordering } from "./core.ts";

/**
 * Returns true if the ordering indicates "less than".
 *
 * @param self - The Ordering to check
 * @returns true if self is Less, false otherwise
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Equal, Greater, Less, isLt } from "@sekhmet/enum/ordering/mini";
 *
 * assertEquals(isLt(Less()), true);
 * assertEquals(isLt(Equal()), false);
 * assertEquals(isLt(Greater()), false);
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
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Equal, Greater, Less, isGt } from "@sekhmet/enum/ordering/mini";
 *
 * assertEquals(isGt(Less()), false);
 * assertEquals(isGt(Equal()), false);
 * assertEquals(isGt(Greater()), true);
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
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Equal, Greater, Less, isEq } from "@sekhmet/enum/ordering/mini";
 *
 * assertEquals(isEq(Less()), false);
 * assertEquals(isEq(Equal()), true);
 * assertEquals(isEq(Greater()), false);
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
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Equal, Greater, Less, isNe } from "@sekhmet/enum/ordering/mini";
 *
 * assertEquals(isNe(Less()), true);
 * assertEquals(isNe(Equal()), false);
 * assertEquals(isNe(Greater()), true);
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
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Equal, Greater, Less, isLe } from "@sekhmet/enum/ordering/mini";
 *
 * assertEquals(isLe(Less()), true);
 * assertEquals(isLe(Equal()), true);
 * assertEquals(isLe(Greater()), false);
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
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Equal, Greater, Less, isGe } from "@sekhmet/enum/ordering/mini";
 *
 * assertEquals(isGe(Less()), false);
 * assertEquals(isGe(Equal()), true);
 * assertEquals(isGe(Greater()), true);
 * ```
 */
export function isGe(self: Ordering): boolean {
	return !isolate(self, "Less");
}
