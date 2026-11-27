/**
 * `@sekhmet/lifetime`: RAII for TypeScript, in any JavaScript runtime.
 *
 * - **A {@linkcode Resource} is the rising edge.** `init` acquires a value
 *   and `deinit` releases it; `start` returns a vow of a
 *   {@linkcode Lifetime}, settled at once when `init` is sync. A panic in
 *   `init` comes back as `Err`, after whatever `init` acquired on its
 *   `setup` lifetime is released.
 * - **A {@linkcode Lifetime} is the falling edge.** It exists only once its
 *   value does: `Alive(value) → Ending(cause) → Ended(report)`, read from
 *   its `ending` and `ended` signals. `end(cause)` is idempotent, and the
 *   first cause wins.
 * - **One teardown stack, in reverse acquisition order.** Cleanups
 *   (`defer`) and adopted children (`adopt`, `child`) share it, so the last
 *   acquired is the first released. A cleanup that throws or rejects is a
 *   `Panic` in the {@linkcode EndReport}; it never stops the others.
 * - **Trees you build yourself.** A new lifetime is a root until a parent
 *   adopts it; a child may have its own cause type, mapped from its
 *   parent's with `fromParent`.
 * - **`using` and `await using`** end a lifetime with its dispose cause,
 *   and only that boundary turns a failed report into a throw.
 *
 * @example
 * ```ts
 * import { definePanicRuntime } from "@sekhmet/panic";
 * import { Lifetime } from "@sekhmet/lifetime";
 * import { assertEquals } from "@std/assert";
 *
 * type Cause = "done" | "shutdown";
 *
 * const order: string[] = [];
 * {
 * 	await using app = new Lifetime<undefined, Cause>({
 * 		value: undefined,
 * 		panics: definePanicRuntime(),
 * 		disposeCause: "shutdown",
 * 	});
 * 	app.defer(() => void order.push("close logs"));
 * 	const db = app.child({ value: "db" });
 * 	db.defer(async (cause) => {
 * 		await Promise.resolve();
 * 		order.push(`close db: ${cause}`);
 * 	});
 * }
 * assertEquals(order, ["close db: shutdown", "close logs"]);
 * ```
 *
 * @module
 */

export { Adoption, type AdoptionVariants } from "./src/adoption.ts";
export { type Cleanup, Lifetime } from "./src/lifetime.ts";
export {
	type EndFailure,
	type EndReport,
	Phase,
	type PhaseVariants,
} from "./src/phase.ts";
export { Registration, type RegistrationVariants } from "./src/registration.ts";
export {
	isSetupTeardownPanic,
	Resource,
	SetupEnd,
	type SetupEndVariants,
	type SetupTeardownFailure,
} from "./src/resource.ts";
