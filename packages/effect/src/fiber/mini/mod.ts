/**
 * Tree-shakable mini exports for the fiber module.
 *
 * @module
 */

export { cancel, Fiber, FiberState, fork } from "./fiber.ts";
export type { FiberParams, FiberStateVariants } from "./fiber.ts";

export {
	Cancelled,
	Failed,
	FiberError,
	Panicked,
} from "./fiber-error.ts";
export type { FiberErrorVariants, FiberResult } from "./fiber-error.ts";
