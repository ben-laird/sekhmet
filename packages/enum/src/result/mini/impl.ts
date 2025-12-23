import { match } from "@sekhmet/enum/core/mini/exit";
import {
	inspectIsolated,
	isolate,
	isolateAnd,
} from "@sekhmet/enum/core/mini/isolate";

import { None, type Option, Some } from "@/src/option/mini/core.ts";
import { Err, Ok, type Result } from "./core.ts";

// TODO - impl the rest of Result functions

export function isOk<T, E>(self: Result<T, E>): self is Result<T, never> {
	return isolate(self, "Ok");
}

export function isOkAnd<T, E, U extends T>(
	self: Result<T, E>,
	predicate: ((value: T) => value is U) | ((value: T) => boolean),
): self is Result<U, never> {
	return isolateAnd(self, "Ok", predicate);
}

export function isErr<T, E>(self: Result<T, E>): self is Result<never, E> {
	return isolate(self, "Err");
}

export function isErrAnd<T, E, F extends E>(
	self: Result<T, E>,
	predicate: ((value: E) => value is F) | ((value: E) => boolean),
): self is Result<never, E> {
	return isolateAnd(self, "Err", predicate);
}

export function ok<T, E>(self: Result<T, E>): Option<T> {
	return match(self)({
		Ok: (value) => Some(value),
		Err: () => None(),
	});
}

export function err<T, E>(self: Result<T, E>): Option<E> {
	return match(self)({
		Ok: () => None(),
		Err: (err) => Some(err),
	});
}

export function map<T, E, U>(
	self: Result<T, E>,
	mapping: (value: T) => U,
): Result<U, E> {
	return match(self)({
		Ok: (value) => Ok(mapping(value)),
		Err,
	});
}

export function mapOr<T, E, U>(
	self: Result<T, E>,
	defaultValue: U,
	mapping: (value: T) => U,
): U {
	return match(self)({
		Ok: mapping,
		Err: () => defaultValue,
	});
}

export function mapOrElse<T, E, U>(
	self: Result<T, E>,
	okMapping: (value: T) => U,
	errMapping: (value: E) => U,
): U {
	return match(self)({
		Ok: okMapping,
		Err: errMapping,
	});
}

export function mapErr<T, E, F>(
	self: Result<T, E>,
	mapping: (err: E) => F,
): Result<T, F> {
	return match(self)({
		Ok,
		Err: (err) => Err(mapping(err)),
	});
}

export function inspect<T, E>(
	self: Result<T, E>,
	inspector: (value: T) => void,
): void {
	inspectIsolated(self, "Ok", inspector);
}

export function inspectErr<T, E>(
	self: Result<T, E>,
	inspector: (err: E) => void,
): void {
	inspectIsolated(self, "Err", inspector);
}
