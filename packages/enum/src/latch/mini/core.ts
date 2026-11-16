import { Enum, type Split } from "@/src/core/mini/core.ts";

/**
 * Constructs a Latch in the Active state.
 *
 * @template A The type of the active value
 * @template I The type of the inactive value (defaults to never)
 * @param active The value for the active state
 * @returns A Latch in the Active state containing the provided value
 *
 * @example
 * ```ts
 * import { Active, type Latch } from "@sekhmet/enum/latch/mini";
 *
 * const latch: Latch<number, string> = Active<number, string>(42);
 * ```
 */
export function Active<A = unknown, I = never>(active: A): Latch<A, I> {
	return new Latch<A, I>("Active", active);
}

/**
 * Constructs a Latch in the Inactive state.
 *
 * @template A The type of the active value (defaults to never)
 * @template I The type of the inactive value
 * @param inactive The value for the inactive state
 * @returns A Latch in the Inactive state containing the provided value
 *
 * @example
 * ```ts
 * import { Inactive, type Latch } from "@sekhmet/enum/latch/mini";
 *
 * const latch: Latch<number, string> = Inactive<number, string>("paused");
 * ```
 */
export function Inactive<A = never, I = unknown>(inactive: I): Latch<A, I> {
	return new Latch<A, I>("Inactive", inactive);
}

/**
 * The variant types for a Latch.
 *
 * Represents the two possible states:
 * - `Active`: Contains an active value of type A
 * - `Inactive`: Contains an inactive value of type I
 */
type Variants<A, I> = Split<{
	Active: [activeValue: A];
	Inactive: [inactiveValue: I];
}>;
export type { Variants as LatchVariants };

/**
 * A 2-stage latch, AKA a 2-state state machine. Latches can switch between an
 * "Active" state and an "Inactive" state.
 *
 * ## Usage
 *
 * Use a `Latch` to model a 2-state system with two distinct generic values,
 * as opposed to an Option that has only takes one generic value, or a Result
 * that comes with extra semantics attached to the values and no dedicated way
 * to change between states.
 *
 * A common pattern is to have a `Latch` as a private property of another class
 * to control access to it and its state.
 *
 * ## Semantics
 *
 * 1. **Variant Semantics:**
 *     - **Active:** The "default" state, akin to the Ok variant in a Result
 *     - **Inactive:** The "alternative" state, akin to the Err variant in a Result
 *
 * @template A The type of the active value
 * @template I The type of the inactive value
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { match } from "@sekhmet/enum/core/mini";
 * import { Active, Inactive, type Latch } from "@sekhmet/enum/latch/mini";
 *
 * const describe = (connection: Latch<number, Error>): string =>
 *   match(connection)({
 *     Active: (port) => "connected on port " + port,
 *     Inactive: (error) => "connection failed: " + error.message,
 *   });
 *
 * assertEquals(describe(Active(8080)), "connected on port 8080");
 * assertEquals(describe(Inactive(new Error("refused"))), "connection failed: refused");
 * ```
 */
export class Latch<out A, out I> extends Enum<Variants<A, I>> {}
