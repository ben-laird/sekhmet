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
 * ```ts ignore
 * const latch: Latch<number, string> = Active(42);
 * deactivate(latch, "paused");
 * // latch is now Inactive("paused")
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
 * ```ts ignore
 * const latch: Latch<number, string> = Active(42);
 * deactivateWith(latch, (n) => `was: ${n}`);
 * // latch is now Inactive("was: 42")
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
 * ```ts ignore
 * const latch: Latch<number, string> = Active(42);
 * deactivateIf(latch, Some("paused")); // deactivates
 * deactivateIf(latch, None()); // no change
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
 * ```ts ignore
 * const latch: Latch<number, string> = Active(42);
 * deactivateWhen(latch, (n) => n > 40 ? Some("too high") : None());
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
 * ```ts ignore
 * const latch: Latch<number, string> = Active(42);
 * const previous = deactivateReplace(latch, "paused");
 * // latch is now Inactive("paused")
 * // previous is Active(42)
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
 * ```ts ignore
 * const latch: Latch<number, string> = Inactive("paused");
 * activate(latch, 42);
 * // latch is now Active(42)
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
 * ```ts ignore
 * const latch: Latch<number, string> = Inactive("42");
 * activateWith(latch, (s) => parseInt(s, 10));
 * // latch is now Active(42)
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
 * ```ts ignore
 * const latch: Latch<number, string> = Inactive("paused");
 * activateIf(latch, Some(42)); // activates
 * activateIf(latch, None()); // no change
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
 * ```ts ignore
 * const latch: Latch<number, string> = Inactive("42");
 * activateWhen(latch, (s) => s.match(/^\d+$/) ? Some(parseInt(s, 10)) : None());
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
 * ```ts ignore
 * const latch: Latch<number, string> = Inactive("paused");
 * const previous = activateReplace(latch, 42);
 * // latch is now Active(42)
 * // previous is Inactive("paused")
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
