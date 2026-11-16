/**
 * The panic primitives: the `Panic` type, and `panic` and
 * `panicWithoutCause`, which throw it. The panic runtime lives in
 * `@sekhmet/panic` and `@sekhmet/panic/mini/runtime`.
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
