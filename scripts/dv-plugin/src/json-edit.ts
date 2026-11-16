import {
	Err,
	isErr,
	Ok,
	type Result,
	unwrap,
	unwrapErr,
} from "@sekhmet/enum/result/mini";
import { parse } from "@std/jsonc";

/**
 * A half-open character range `[start, end)` in a source text.
 */
export interface Span {
	/** Index of the first character in the range. */
	start: number;
	/** Index one past the last character in the range. */
	end: number;
}

/**
 * Why a surgical JSON edit could not be applied.
 */
export type JsonEditError =
	| { kind: "invalid-json"; detail: string }
	| { kind: "field-missing"; path: readonly string[] }
	| { kind: "field-not-string"; path: readonly string[] };

/**
 * Parses JSON-with-comments text, turning the parser's throw into a value.
 *
 * @param text The JSONC source.
 * @returns The parsed value, or an `invalid-json` error.
 */
export function parseJsonc(text: string): Result<unknown, JsonEditError> {
	try {
		return Ok(parse(text));
	} catch (caught: unknown) {
		const detail = caught instanceof Error ? caught.message : String(caught);
		return Err({ kind: "invalid-json", detail });
	}
}

/**
 * Locates the string literal (quotes included) stored at `path` in a JSONC
 * object, without parsing the text into a value.
 *
 * Assumes well-formed input; returns `undefined` when the path is absent, does
 * not hold a string, or the text is malformed. When a key repeats, the last
 * occurrence wins, matching `JSON.parse`.
 *
 * @param args.text The JSONC source.
 * @param args.path Object keys from the root to the target field.
 * @returns The span of the string literal, or `undefined`.
 */
export function locateStringValue({
	text,
	path,
}: {
	text: string;
	path: readonly string[];
}): Span | undefined {
	let position = 0;
	let found: Span | undefined;

	const skipTrivia = (): void => {
		while (position < text.length) {
			const character = text[position];
			if (
				character === " " ||
				character === "\t" ||
				character === "\n" ||
				character === "\r"
			) {
				position++;
			} else if (text.startsWith("//", position)) {
				const lineEnd = text.indexOf("\n", position);
				position = lineEnd === -1 ? text.length : lineEnd + 1;
			} else if (text.startsWith("/*", position)) {
				const blockEnd = text.indexOf("*/", position + 2);
				position = blockEnd === -1 ? text.length : blockEnd + 2;
			} else {
				return;
			}
		}
	};

	// Expects `position` on an opening quote; leaves it past the closing one.
	const skipString = (): boolean => {
		position++;
		while (position < text.length) {
			const character = text[position];
			position += character === "\\" ? 2 : 1;
			if (character === '"') return true;
		}
		return false;
	};

	// `matched` counts the leading path segments this value sits under, or is
	// `undefined` once the walk has left the target path.
	const scanValue = (matched: number | undefined): boolean => {
		skipTrivia();
		const character = text[position];
		if (character === "{") return scanObject(matched);
		if (character === "[") return scanArray();
		if (character === '"') {
			const start = position;
			if (!skipString()) return false;
			if (matched === path.length) found = { start, end: position };
			return true;
		}
		const scalarStart = position;
		while (
			position < text.length &&
			!",}] \t\r\n/".includes(text[position] ?? "")
		) {
			position++;
		}
		return position > scalarStart;
	};

	const scanObject = (matched: number | undefined): boolean => {
		position++;
		for (;;) {
			skipTrivia();
			const character = text[position];
			if (character === "}") {
				position++;
				return true;
			}
			if (character !== '"') return false;
			const keyStart = position;
			if (!skipString()) return false;
			const rawKey = text.slice(keyStart, position);
			skipTrivia();
			if (text[position] !== ":") return false;
			position++;
			const segment = matched === undefined ? undefined : path[matched];
			const childMatched =
				matched !== undefined &&
				segment !== undefined &&
				rawKey === JSON.stringify(segment)
					? matched + 1
					: undefined;
			if (!scanValue(childMatched)) return false;
			skipTrivia();
			if (text[position] === ",") position++;
			else if (text[position] !== "}") return false;
		}
	};

	const scanArray = (): boolean => {
		position++;
		for (;;) {
			skipTrivia();
			if (text[position] === "]") {
				position++;
				return true;
			}
			if (!scanValue(undefined)) return false;
			skipTrivia();
			if (text[position] === ",") position++;
			else if (text[position] !== "]") return false;
		}
	};

	if (path.length === 0) return undefined;
	return scanValue(0) ? found : undefined;
}

/**
 * Reads the value at `path` from an already-parsed JSON value.
 *
 * @param args.value The parsed JSON value.
 * @param args.path Object keys from the root to the target field.
 * @returns The value at the path, or `undefined` when any segment is absent.
 */
export function valueAtPath({
	value,
	path,
}: {
	value: unknown;
	path: readonly string[];
}): unknown {
	let current: unknown = value;
	for (const segment of path) {
		if (
			typeof current !== "object" ||
			current === null ||
			Array.isArray(current) ||
			!Object.hasOwn(current, segment)
		) {
			return undefined;
		}
		current = Object.getOwnPropertyDescriptor(current, segment)?.value;
	}
	return current;
}

/**
 * Replaces the string stored at `path` in a JSONC document, leaving every
 * other byte (indentation, blank lines, comments, key order) untouched.
 *
 * @param args.text The JSONC source.
 * @param args.path Object keys from the root to the target field.
 * @param args.value The new string value.
 * @returns The edited text, or why the edit could not be applied.
 */
export function replaceStringField({
	text,
	path,
	value,
}: {
	text: string;
	path: readonly string[];
	value: string;
}): Result<string, JsonEditError> {
	const parsed = parseJsonc(text);
	if (isErr(parsed)) return Err(unwrapErr(parsed));
	const current = valueAtPath({ value: unwrap(parsed), path });
	if (current === undefined) return Err({ kind: "field-missing", path });
	if (typeof current !== "string") {
		return Err({ kind: "field-not-string", path });
	}
	const span = locateStringValue({ text, path });
	if (span === undefined) {
		return Err({
			kind: "invalid-json",
			detail: `parsed but could not locate ${path.join(".")}`,
		});
	}
	return Ok(
		`${text.slice(0, span.start)}${JSON.stringify(value)}${text.slice(span.end)}`,
	);
}

/**
 * Renders a {@linkcode JsonEditError} as a human-readable sentence.
 *
 * @param error The error to describe.
 * @returns A one-line description.
 */
export function describeJsonEditError(error: JsonEditError): string {
	switch (error.kind) {
		case "invalid-json":
			return `invalid JSON: ${error.detail}`;
		case "field-missing":
			return `field "${error.path.join(".")}" is missing`;
		case "field-not-string":
			return `field "${error.path.join(".")}" is not a string`;
	}
}
