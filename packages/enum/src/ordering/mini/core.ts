/**
 * The `Ordering` class and its `Less`, `Equal` and `Greater` constructors.
 *
 * @module
 */

import { Enum, type Split } from "@/src/core/mini/core.ts";

/**
 * Constructs an Ordering indicating that the left value is less than the right.
 *
 * @returns An Ordering in the Less state
 *
 * @example
 * ```ts
 * import { Less, type Ordering } from "@sekhmet/enum/ordering/mini";
 *
 * const ord: Ordering = Less();
 * ```
 */
export function Less(): Ordering {
	return new Ordering("Less");
}

/**
 * Constructs an Ordering indicating that the left value equals the right.
 *
 * @returns An Ordering in the Equal state
 *
 * @example
 * ```ts
 * import { Equal, type Ordering } from "@sekhmet/enum/ordering/mini";
 *
 * const ord: Ordering = Equal();
 * ```
 */
export function Equal(): Ordering {
	return new Ordering("Equal");
}

/**
 * Constructs an Ordering indicating that the left value is greater than the right.
 *
 * @returns An Ordering in the Greater state
 *
 * @example
 * ```ts
 * import { Greater, type Ordering } from "@sekhmet/enum/ordering/mini";
 *
 * const ord: Ordering = Greater();
 * ```
 */
export function Greater(): Ordering {
	return new Ordering("Greater");
}

/**
 * The variant types for an Ordering.
 *
 * Represents the three possible comparison results:
 * - `Less`: Left value is less than right value
 * - `Equal`: Left value equals right value
 * - `Greater`: Left value is greater than right value
 */
type Variants = Split<{ Less: []; Equal: []; Greater: [] }>;
export type { Variants as OrderingVariants };

/**
 * A type-safe ordering value representing the result of a comparison.
 *
 * Ordering is a Rust-inspired comparison type built on the Enum framework.
 * It represents the three possible outcomes of comparing two values:
 * less than, equal to, or greater than.
 *
 * Use Ordering for building composable comparison chains with `andThen`
 * and for interoperability with sort functions via `toNumber`.
 *
 * @example
 * ```ts
 * import { andThen, compareNumbers, type Ordering, toNumber } from "@sekhmet/enum/ordering/mini";
 * import { assertEquals } from "@std/assert";
 *
 * interface Point {
 *   x: number;
 *   y: number;
 * }
 *
 * // Compare by x, then by y if x is equal
 * const comparePoints = (a: Point, b: Point): Ordering =>
 *   andThen(compareNumbers(a.x, b.x), compareNumbers(a.y, b.y));
 *
 * assertEquals(toNumber(comparePoints({ x: 1, y: 2 }, { x: 1, y: 3 })), -1);
 * ```
 */
export class Ordering extends Enum<Variants> {}
