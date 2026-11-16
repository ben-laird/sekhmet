/**
 * The conversions behind each {@linkcode CoerceMode}. Each returns the
 * converted value, or `undefined` when the input does not convert. Not part
 * of the public API.
 *
 * @module
 */

import type { CoerceMode } from "./coerce.ts";
import { type ReadWord, wordReader } from "./words.ts";

/**
 * Runs a native conversion, turning the `TypeError` it throws for an
 * unconvertible value (a symbol, an object without a primitive value) into
 * `undefined`. Any other error is a bug in the input's own conversion code,
 * so it propagates.
 */
function attempt<T>(convert: () => T): T | undefined {
	try {
		return convert();
	} catch (error) {
		if (error instanceof TypeError) return undefined;
		throw error;
	}
}

const DECIMAL = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE = BigInt(Number.MIN_SAFE_INTEGER);

/**
 * Strict number coercion: a trimmed decimal or exponent string, a boolean
 * as 1/0, or a bigint in the safe-integer range.
 */
function strictNumber(input: unknown): number | undefined {
	switch (typeof input) {
		case "string": {
			const text = input.trim();
			return DECIMAL.test(text) ? Number(text) : undefined;
		}
		case "boolean":
			return input ? 1 : 0;
		case "bigint":
			return input >= MIN_SAFE && input <= MAX_SAFE ? Number(input) : undefined;
		default:
			return undefined;
	}
}

/** Strict string coercion: a finite number, a bigint or a boolean. */
function strictString(input: unknown): string | undefined {
	switch (typeof input) {
		case "number":
			return Number.isFinite(input) ? String(input) : undefined;
		case "bigint":
		case "boolean":
			return String(input);
		default:
			return undefined;
	}
}

const readDefaultWord: ReadWord = wordReader(undefined);

/** Strict boolean coercion: `0`/`1`, `0n`/`1n`, or a default stringbool word. */
function strictBoolean(input: unknown): boolean | undefined {
	switch (typeof input) {
		case "number":
		case "bigint":
			if (input === 0 || input === 0n) return false;
			if (input === 1 || input === 1n) return true;
			return undefined;
		case "string":
			return readDefaultWord(input);
		default:
			return undefined;
	}
}

/** Converts an input to a number under a coercion mode. */
export function coerceNumber(
	input: unknown,
	mode: CoerceMode,
): number | undefined {
	if (typeof input === "number") return input;
	if (mode === "native") return attempt(() => Number(input));

	return mode ? strictNumber(input) : undefined;
}

/** Converts an input to a string under a coercion mode. */
export function coerceString(
	input: unknown,
	mode: CoerceMode,
): string | undefined {
	if (typeof input === "string") return input;
	if (mode === "native") return attempt(() => String(input));

	return mode ? strictString(input) : undefined;
}

/** Converts an input to a boolean under a coercion mode. */
export function coerceBoolean(
	input: unknown,
	mode: CoerceMode,
): boolean | undefined {
	if (typeof input === "boolean") return input;
	if (mode === "native") return Boolean(input);

	return mode ? strictBoolean(input) : undefined;
}
