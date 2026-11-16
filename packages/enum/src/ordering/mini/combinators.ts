import { match } from "@/src/core/mini/exit.ts";
import { Equal, Greater, Less, type Ordering } from "./core.ts";

/**
 * Reverses the ordering direction.
 *
 * - Less becomes Greater
 * - Greater becomes Less
 * - Equal remains Equal
 *
 * @param self - The Ordering to reverse
 * @returns The reversed Ordering
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Equal, Greater, Less, reverse } from "@sekhmet/enum/ordering/mini";
 *
 * assertEquals(reverse(Less()), Greater());
 * assertEquals(reverse(Equal()), Equal());
 * assertEquals(reverse(Greater()), Less());
 * ```
 */
export function reverse(self: Ordering): Ordering {
	return match(self)({
		Less: Greater,
		Equal,
		Greater: Less,
	});
}

/**
 * Chains two orderings together. If the first ordering is Equal,
 * returns the second ordering; otherwise returns the first.
 *
 * This is useful for multi-key comparisons where you want to
 * compare by a primary key first, then by secondary keys if equal.
 *
 * @param self - The primary ordering
 * @param other - The secondary ordering to use if self is Equal
 * @returns self if it's not Equal, otherwise other
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Greater, type Ordering, andThen, compareStrings } from "@sekhmet/enum/ordering/mini";
 *
 * interface Person {
 *   firstName: string;
 *   lastName: string;
 * }
 *
 * // Compare by last name, then first name
 * const comparePeople = (a: Person, b: Person): Ordering =>
 *   andThen(
 *     compareStrings(a.lastName, b.lastName),
 *     compareStrings(a.firstName, b.firstName),
 *   );
 *
 * const ada = { firstName: "Ada", lastName: "Lovelace" };
 * const byron = { firstName: "Byron", lastName: "Lovelace" };
 * assertEquals(comparePeople(byron, ada), Greater());
 * ```
 */
export function andThen(self: Ordering, other: Ordering): Ordering {
	return match(self)({
		Less: () => self,
		Equal: () => other,
		Greater: () => self,
	});
}

/**
 * Chains two orderings together, lazily evaluating the second.
 *
 * Like `andThen`, but the second ordering is computed only if needed.
 * This avoids unnecessary computation when the first ordering is decisive.
 *
 * @param self - The primary ordering
 * @param other - Function returning the secondary ordering, called only if self is Equal
 * @returns self if it's not Equal, otherwise the result of calling other
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Less, andThenWith, compareNumbers, compareStrings } from "@sekhmet/enum/ordering/mini";
 *
 * let calls = 0;
 * const byAge = () => {
 *   calls++;
 *   return compareNumbers(30, 25);
 * };
 *
 * // Only compute the secondary comparison if the primary keys are equal
 * assertEquals(andThenWith(compareStrings("Alice", "Bob"), byAge), Less());
 * assertEquals(calls, 0);
 * ```
 */
export function andThenWith(self: Ordering, other: () => Ordering): Ordering {
	return match(self)({
		Less: () => self,
		Equal: other,
		Greater: () => self,
	});
}

/**
 * Converts an Ordering to its numeric representation.
 *
 * - Less returns -1
 * - Equal returns 0
 * - Greater returns 1
 *
 * This is useful for interoperability with JavaScript's Array.sort()
 * and other comparison functions that expect numeric returns.
 *
 * @param self - The Ordering to convert
 * @returns -1 for Less, 0 for Equal, 1 for Greater
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { compareStrings, toNumber } from "@sekhmet/enum/ordering/mini";
 *
 * const items = [{ name: "b" }, { name: "a" }, { name: "c" }];
 * items.sort((a, b) => toNumber(compareStrings(a.name, b.name)));
 * assertEquals(items, [{ name: "a" }, { name: "b" }, { name: "c" }]);
 * ```
 */
export function toNumber(self: Ordering): -1 | 0 | 1 {
	return match(self)({
		Less: () => -1 as const,
		Equal: () => 0 as const,
		Greater: () => 1 as const,
	});
}
