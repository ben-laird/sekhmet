/**
 * Never-throwing renderers for values that end up in a panic message. A panic
 * message is built while panicking, so rendering must not throw on anything:
 * cycles, BigInts, symbols, functions, throwing getters, a `toJSON` that
 * throws, or a revoked Proxy. Runtime-agnostic: no `Deno.inspect`, no
 * `node:util`.
 *
 * @module
 */

/** How deep {@linkcode describeValue} walks into nested objects. */
const MAX_DEPTH = 2;

/** How many entries {@linkcode describeValue} shows per object or array. */
const MAX_ENTRIES = 10;

/** The text shown for a value that cannot be rendered at all. */
export const UNRENDERABLE = "[unrenderable value]";

/** The name shown for a function without one. */
const ANONYMOUS = "(anonymous)";

/**
 * Renders any value for a message, the way a debugger would show it: strings
 * quoted, `-0` and BigInts (`1n`) kept apart, functions as
 * `[Function: name]`, and objects and arrays shallowly, with cycles shown as
 * `[Circular]`. It reads no getter (shown as `[Getter]`) and calls no
 * `toJSON` or `toString`, so it never throws.
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
 * {@linkcode describeValue} when `String` throws.
 *
 * @param value The text, or a value that stands for it
 * @returns `value` as text
 */
export function displayText(value: unknown): string {
	if (typeof value === "string") {
		return value;
	}
	try {
		return String(value);
	} catch {
		return describeValue(value);
	}
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

function describeAt({
	value,
	depth,
	ancestors,
}: {
	value: unknown;
	depth: number;
	ancestors: readonly object[];
}): string {
	switch (typeof value) {
		case "string": {
			return JSON.stringify(value);
		}
		case "number": {
			return Object.is(value, -0) ? "-0" : String(value);
		}
		case "bigint": {
			return `${value}n`;
		}
		case "boolean":
		case "undefined":
		case "symbol": {
			return String(value);
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
			return describeObject({ value, depth, ancestors: [...ancestors, value] });
		}
	}
}

function describeObject({
	value,
	depth,
	ancestors,
}: {
	value: object;
	depth: number;
	ancestors: readonly object[];
}): string {
	const isArray = Array.isArray(value);
	const prefix = isArray ? "" : constructorPrefix(value);
	if (depth >= MAX_DEPTH) {
		return isArray ? "[Array]" : `[${prefix || "Object"}]`;
	}

	const entries: string[] = [];
	let hidden = 0;
	for (const key of Object.getOwnPropertyNames(value)) {
		if (entries.length >= MAX_ENTRIES) {
			hidden += isEnumerable({ value, key }) ? 1 : 0;
			continue;
		}
		const entry = propertyEntry({ value, key, depth, ancestors });
		if (entry !== undefined) {
			entries.push(isArray ? entry : `${propertyKey(key)}: ${entry}`);
		}
	}
	if (hidden > 0) {
		entries.push(`… ${hidden} more`);
	}

	if (isArray) {
		return `[${entries.join(", ")}]`;
	}
	const body = entries.length === 0 ? "{}" : `{ ${entries.join(", ")} }`;
	return prefix === "" ? body : `${prefix} ${body}`;
}

/**
 * One enumerable own property, read through its descriptor so no getter runs;
 * `undefined` for a property that is not enumerable.
 */
function propertyEntry({
	value,
	key,
	depth,
	ancestors,
}: {
	value: object;
	key: string;
	depth: number;
	ancestors: readonly object[];
}): string | undefined {
	try {
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		if (descriptor === undefined || !descriptor.enumerable) {
			return undefined;
		}
		if (!("value" in descriptor)) {
			return "[Getter]";
		}
		return describeAt({ value: descriptor.value, depth: depth + 1, ancestors });
	} catch {
		return UNRENDERABLE;
	}
}

/** Whether an own property counts as an entry; a throwing trap counts. */
function isEnumerable({ value, key }: { value: object; key: string }): boolean {
	try {
		return Object.getOwnPropertyDescriptor(value, key)?.enumerable ?? false;
	} catch {
		return true;
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
			const descriptor = Object.getOwnPropertyDescriptor(
				prototype,
				"constructor",
			);
			const maker: unknown = descriptor?.value;
			return typeof maker === "function" ? functionName(maker) : "";
		},
		fallback: "",
	});
}

/** A function's own `name`, read without running a getter. */
function functionName(fn: object): string {
	const name = Object.getOwnPropertyDescriptor(fn, "name")?.value;
	return typeof name === "string" && name !== "" ? name : ANONYMOUS;
}

/** A key as written in an object literal: bare when it is an identifier. */
function propertyKey(key: string): string {
	return /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);
}
