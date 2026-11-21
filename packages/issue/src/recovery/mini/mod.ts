/**
 * Tree-shakable `Recovery`: a typed repair, `(value: T) => Vow<Result<R,
 * E>>`, that handles an issue by yielding its residue. Every operation is a
 * free function taking the recovery first; for method chaining, import
 * `@sekhmet/issue/recovery` instead.
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Ok } from "@sekhmet/enum/result/mini";
 * import { fail, map, orElse, run, succeed } from "@sekhmet/issue/recovery/mini";
 * import { wait } from "@sekhmet/vow/mini";
 *
 * const readBackup = fail<string, string>("`app.bak` can't be read.");
 * const useDefault = map(succeed<string, number>(8080), (port) => ({ port }));
 * const recovery = orElse(readBackup, useDefault);
 *
 * assertEquals(await wait(run(recovery, "app.json")), Ok({ port: 8080 }));
 * ```
 *
 * @module
 */

export * from "./combinators.ts";
export * from "./core.ts";
export * from "./promise.ts";
export * from "./transform.ts";
