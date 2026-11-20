/**
 * What adopting a child did: {@linkcode Adoption}.
 *
 * @module
 */

import { Enum, type Split } from "@sekhmet/enum/core/mini";

/** The variants of {@linkcode Adoption}. */
type Variants = Split<{
	/** The child now belongs to this lifetime. */
	Adopted: [];
	/** The child already has an owner; a lifetime has at most one. */
	AlreadyOwned: [];
	/** The child is this lifetime or one of its owners. */
	WouldCycle: [];
	/** The child had already started ending: there is nothing to own. */
	ChildEnded: [];
	/**
	 * This lifetime is ending or has ended, so the child was ended at once
	 * (or, if `fromParent` panicked, left an Alive root).
	 */
	ParentEnded: [];
}>;

export type { Variants as AdoptionVariants };

/**
 * What `adopt` did. Only `Adopted` makes the child part of the parent's
 * teardown; every other variant says why not, and none leaks the child:
 * `ParentEnded` ended it at once. Read it with `match` or `isolate`.
 *
 * @example
 * ```ts
 * import { isolate } from "@sekhmet/enum/core/mini";
 * import { definePanicRuntime } from "@sekhmet/panic";
 * import { Lifetime } from "@sekhmet/lifetime";
 * import { assert } from "@std/assert";
 *
 * const panics = definePanicRuntime();
 * const parent = new Lifetime<string, string>({ value: "parent", panics });
 * const child = new Lifetime<string, string>({ value: "child", panics });
 *
 * assert(isolate(parent.adopt({ child }), "Adopted"));
 * assert(isolate(parent.adopt({ child }), "AlreadyOwned"));
 * assert(isolate(child.adopt({ child: parent }), "WouldCycle"));
 * ```
 */
export class Adoption extends Enum<Variants> {}
