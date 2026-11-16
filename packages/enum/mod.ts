/**
 * Top-level re-export for the @sekhmet/enum package.
 *
 * Each feature is exposed as a namespace over its main entrypoint, because
 * the features share operation names (`map`, `unwrap`, `andThen`, …) that
 * cannot coexist in one flat scope. Import a feature path such as
 * `@sekhmet/enum/option` directly for flat names and better tree-shaking.
 *
 * @example
 * ```ts
 * import { option, result } from "@sekhmet/enum";
 *
 * const parsed = option.transpose(option.Some(result.Ok<number, string>(5)));
 * ```
 *
 * @module
 */

/** The `Enum` primitive and its variant operations (`@sekhmet/enum/core`). */
export * as core from "./src/core/main/mod.ts";
/** `Latch`: a value that is either `Active` or `Inactive` (`@sekhmet/enum/latch`). */
export * as latch from "./src/latch/main/mod.ts";
/** `Option`: an optional value, `Some` or `None` (`@sekhmet/enum/option`). */
export * as option from "./src/option/main/mod.ts";
/** `Ordering`: the result of a comparison (`@sekhmet/enum/ordering`). */
export * as ordering from "./src/ordering/main/mod.ts";
/** `Poll`: a value that is `Ready` or still `Pending` (`@sekhmet/enum/poll`). */
export * as poll from "./src/poll/main/mod.ts";
/** `Result`: a success `Ok` or a failure `Err` (`@sekhmet/enum/result`). */
export * as result from "./src/result/main/mod.ts";
