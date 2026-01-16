import { Equal, Greater, Less, type Ordering } from "./core.ts";

/**
 * Compares two numbers and returns their ordering.
 *
 * @param lhs - The left-hand side number
 * @param rhs - The right-hand side number
 * @returns Less if lhs < rhs, Greater if lhs > rhs, Equal if lhs === rhs
 *
 * @example
 * ```ts ignore
 * compareNumbers(1, 2); // Less
 * compareNumbers(2, 1); // Greater
 * compareNumbers(1, 1); // Equal
 * ```
 */
export function compareNumbers(lhs: number, rhs: number): Ordering {
	if (lhs < rhs) return Less();
	if (lhs > rhs) return Greater();

	return Equal();
}

/**
 * Compares two strings lexicographically and returns their ordering.
 *
 * Uses JavaScript's native string comparison semantics.
 *
 * @param lhs - The left-hand side string
 * @param rhs - The right-hand side string
 * @returns Less if lhs < rhs, Greater if lhs > rhs, Equal if lhs === rhs
 *
 * @example
 * ```ts ignore
 * compareStrings("apple", "banana"); // Less
 * compareStrings("zebra", "apple");  // Greater
 * compareStrings("hello", "hello");  // Equal
 * ```
 */
export function compareStrings(lhs: string, rhs: string): Ordering {
	if (lhs < rhs) return Less();
	if (lhs > rhs) return Greater();

	return Equal();
}

/**
 * Compares two values by extracting a comparable key from each.
 *
 * This is useful for comparing objects by a specific property
 * or computed value.
 *
 * @param lhs - The left-hand side value
 * @param rhs - The right-hand side value
 * @param key - Function to extract the comparable key from each value
 * @returns The ordering of the extracted keys
 *
 * @example
 * ```ts ignore
 * interface Person { name: string; age: number }
 * const alice: Person = { name: "Alice", age: 30 };
 * const bob: Person = { name: "Bob", age: 25 };
 *
 * compareBy(alice, bob, (p) => p.age); // Greater (30 > 25)
 * compareBy(alice, bob, (p) => p.name); // Less ("Alice" < "Bob")
 * ```
 */
export function compareBy<T>(
	lhs: T,
	rhs: T,
	key: (value: T) => number,
): Ordering {
	return compareNumbers(key(lhs), key(rhs));
}

/**
 * Compares two values by extracting a string key from each.
 *
 * @param lhs - The left-hand side value
 * @param rhs - The right-hand side value
 * @param key - Function to extract the string key from each value
 * @returns The ordering of the extracted keys
 *
 * @example
 * ```ts ignore
 * interface Person { name: string; age: number }
 * const alice: Person = { name: "Alice", age: 30 };
 * const bob: Person = { name: "Bob", age: 25 };
 *
 * compareByString(alice, bob, (p) => p.name); // Less ("Alice" < "Bob")
 * ```
 */
export function compareByString<T>(
	lhs: T,
	rhs: T,
	key: (value: T) => string,
): Ordering {
	return compareStrings(key(lhs), key(rhs));
}
