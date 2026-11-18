/**
 * Never-throwing, bounded renderers for values that end up in a panic
 * message. A panic message is built while panicking, so rendering must not
 * throw on anything (cycles, BigInts, symbols, functions, throwing getters, a
 * `toJSON` that throws, a revoked Proxy) and must stay small and fast however
 * large the value is. Runtime-agnostic: no `Deno.inspect`, no `node:util`.
 *
 * @module
 */

/** How deep {@linkcode describeValue} walks into nested objects. */
const MAX_DEPTH = 2;

/** How many entries {@linkcode describeValue} shows per object or list. */
const MAX_ENTRIES = 10;

/** How many own keys of an object are examined to find its entries. */
const MAX_SCANNED_KEYS = 100;

/** How many characters of a string or key {@linkcode describeValue} shows. */
const MAX_STRING = 200;

/** How many characters of caller text {@linkcode displayText} keeps. */
const MAX_TEXT = 1000;

/** The text shown for a value that cannot be rendered at all. */
export const UNRENDERABLE = "[unrenderable value]";

/** The name shown for a function without one. */
const ANONYMOUS = "(anonymous)";

// The engine's own accessors, read once; calling one on a value is a brand
// check that runs no code of the value's.
const TYPED_ARRAY_LENGTH = intrinsicGetter({
	target: Object.getPrototypeOf(Uint8Array.prototype),
	key: "length",
});
const MAP_SIZE = intrinsicGetter({ target: Map.prototype, key: "size" });
const SET_SIZE = intrinsicGetter({ target: Set.prototype, key: "size" });

/**
 * Renders any value for a message, the way a debugger would show it: strings
 * quoted, `-0` and BigInts (`1n`) kept apart, functions as
 * `[Function: name]`, errors as `[TypeError: message]`, and objects, arrays,
 * typed arrays, maps and sets shallowly, with cycles shown as `[Circular]`.
 * It reads no getter (shown as `[Getter]`) and calls no `toJSON` or
 * `toString`, so it never throws, and it is bounded: long strings and keys
 * are cut, and at most a few entries of each level are shown.
 *
 * @param value Any value
 * @returns A one-line rendering of `value`
 */
export function describeValue(value: unknown): string {
	return guarded({
		render: () => {
			return describeAt({ value, depth: 0, ancestors: [] });
		},
	});
}

/**
 * Renders text a caller passed in: a string as itself, anything else through
 * `String` (so a `URL` reads as its href), falling back to
 * {@linkcode describeValue} when `String` throws. Text past a thousand
 * characters is cut.
 *
 * @param value The text, or a value that stands for it
 * @returns `value` as text
 */
export function displayText(value: unknown): string {
	if (typeof value === "string") {
		return truncate({ text: value, max: MAX_TEXT });
	}
	try {
		return truncate({ text: String(value), max: MAX_TEXT });
	} catch {
		return describeValue(value);
	}
}

/**
 * Cuts `text` to `max` characters, saying how many were left out.
 *
 * @param params.text The text to cut
 * @param params.max How many characters to keep
 * @returns `text`, or its first `max` characters and a count of the rest
 */
export function truncate({ text, max }: { text: string; max: number }): string {
	if (text.length <= max) {
		return text;
	}
	return `${text.slice(0, max)}… ${text.length - max} more chars`;
}

/** Runs a renderer, turning any throw into `fallback`. */
function guarded({
	render,
	fallback = UNRENDERABLE,
}: {
	render: () => string;
	fallback?: string;
}): string {
	try {
		return render();
	} catch {
		return fallback;
	}
}

interface Walk {
	depth: number;
	ancestors: readonly object[];
}

function describeAt({
	value,
	depth,
	ancestors,
}: { value: unknown } & Walk): string {
	switch (typeof value) {
		case "string": {
			return quoted(value);
		}
		case "number": {
			return Object.is(value, -0) ? "-0" : String(value);
		}
		case "bigint": {
			return `${value}n`;
		}
		case "boolean":
		case "undefined": {
			return String(value);
		}
		case "symbol": {
			return truncate({ text: String(value), max: MAX_STRING });
		}
		case "function": {
			const name = guarded({
				render: () => functionName(value),
				fallback: ANONYMOUS,
			});
			return `[Function: ${name}]`;
		}
		case "object": {
			if (value === null) {
				return "null";
			}
			if (ancestors.includes(value)) {
				return "[Circular]";
			}
			return describeObject({
				value,
				depth,
				ancestors: [...ancestors, value],
			});
		}
	}
}

function describeObject({
	value,
	depth,
	ancestors,
}: { value: object } & Walk): string {
	const walk: Walk = { depth, ancestors };
	if (Array.isArray(value)) {
		const length = ownDataValue({ value, key: "length" });
		return describeList({
			value,
			length: typeof length === "number" ? length : 0,
			label: "",
			walk,
		});
	}
	const typedLength = callGetter({ getter: TYPED_ARRAY_LENGTH, target: value });
	if (typeof typedLength === "number") {
		const name = constructorPrefix(value) || "TypedArray";
		return describeList({
			value,
			length: typedLength,
			label: `${name}(${typedLength}) `,
			walk,
		});
	}
	if (isMap(value)) {
		return describeMap({ value, walk });
	}
	if (isSet(value)) {
		return describeSet({ value, walk });
	}
	const prefix = constructorPrefix(value);
	if (isError(value)) {
		return describeError({ value, prefix });
	}
	if (depth >= MAX_DEPTH) {
		return `[${prefix || "Object"}]`;
	}
	const body = describeEntries({ value, walk });
	return prefix === "" ? body : `${prefix} ${body}`;
}

/** An array or typed array, read by index up to {@linkcode MAX_ENTRIES}. */
function describeList({
	value,
	length,
	label,
	walk,
}: {
	value: object;
	length: number;
	label: string;
	walk: Walk;
}): string {
	if (walk.depth >= MAX_DEPTH) {
		return label === "" ? "[Array]" : `[${label.trimEnd()}]`;
	}
	const shown = Math.min(length, MAX_ENTRIES);
	const entries: string[] = [];
	for (let index = 0; index < shown; index++) {
		entries.push(
			propertyEntry({ value, key: String(index), walk }) ?? "<empty>",
		);
	}
	if (length > shown) {
		entries.push(`… ${length - shown} more`);
	}
	return `${label}[${entries.join(", ")}]`;
}

/** A plain object or class instance's own enumerable properties. */
function describeEntries({
	value,
	walk,
}: {
	value: object;
	walk: Walk;
}): string {
	const names = Object.getOwnPropertyNames(value);
	const entries: string[] = [];
	let scanned = 0;
	while (
		entries.length < MAX_ENTRIES &&
		scanned < names.length &&
		scanned < MAX_SCANNED_KEYS
	) {
		const key = names[scanned] ?? "";
		scanned++;
		const entry = propertyEntry({ value, key, walk });
		if (entry !== undefined) {
			entries.push(`${propertyKey(key)}: ${entry}`);
		}
	}
	if (names.length > scanned) {
		entries.push(`… ${names.length - scanned} more`);
	}
	return entries.length === 0 ? "{}" : `{ ${entries.join(", ")} }`;
}

function describeMap({
	value,
	walk,
}: {
	value: Map<unknown, unknown>;
	walk: Walk;
}): string {
	const size = callGetter({ getter: MAP_SIZE, target: value });
	const label = `Map(${typeof size === "number" ? size : "?"})`;
	if (walk.depth >= MAX_DEPTH) {
		return `[${label}]`;
	}
	const entries: string[] = [];
	const iterator = Map.prototype.entries.call(value);
	for (let next = iterator.next(); !next.done; next = iterator.next()) {
		if (entries.length >= MAX_ENTRIES) {
			break;
		}
		const [key, item] = next.value;
		entries.push(
			`${nested({ value: key, walk })} => ${nested({ value: item, walk })}`,
		);
	}
	return describeCollection({ label, entries, size });
}

function describeSet({
	value,
	walk,
}: {
	value: Set<unknown>;
	walk: Walk;
}): string {
	const size = callGetter({ getter: SET_SIZE, target: value });
	const label = `Set(${typeof size === "number" ? size : "?"})`;
	if (walk.depth >= MAX_DEPTH) {
		return `[${label}]`;
	}
	const entries: string[] = [];
	const iterator = Set.prototype.values.call(value);
	for (let next = iterator.next(); !next.done; next = iterator.next()) {
		if (entries.length >= MAX_ENTRIES) {
			break;
		}
		entries.push(nested({ value: next.value, walk }));
	}
	return describeCollection({ label, entries, size });
}

/** `Label { a, b, … N more }` from the shown entries and the size. */
function describeCollection({
	label,
	entries,
	size,
}: {
	label: string;
	entries: readonly string[];
	size: unknown;
}): string {
	const hidden = typeof size === "number" ? size - entries.length : 0;
	const all = hidden > 0 ? [...entries, `… ${hidden} more`] : entries;
	return all.length === 0 ? `${label} {}` : `${label} { ${all.join(", ")} }`;
}

/** `[TypeError: message]`, from the error's own `message` data property. */
function describeError({
	value,
	prefix,
}: {
	value: object;
	prefix: string;
}): string {
	const name = prefix || "Error";
	const message = ownDataValue({ value, key: "message" });
	if (typeof message !== "string" || message === "") {
		return `[${name}]`;
	}
	return `[${name}: ${truncate({ text: message, max: MAX_STRING })}]`;
}

/** A value one level down, rendered without throwing. */
function nested({ value, walk }: { value: unknown; walk: Walk }): string {
	return guarded({
		render: () => {
			return describeAt({
				value,
				depth: walk.depth + 1,
				ancestors: walk.ancestors,
			});
		},
	});
}

/**
 * One enumerable own property, read through its descriptor so no getter runs;
 * `undefined` for a property that is missing or not enumerable.
 */
function propertyEntry({
	value,
	key,
	walk,
}: {
	value: object;
	key: string;
	walk: Walk;
}): string | undefined {
	try {
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		if (descriptor === undefined || !descriptor.enumerable) {
			return undefined;
		}
		if (!("value" in descriptor)) {
			return "[Getter]";
		}
		return nested({ value: descriptor.value, walk });
	} catch {
		return UNRENDERABLE;
	}
}

/** An own data property's value, or `undefined`; it runs no getter. */
function ownDataValue({ value, key }: { value: object; key: string }): unknown {
	try {
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		return descriptor !== undefined && "value" in descriptor
			? descriptor.value
			: undefined;
	} catch {
		return undefined;
	}
}

/** A class instance's constructor name, or `""` for a plain object. */
function constructorPrefix(value: object): string {
	return guarded({
		render: () => {
			const prototype = Object.getPrototypeOf(value);
			if (prototype === null || prototype === Object.prototype) {
				return "";
			}
			const maker = ownDataValue({ value: prototype, key: "constructor" });
			return typeof maker === "function" ? functionName(maker) : "";
		},
		fallback: "",
	});
}

/** A function's own `name`, read without running a getter. */
function functionName(fn: object): string {
	const name = ownDataValue({ value: fn, key: "name" });
	return typeof name === "string" && name !== ""
		? truncate({ text: name, max: MAX_STRING })
		: ANONYMOUS;
}

/** A string, quoted and cut to {@linkcode MAX_STRING} characters. */
function quoted(text: string): string {
	if (text.length <= MAX_STRING) {
		return JSON.stringify(text);
	}
	const rest = text.length - MAX_STRING;
	return `${JSON.stringify(text.slice(0, MAX_STRING))}… ${rest} more chars`;
}

/** A key as written in an object literal: bare when it is an identifier. */
function propertyKey(key: string): string {
	if (/^[A-Za-z_$][\w$]*$/.test(key) && key.length <= MAX_STRING) {
		return key;
	}
	return quoted(key);
}

function isMap(value: object): value is Map<unknown, unknown> {
	return callGetter({ getter: MAP_SIZE, target: value }) !== undefined;
}

function isSet(value: object): value is Set<unknown> {
	return callGetter({ getter: SET_SIZE, target: value }) !== undefined;
}

function isError(value: object): boolean {
	try {
		return value instanceof Error;
	} catch {
		return false;
	}
}

/** Calls an engine accessor on `target`; `undefined` when it rejects it. */
function callGetter({
	getter,
	target,
}: {
	getter: ((this: unknown) => unknown) | undefined;
	target: object;
}): unknown {
	if (getter === undefined) {
		return undefined;
	}
	try {
		return Reflect.apply(getter, target, []);
	} catch {
		return undefined;
	}
}

function intrinsicGetter({
	target,
	key,
}: {
	target: object;
	key: string;
}): ((this: unknown) => unknown) | undefined {
	return Object.getOwnPropertyDescriptor(target, key)?.get;
}
