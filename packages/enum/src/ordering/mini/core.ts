import { Enum, type Split } from "@/src/core/mini/core.ts";

/**
 * Constructs an Ordering indicating that the left value is less than the right.
 *
 * @returns An Ordering in the Less state
 *
 * @example
 * ```ts ignore
 * const ord = Less(); // Ordering
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
 * ```ts ignore
 * const ord = Equal(); // Ordering
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
 * ```ts ignore
 * const ord = Greater(); // Ordering
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
 * ```ts ignore
 * import { Less, Equal, Greater, type Ordering } from "@sekhmet/ordering/core/mini/core";
 * import { andThen } from "@sekhmet/ordering/core/mini/combinators";
 * import { compareNumbers } from "@sekhmet/ordering/core/mini/compare";
 *
 * // Compare by x, then by y if x is equal
 * const comparePoints = (a: Point, b: Point): Ordering =>
 *   andThen(compareNumbers(a.x, b.x), compareNumbers(a.y, b.y));
 * ```
 */
export class Ordering extends Enum<Variants> {}
