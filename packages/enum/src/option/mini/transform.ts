import { match, union } from "@/src/core/mini/exit.ts";
import { isolate } from "@/src/core/mini/isolate.ts";
import { None, type Option, Some } from "./core.ts";

export function map<T, U>(
	self: Option<T>,
	mapping: (value: T) => U,
): Option<U> {
	return match(self)({
		Some: (value) => Some(mapping(value)),
		None,
	});
}

export function inspect<T>(
	self: Option<T>,
	inspector: (value: T) => void,
): Option<T> {
	const variant = self;

	if (isolate(variant, "Some")) {
		inspector(union(variant));
	}

	return self;
}

export function inspectNone<T>(
	self: Option<T>,
	inspector: () => void,
): Option<T> {
	const variant = self;

	if (isolate(variant, "Some")) {
		inspector();
	}

	return self;
}

export function mapOr<T, U>(
	self: Option<T>,
	handlers: {
		defaultValue: U;
		mapping: (value: T) => U;
	},
): U;
export function mapOr<T, U>(
	self: Option<T>,
	...handlers: [defaultValue: U, mapping: (value: T) => U]
): U;
export function mapOr<T, U>(
	self: Option<T>,
	...handlers:
		| [{ defaultValue: U; mapping: (value: T) => U }]
		| [defaultValue: U, mapping: (value: T) => U]
): U {
	return match(self)({
		Some(value) {
			if (handlers.length === 2) {
				return handlers[1](value);
			}

			const { mapping } = handlers[0];

			return mapping(value);
		},
		None() {
			if (handlers.length === 2) {
				return handlers[0];
			}

			const { defaultValue } = handlers[0];

			return defaultValue;
		},
	});
}

export function mapOrElse<T, U>(
	self: Option<T>,
	handlers: {
		None: () => U;
		Some: (value: T) => U;
	},
): U;
export function mapOrElse<T, U>(
	self: Option<T>,
	...handlers: [None: () => U, Some: (value: T) => U]
): U;
export function mapOrElse<T, U>(
	self: Option<T>,
	...handlers:
		| [{ None: () => U; Some: (value: T) => U }]
		| [None: () => U, Some: (value: T) => U]
): U {
	const h = (() => {
		if (handlers.length === 1) return handlers[0];

		const [None, Some] = handlers;
		return { Some, None };
	})();

	return match(self)(h);
}
