import { getStructParams } from "@sekhmet/primordials/struct";

import { match } from "@/src/core/mini/exit.ts";
import { None, Option, Some } from "./core.ts";

export function insert<T>(self: Option<T>, value: T): T {
	const selfState = getStructParams(self);

	selfState.variant = ["Some", value];

	return value;
}

export function getOrInsert<T>(self: Option<T>, value: T): T {
	return match(self)({
		Some: (value) => value,
		None: () => insert(self, value),
	});
}

export function getOrInsertWith<T>(self: Option<T>, creator: () => T): T {
	return match(self)({
		Some: (value) => value,
		None: () => insert(self, creator()),
	});
}

export function take<T>(self: Option<T>): Option<T> {
	const selfState = getStructParams(self);

	return match(self)({
		Some(value) {
			selfState.variant = ["None"];

			return Some(value);
		},
		None,
	});
}

export function takeIf<T, U extends T>(
	self: Option<T>,
	predicate: ((value: T) => value is U) | ((value: T) => boolean),
): Option<U> {
	const selfState = getStructParams(self);

	return match(self)({
		Some(value) {
			const p = predicate as (value: T) => value is U;

			if (!p(value)) return None();

			selfState.variant = ["None"];

			return Some(value);
		},
		None,
	});
}

export function replace<T>(self: Option<T>, value: T): Option<T> {
	const selfState = getStructParams(self);

	const oldVariant = selfState.variant;

	selfState.variant = ["Some", value];

	return new Option(...oldVariant);
}
