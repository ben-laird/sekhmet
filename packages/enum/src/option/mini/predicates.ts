import { isolate, isolateAnd } from "@/src/core/mini/isolate.ts";
import type { Option } from "./core.ts";

export function isSome<T>(self: Option<T>): boolean {
	return isolate(self, "Some");
}

export function isSomeAnd<T, U extends T>(
	self: Option<T>,
	predicate: ((value: T) => value is U) | ((value: T) => boolean),
): self is Option<U> {
	return isolateAnd(self, "Some", predicate);
}

export function isNone<T>(self: Option<T>): self is Option<never> {
	return isolate(self, "None");
}
