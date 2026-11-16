/**
 * Testing an ordering: `isLt`, `isGt`, `isEq`, `isNe`, `isLe` and `isGe`.
 *
 * @module
 */

import type { Enum, Isolate } from "@/src/core/mini/core.ts";
import { isolate } from "@/src/core/mini/isolate.ts";
import type { Ordering, OrderingVariants } from "./core.ts";

/**
 * Returns true if the ordering indicates "less than".
 *
 * Narrows to the Less variant, so a later `match` needs only the Less arm,
 * while the value stays an `Ordering`.
 *
 * @param self - The Ordering to check
 * @returns true if self is Less, false otherwise
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { match } from "@sekhmet/enum/core/mini";
 * import { Equal, Greater, Less, type Ordering, isLt } from "@sekhmet/enum/ordering/mini";
 *
 * assertEquals(isLt(Less()), true);
 * assertEquals(isLt(Equal()), false);
 * assertEquals(isLt(Greater()), false);
 *
 * const ordering: Ordering = Less();
 * if (isLt(ordering)) {
 *   // the variant: ordering is Less, so no Equal or Greater arm is needed
 *   assertEquals(match(ordering)({ Less: () => "less" }), "less");
 *   // still an Ordering
 *   const same: Ordering = ordering;
 *   assertEquals(same, Less());
 * }
 * ```
 */
export function isLt(
	self: Ordering,
): self is Enum<Isolate<OrderingVariants, "Less">> & Ordering {
	return isolate(self, "Less");
}

/**
 * Returns true if the ordering indicates "greater than".
 *
 * Narrows to the Greater variant, so a later `match` needs only the Greater
 * arm, while the value stays an `Ordering`.
 *
 * @param self - The Ordering to check
 * @returns true if self is Greater, false otherwise
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { match } from "@sekhmet/enum/core/mini";
 * import { Equal, Greater, Less, type Ordering, isGt } from "@sekhmet/enum/ordering/mini";
 *
 * assertEquals(isGt(Less()), false);
 * assertEquals(isGt(Equal()), false);
 * assertEquals(isGt(Greater()), true);
 *
 * const ordering: Ordering = Greater();
 * if (isGt(ordering)) {
 *   // the variant: ordering is Greater, so no Less or Equal arm is needed
 *   assertEquals(match(ordering)({ Greater: () => "greater" }), "greater");
 *   // still an Ordering
 *   const same: Ordering = ordering;
 *   assertEquals(same, Greater());
 * }
 * ```
 */
export function isGt(
	self: Ordering,
): self is Enum<Isolate<OrderingVariants, "Greater">> & Ordering {
	return isolate(self, "Greater");
}

/**
 * Returns true if the ordering indicates "equal".
 *
 * Narrows to the Equal variant, so a later `match` needs only the Equal arm,
 * while the value stays an `Ordering`.
 *
 * @param self - The Ordering to check
 * @returns true if self is Equal, false otherwise
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { match } from "@sekhmet/enum/core/mini";
 * import { Equal, Greater, Less, type Ordering, isEq } from "@sekhmet/enum/ordering/mini";
 *
 * assertEquals(isEq(Less()), false);
 * assertEquals(isEq(Equal()), true);
 * assertEquals(isEq(Greater()), false);
 *
 * const ordering: Ordering = Equal();
 * if (isEq(ordering)) {
 *   // the variant: ordering is Equal, so no Less or Greater arm is needed
 *   assertEquals(match(ordering)({ Equal: () => "equal" }), "equal");
 *   // still an Ordering
 *   const same: Ordering = ordering;
 *   assertEquals(same, Equal());
 * }
 * ```
 */
export function isEq(
	self: Ordering,
): self is Enum<Isolate<OrderingVariants, "Equal">> & Ordering {
	return isolate(self, "Equal");
}

/**
 * Returns true if the ordering indicates "not equal" (either less or greater).
 *
 * Narrows to the Less and Greater variants, so a later `match` needs only
 * those two arms, while the value stays an `Ordering`.
 *
 * @param self - The Ordering to check
 * @returns true if self is Less or Greater, false if Equal
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { match } from "@sekhmet/enum/core/mini";
 * import { Equal, Greater, Less, type Ordering, isNe } from "@sekhmet/enum/ordering/mini";
 *
 * assertEquals(isNe(Less()), true);
 * assertEquals(isNe(Equal()), false);
 * assertEquals(isNe(Greater()), true);
 *
 * const ordering: Ordering = Greater();
 * if (isNe(ordering)) {
 *   // the variants: ordering is Less or Greater, so no Equal arm is needed
 *   const sign = match(ordering)({ Less: () => -1, Greater: () => 1 });
 *   assertEquals(sign, 1);
 *   // still an Ordering
 *   const same: Ordering = ordering;
 *   assertEquals(same, Greater());
 * }
 * ```
 */
export function isNe(
	self: Ordering,
): self is Enum<Isolate<OrderingVariants, "Less" | "Greater">> & Ordering {
	return !isolate(self, "Equal");
}

/**
 * Returns true if the ordering indicates "less than or equal".
 *
 * Narrows to the Less and Equal variants, so a later `match` needs only those
 * two arms, while the value stays an `Ordering`.
 *
 * @param self - The Ordering to check
 * @returns true if self is Less or Equal, false if Greater
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { match } from "@sekhmet/enum/core/mini";
 * import { Equal, Greater, Less, type Ordering, isLe } from "@sekhmet/enum/ordering/mini";
 *
 * assertEquals(isLe(Less()), true);
 * assertEquals(isLe(Equal()), true);
 * assertEquals(isLe(Greater()), false);
 *
 * const ordering: Ordering = Less();
 * if (isLe(ordering)) {
 *   // the variants: ordering is Less or Equal, so no Greater arm is needed
 *   const strict = match(ordering)({ Less: () => true, Equal: () => false });
 *   assertEquals(strict, true);
 *   // still an Ordering
 *   const same: Ordering = ordering;
 *   assertEquals(same, Less());
 * }
 * ```
 */
export function isLe(
	self: Ordering,
): self is Enum<Isolate<OrderingVariants, "Less" | "Equal">> & Ordering {
	return !isolate(self, "Greater");
}

/**
 * Returns true if the ordering indicates "greater than or equal".
 *
 * Narrows to the Greater and Equal variants, so a later `match` needs only
 * those two arms, while the value stays an `Ordering`.
 *
 * @param self - The Ordering to check
 * @returns true if self is Greater or Equal, false if Less
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { match } from "@sekhmet/enum/core/mini";
 * import { Equal, Greater, Less, type Ordering, isGe } from "@sekhmet/enum/ordering/mini";
 *
 * assertEquals(isGe(Less()), false);
 * assertEquals(isGe(Equal()), true);
 * assertEquals(isGe(Greater()), true);
 *
 * const ordering: Ordering = Equal();
 * if (isGe(ordering)) {
 *   // the variants: ordering is Greater or Equal, so no Less arm is needed
 *   const strict = match(ordering)({ Greater: () => true, Equal: () => false });
 *   assertEquals(strict, false);
 *   // still an Ordering
 *   const same: Ordering = ordering;
 *   assertEquals(same, Equal());
 * }
 * ```
 */
export function isGe(
	self: Ordering,
): self is Enum<Isolate<OrderingVariants, "Greater" | "Equal">> & Ordering {
	return !isolate(self, "Less");
}
