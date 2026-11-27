/**
 * `Vow`: a synchronous, promise-like value built on `Enum`. A vow is
 * `Pending` until resolved, then `Resolved` with its value; dependents run
 * as soon as it resolves, in the same call stack. `wait` bridges a vow to a
 * promise; `@sekhmet/panic`'s `catchUnwind` turns a promise into a vow.
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { map, vowWithResolver } from "@sekhmet/vow";
 *
 * const { vow, resolve } = vowWithResolver<number>();
 * const seen: number[] = [];
 * map(vow, (n) => seen.push(n * 2));
 *
 * resolve(21);
 * assertEquals(seen, [42]); // ran synchronously inside resolve
 * ```
 *
 * @module
 */

export * from "./src/mini/mod.ts";
