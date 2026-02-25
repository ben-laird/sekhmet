/**
 * Tree-shakable mini exports for the fiber module.
 *
 * @module
 */

export { Fiber, FiberState, cancel, fork, join, joinEffect } from "./fiber.ts";
export type {
	FiberParams,
	FiberStateVariants,
	Finalizer,
	QueuedFiberState,
	RunningFiberState,
	SuspendedFiberState,
} from "./fiber.ts";

export {
	Cancelled,
	Failed,
	FiberError,
	Panicked,
} from "./fiber-error.ts";
export type { FiberErrorVariants, FiberResult } from "./fiber-error.ts";
