/**
 * Switching a latch in place: the `activate*` and `deactivate*` functions.
 *
 * @module
 */

import { getStructParams } from "@sekhmet/primordials/struct";
import { match } from "@/src/core/mini/exit.ts";
import type { Option } from "@/src/option/mini/core.ts";
import { Latch } from "./core.ts";

/**
 * Transitions an Active Latch to Inactive state.
 * If already Inactive, returns the Latch unchanged.
 *
 * @template A The type of the active value
 * @template I The type of the inactive value
 * @param self The Latch to deactivate
 * @param deactivatingValue The value for the Inactive state
 * @returns The same Latch instance, now potentially in Inactive state
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Active, Inactive, type Latch, deactivate } from "@sekhmet/enum/latch/mini";
 *
 * const latch: Latch<number, string> = Active(42);
 * deactivate(latch, "paused");
 * assertEquals(latch, Inactive("paused"));
 * ```
 */
export function deactivate<A, I>(
	self: Latch<A, I>,
	deactivatingValue: I,
): Latch<A, I> {
	const selfState = getStructParams(self);

	return match(self)({
		Active() {
			selfState.variant = ["Inactive", deactivatingValue];

			return self;
		},
		Inactive: () => self,
	});
}

/**
 * Transitions an Active Latch to Inactive state using a function.
 * The function receives the current active value to compute the inactive value.
 *
 * @template A The type of the active value
 * @template I The type of the inactive value
 * @param self The Latch to deactivate
 * @param deactivatingFn Function to compute the inactive value from the active value
 * @returns The same Latch instance, now potentially in Inactive state
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Active, Inactive, type Latch, deactivateWith } from "@sekhmet/enum/latch/mini";
 *
 * const latch: Latch<number, string> = Active(42);
 * deactivateWith(latch, (n) => "was: " + n);
 * assertEquals(latch, Inactive("was: 42"));
 * ```
 */
export function deactivateWith<A, I>(
	self: Latch<A, I>,
	deactivatingFn: (activeValue: A) => I,
): Latch<A, I> {
	const selfState = getStructParams(self);

	return match(self)({
		Active(activeValue) {
			selfState.variant = ["Inactive", deactivatingFn(activeValue)];

			return self;
		},
		Inactive: () => self,
	});
}

/**
 * Conditionally deactivates a Latch based on an Option.
 * If the Option is Some, deactivates with its value; otherwise leaves unchanged.
 *
 * @template A The type of the active value
 * @template I The type of the inactive value
 * @param self The Latch to potentially deactivate
 * @param option An Option containing the potential deactivating value
 * @returns The same Latch instance, potentially deactivated
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Active, Inactive, type Latch, deactivateIf } from "@sekhmet/enum/latch/mini";
 * import { None, Some } from "@sekhmet/enum/option/mini";
 *
 * const latch: Latch<number, string> = Active(42);
 * deactivateIf(latch, None()); // no change
 * assertEquals(latch, Active(42));
 *
 * deactivateIf(latch, Some("paused")); // deactivates
 * assertEquals(latch, Inactive("paused"));
 * ```
 */
export function deactivateIf<A, I>(
	self: Latch<A, I>,
	option: Option<I>,
): Latch<A, I> {
	return match(option)({
		Some: (deactivatingValue) => deactivate(self, deactivatingValue),
		None: () => self,
	});
}

/**
 * Conditionally deactivates a Latch based on a function that returns an Option.
 * Only runs the function if the Latch is Active.
 *
 * @template A The type of the active value
 * @template I The type of the inactive value
 * @param self The Latch to potentially deactivate
 * @param option Function that takes the active value and returns an Option
 * @returns The same Latch instance, potentially deactivated
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Active, Inactive, type Latch, deactivateWhen } from "@sekhmet/enum/latch/mini";
 * import { None, Some } from "@sekhmet/enum/option/mini";
 *
 * const latch: Latch<number, string> = Active(42);
 * deactivateWhen(latch, (n) => (n > 40 ? Some("too high") : None()));
 * assertEquals(latch, Inactive("too high"));
 * ```
 */
export function deactivateWhen<A, I>(
	self: Latch<A, I>,
	option: (activeValue: A) => Option<I>,
): Latch<A, I> {
	return match(self)({
		Active: (activeValue) => deactivateIf(self, option(activeValue)),
		Inactive: () => self,
	});
}

/**
 * Deactivates a Latch and returns a clone of its previous state.
 * Always transitions to Inactive, returning what the Latch was before.
 *
 * @template A The type of the active value
 * @template I The type of the inactive value
 * @param self The Latch to deactivate
 * @param deactivatingValue The value for the Inactive state
 * @returns A new Latch containing the previous state
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Active, Inactive, type Latch, deactivateReplace } from "@sekhmet/enum/latch/mini";
 *
 * const latch: Latch<number, string> = Active(42);
 * const previous = deactivateReplace(latch, "paused");
 * assertEquals(latch, Inactive("paused"));
 * assertEquals(previous, Active(42));
 * ```
 */
export function deactivateReplace<A, I>(
	self: Latch<A, I>,
	deactivatingValue: I,
): Latch<A, I> {
	const selfState = getStructParams(self);

	const clonedLatch = new Latch(...selfState.variant);

	selfState.variant = ["Inactive", deactivatingValue];

	return clonedLatch;
}

/**
 * Transitions an Inactive Latch to Active state.
 * If already Active, returns the Latch unchanged.
 *
 * @template A The type of the active value
 * @template I The type of the inactive value
 * @param self The Latch to activate
 * @param activatingValue The value for the Active state
 * @returns The same Latch instance, now potentially in Active state
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Active, Inactive, type Latch, activate } from "@sekhmet/enum/latch/mini";
 *
 * const latch: Latch<number, string> = Inactive("paused");
 * activate(latch, 42);
 * assertEquals(latch, Active(42));
 * ```
 */
export function activate<A, I>(
	self: Latch<A, I>,
	activatingValue: A,
): Latch<A, I> {
	const selfState = getStructParams(self);

	return match(self)({
		Active: () => self,
		Inactive() {
			selfState.variant = ["Active", activatingValue];

			return self;
		},
	});
}

/**
 * Transitions an Inactive Latch to Active state using a function.
 * The function receives the current inactive value to compute the active value.
 *
 * @template A The type of the active value
 * @template I The type of the inactive value
 * @param self The Latch to activate
 * @param activatingFn Function to compute the active value from the inactive value
 * @returns The same Latch instance, now potentially in Active state
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Active, Inactive, type Latch, activateWith } from "@sekhmet/enum/latch/mini";
 *
 * const latch: Latch<number, string> = Inactive("42");
 * activateWith(latch, (s) => parseInt(s, 10));
 * assertEquals(latch, Active(42));
 * ```
 */
export function activateWith<A, I>(
	self: Latch<A, I>,
	activatingFn: (inactiveValue: I) => A,
): Latch<A, I> {
	const selfState = getStructParams(self);

	return match(self)({
		Active: () => self,
		Inactive(inactiveValue) {
			selfState.variant = ["Active", activatingFn(inactiveValue)];

			return self;
		},
	});
}

/**
 * Conditionally activates a Latch based on an Option.
 * If the Option is Some, activates with its value; otherwise leaves unchanged.
 *
 * @template A The type of the active value
 * @template I The type of the inactive value
 * @param self The Latch to potentially activate
 * @param option An Option containing the potential activating value
 * @returns The same Latch instance, potentially activated
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Active, Inactive, type Latch, activateIf } from "@sekhmet/enum/latch/mini";
 * import { None, Some } from "@sekhmet/enum/option/mini";
 *
 * const latch: Latch<number, string> = Inactive("paused");
 * activateIf(latch, None()); // no change
 * assertEquals(latch, Inactive("paused"));
 *
 * activateIf(latch, Some(42)); // activates
 * assertEquals(latch, Active(42));
 * ```
 */
export function activateIf<A, I>(
	self: Latch<A, I>,
	option: Option<A>,
): Latch<A, I> {
	return match(option)({
		Some: (activatingValue) => activate(self, activatingValue),
		None: () => self,
	});
}

/**
 * Conditionally activates a Latch based on a function that returns an Option.
 * Only runs the function if the Latch is Inactive.
 *
 * @template A The type of the active value
 * @template I The type of the inactive value
 * @param self The Latch to potentially activate
 * @param option Function that takes the inactive value and returns an Option
 * @returns The same Latch instance, potentially activated
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Active, Inactive, type Latch, activateWhen } from "@sekhmet/enum/latch/mini";
 * import { None, Some } from "@sekhmet/enum/option/mini";
 *
 * const latch: Latch<number, string> = Inactive("42");
 * activateWhen(latch, (s) => (/^\d+$/.test(s) ? Some(parseInt(s, 10)) : None()));
 * assertEquals(latch, Active(42));
 * ```
 */
export function activateWhen<A, I>(
	self: Latch<A, I>,
	option: (inactiveValue: I) => Option<A>,
): Latch<A, I> {
	return match(self)({
		Active: () => self,
		Inactive: (inactiveValue) => activateIf(self, option(inactiveValue)),
	});
}

/**
 * Activates a Latch and returns a clone of its previous state.
 * Always transitions to Active, returning what the Latch was before.
 *
 * @template A The type of the active value
 * @template I The type of the inactive value
 * @param self The Latch to activate
 * @param activatingValue The value for the Active state
 * @returns A new Latch containing the previous state
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Active, Inactive, type Latch, activateReplace } from "@sekhmet/enum/latch/mini";
 *
 * const latch: Latch<number, string> = Inactive("paused");
 * const previous = activateReplace(latch, 42);
 * assertEquals(latch, Active(42));
 * assertEquals(previous, Inactive("paused"));
 * ```
 */
export function activateReplace<A, I>(
	self: Latch<A, I>,
	activatingValue: A,
): Latch<A, I> {
	const selfState = getStructParams(self);

	const clonedLatch = new Latch(...selfState.variant);

	selfState.variant = ["Active", activatingValue];

	return clonedLatch;
}
