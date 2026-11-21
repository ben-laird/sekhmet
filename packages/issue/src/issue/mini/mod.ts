/**
 * Tree-shakable `Issue`: one occurrence of something going wrong, with a
 * code, a message, an optional hint and docs link, and a state that switches
 * in place from `Unhandled(value)` to `Handled(residue)`, once. Every
 * operation is a free function taking the issue first; for method chaining,
 * import `@sekhmet/issue/issue` instead.
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Handled } from "@sekhmet/issue/attempt/mini";
 * import { attempt, issue, unwrapResidue } from "@sekhmet/issue/issue/mini";
 * import { fail, orElse, succeed } from "@sekhmet/issue/recovery/mini";
 * import { wait } from "@sekhmet/vow/mini";
 *
 * interface Config {
 * 	readonly port: number;
 * }
 *
 * const notFound = issue<{ readonly path: string }, Config>({
 * 	value: { path: "app.json" },
 * 	code: "config/NotFound",
 * 	message: "No config file at `app.json`.",
 * 	hint: "Create one, or run with the default config.",
 * });
 * const readBackup = fail<{ readonly path: string }, string>("`app.bak` can't be read.");
 * const useDefault = succeed<{ readonly path: string }, Config>({ port: 8080 });
 *
 * assertEquals(await wait(attempt(notFound, orElse(readBackup, useDefault))), Handled({ port: 8080 }));
 * assertEquals(unwrapResidue(notFound), { port: 8080 });
 * ```
 *
 * @module
 */

export * from "./accessors.ts";
export * from "./core.ts";
export * from "./handling.ts";
export * from "./predicates.ts";
export * from "./render.ts";
export * from "./transform.ts";
export * from "./unwrap.ts";
