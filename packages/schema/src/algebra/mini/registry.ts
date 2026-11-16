/**
 * What the algebra records about the schemas it builds, keyed by parser
 * (which a main schema shares with its mini form), for introspection.
 * Internal: not exported from the mini barrel.
 *
 * @module
 */

import { getStructParams } from "@sekhmet/primordials/struct";
import type { Child, ChildParsed } from "@/src/composites/mini/collect.ts";

/** A branded schema's brand, and the schema it brands. */
interface BrandRecord {
	/** The brand's name. */
	readonly name: string;
	/** The schema the brand was added to. */
	readonly inner: Child;
}

const BRANDS: WeakMap<object, BrandRecord> = new WeakMap();

/** Records that `parser` brands `inner`'s output `name`. */
export function recordBrand({
	parser,
	name,
	inner,
}: {
	parser: (input: unknown) => ChildParsed;
	name: string;
	inner: Child;
}): void {
	BRANDS.set(parser, { name, inner });
}

/** A schema's brands, innermost first; empty when it has none. */
export function brandsOf(schema: Child): readonly string[] {
	const found = BRANDS.get(getStructParams(schema));
	if (found === undefined) return [];

	return [...brandsOf(found.inner), found.name];
}
