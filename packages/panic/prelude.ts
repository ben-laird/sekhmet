/**
 * The everyday surface of `@sekhmet/panic`: throw a `Panic` with `panic`, and
 * run your program inside a runtime from `definePanicRuntime`.
 *
 * @module
 */

export {
	Panic,
	type PanicSource,
	type PanicSourceBase,
	panic,
	panicWithoutCause,
} from "./src/mini/core.ts";
export {
	definePanicRuntime,
	type PanicHook,
	type PanicHookInfo,
	type PanicRuntime,
} from "./src/mini/runtime.ts";
