/**
 * Never-throwing readers for the options a helper is given. The helpers run
 * while the program is already wrong, and an untyped caller can pass `null`,
 * a throwing getter or a hostile Proxy; a read that throws would replace the
 * panic with an unrelated error, so every read is guarded.
 *
 * @module
 */

import { displayText, UNRENDERABLE } from "./describe.ts";

/** One field read off a caller's options. */
export type FieldRead =
	| { readonly kind: "absent" }
	| { readonly kind: "present"; readonly value: unknown }
	| { readonly kind: "unreadable" };

/**
 * Reads `key` off `from` without throwing: `absent` when `from` is not an
 * object or lacks the key, `unreadable` when a getter or Proxy trap throws.
 */
export function readField({
	from,
	key,
}: {
	from: unknown;
	key: string;
}): FieldRead {
	try {
		if (!isObjectLike(from) || !(key in from)) {
			return { kind: "absent" };
		}
		return { kind: "present", value: Reflect.get(from, key) };
	} catch {
		return { kind: "unreadable" };
	}
}

/**
 * A text field: its string, any other value as display text, the
 * unrenderable marker when it cannot be read, and `undefined` when it is
 * absent or `undefined`.
 */
export function textField({
	from,
	key,
}: {
	from: unknown;
	key: string;
}): string | undefined {
	const read = readField({ from, key });
	switch (read.kind) {
		case "absent": {
			return undefined;
		}
		case "unreadable": {
			return UNRENDERABLE;
		}
		case "present": {
			return read.value === undefined ? undefined : displayText(read.value);
		}
	}
}

/** A URL field: the `URL` it holds, or `undefined` for anything else. */
export function urlField({
	from,
	key,
}: {
	from: unknown;
	key: string;
}): URL | undefined {
	const read = readField({ from, key });
	if (read.kind !== "present") {
		return undefined;
	}
	try {
		return read.value instanceof URL ? read.value : undefined;
	} catch {
		return undefined;
	}
}

/** A boolean field: `true` only when it holds `true`. */
export function flagField({
	from,
	key,
}: {
	from: unknown;
	key: string;
}): boolean {
	const read = readField({ from, key });
	return read.kind === "present" && read.value === true;
}

/**
 * A list field: a shallow copy of the array it holds, read by index (no
 * iterator runs), or `[]` for anything else or when reading it throws.
 */
export function listField({
	from,
	key,
}: {
	from: unknown;
	key: string;
}): readonly unknown[] {
	const read = readField({ from, key });
	if (read.kind !== "present") {
		return [];
	}
	try {
		if (!Array.isArray(read.value)) {
			return [];
		}
		const copy: unknown[] = Array.prototype.slice.call(read.value);
		return copy;
	} catch {
		return [];
	}
}

/**
 * Builds a message, falling back to its header alone if building it throws,
 * so a panic message is always produced.
 */
export function guardedMessage({
	header,
	build,
}: {
	header: string;
	build: () => string;
}): string {
	try {
		return build();
	} catch {
		return header;
	}
}

function isObjectLike(value: unknown): value is object {
	return (
		(typeof value === "object" && value !== null) || typeof value === "function"
	);
}
