/**
 * Tree-shakable `Ordering`: the outcome of a comparison, `Less`, `Equal` or
 * `Greater`, with comparators, chaining and conversion to the numbers
 * `Array.prototype.sort` expects. For method chaining, import
 * `@sekhmet/enum/ordering` instead.
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { andThen, compareNumbers, compareStrings, toNumber } from "@sekhmet/enum/ordering/mini";
 *
 * const people = [
 *   { name: "Bea", age: 30 },
 *   { name: "Al", age: 30 },
 *   { name: "Cy", age: 25 },
 * ];
 *
 * people.sort((a, b) =>
 *   toNumber(andThen(compareNumbers(a.age, b.age), compareStrings(a.name, b.name)))
 * );
 *
 * assertEquals(people.map((p) => p.name), ["Cy", "Al", "Bea"]);
 * ```
 *
 * @module
 */

export * from "./combinators.ts";
export * from "./compare.ts";
export * from "./core.ts";
export * from "./predicates.ts";
