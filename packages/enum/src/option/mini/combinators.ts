import { match, union } from "@/src/core/mini/exit.ts";
import { isolate } from "@/src/core/mini/isolate.ts";
import { Ok, type Result } from "@/src/result/mini/core.ts";
import { None, type Option, Some } from "./core.ts";
import { map, mapOr } from "./transform.ts";
import { unwrapOr } from "./unwrap.ts";

export function* iter<T>(self: Option<T>): Generator<T, void, undefined> {
	const variant = self;

	if (isolate(variant, "Some")) {
		yield union(variant);
	}
}

export function and<T, U>(self: Option<T>, optionB: Option<U>): Option<U> {
	return match(self)({
		Some: () => optionB,
		None,
	});
}

export function andThen<T, U>(
	self: Option<T>,
	optionB: (value: T) => Option<U>,
): Option<U> {
	return match(self)({
		Some: optionB,
		None,
	});
}

export function filter<T, U extends T>(
	self: Option<T>,
	predicate: ((value: T) => value is U) | ((value: T) => boolean),
): Option<U> {
	return match(self)({
		Some(value): Option<U> {
			const p = predicate as (value: T) => value is U;

			if (!p(value)) return None();

			return Some(value);
		},
		None,
	});
}

export function or<T>(self: Option<T>, optionB: Option<T>): Option<T> {
	return match(self)({
		Some,
		None: () => optionB,
	});
}

export function orElse<T>(
	self: Option<T>,
	optionB: () => Option<T>,
): Option<T> {
	return match(self)({
		Some,
		None: optionB,
	});
}

export function zip<T, U>(
	self: Option<T>,
	other: Option<U>,
): Option<[first: T, second: U]> {
	return match(self)({
		Some(value) {
			return match(other)({
				Some: (otherValue) => Some([value, otherValue]),
				None,
			});
		},
		None,
	});
}

export function zipWith<T, U, V>(
	self: Option<T>,
	other: Option<U>,
	mapping: (first: T, second: U) => V,
): Option<V> {
	return map(zip(self, other), (value) => mapping(...value));
}

export function coalesce<T, U>(self: Option<T>, sentinel: U): T | U {
	return match(self)({
		Some: (value): T | U => value,
		None: () => sentinel,
	});
}

export function unzip<T, U>(
	opt: Option<[first: T, second: U]>,
): [first: Option<T>, second: Option<U>] {
	return mapOr(opt, [None(), None()], ([first, second]) => {
		return [Some(first), Some(second)] as const;
	});
}

export function transpose<T, E>(
	opt: Option<Result<T, E>>,
): Result<Option<T>, E> {
	return mapOr(opt, Ok(None()), () => {
		// TODO - impl transpose()
		throw new Error("impl transpose()");
	});
}

export function flatten<T>(opt: Option<Option<T>>): Option<T> {
	return unwrapOr(opt, None());
}
