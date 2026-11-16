/**
 * Tree-shakable mini exports for the fiber module.
 *
 * @module
 */

export { joinEffect } from "../../concurrency/concurrency.ts";
export { fork } from "../../execution/mod.ts";
export type {
	FiberParams,
	FiberStateVariants,
	Finalizer,
	QueuedFiberState,
	RunningFiberState,
	SuspendedFiberState,
} from "./fiber.ts";
export { cancel, Fiber, FiberState, join } from "./fiber.ts";
export type { FiberErrorVariants, FiberResult } from "./fiber-error.ts";
export {
	Cancelled,
	Failed,
	FiberError,
	Panicked,
} from "./fiber-error.ts";
