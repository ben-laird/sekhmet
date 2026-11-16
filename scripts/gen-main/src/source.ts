/**
 * Source-text recovery for what `deno doc --json` drops: the `const`, `in`
 * and `out` modifiers on type parameters.
 *
 * @module
 */

/** A type parameter's modifiers, keyed by the parameter's name. */
export type TypeParamModifiers = ReadonlyMap<string, readonly string[]>;

const MODIFIER = /^\s*((?:(?:const|in|out)\s+)*)([A-Za-z_$][\w$]*)/;
const HEADER =
	/^(?:export\s+)?(?:declare\s+)?(?:default\s+)?(?:async\s+)?(?:abstract\s+)?(?:function\s*\*?|class)\s*[A-Za-z_$][\w$]*\s*/;
const OPENERS = new Set(["<", "(", "[", "{"]);
const CLOSERS = new Set([">", ")", "]", "}"]);

/**
 * Slices a source file at a UTF-8 byte offset, which is how `deno doc`
 * locates declarations.
 *
 * @param options.source - The whole source file
 * @param options.byteIndex - The byte offset to start from
 * @returns The source from that offset on
 */
export function sliceFromByte({
	source,
	byteIndex,
}: {
	source: string;
	byteIndex: number;
}): string {
	const bytes = new TextEncoder().encode(source);

	return new TextDecoder().decode(bytes.subarray(byteIndex));
}

/**
 * Splits text on commas that are not nested in brackets.
 *
 * @param text - The text to split
 * @returns The top-level comma-separated pieces
 */
export function splitTopLevel(text: string): string[] {
	const pieces: string[] = [];
	let depth = 0;
	let start = 0;

	for (let i = 0; i < text.length; i++) {
		const char = text.charAt(i);
		if (char === ">" && text.charAt(i - 1) === "=") continue;
		if (OPENERS.has(char)) depth++;
		else if (CLOSERS.has(char)) depth--;
		else if (char === "," && depth === 0) {
			pieces.push(text.slice(start, i));
			start = i + 1;
		}
	}
	pieces.push(text.slice(start));

	return pieces;
}

/**
 * Reads the modifiers of a function's or class's type parameters from the
 * declaration's source text.
 *
 * @param declaration - Source text starting at the declaration (`export function f<…>(…)`)
 * @returns Each type parameter's modifiers; empty when there are none or the
 *   header can't be read
 */
export function typeParamModifiers(declaration: string): TypeParamModifiers {
	const modifiers = new Map<string, readonly string[]>();
	const header = HEADER.exec(declaration);
	if (!header) return modifiers;

	const rest = declaration.slice(header[0].length);
	if (!rest.startsWith("<")) return modifiers;

	let depth = 0;
	let end = -1;
	for (let i = 0; i < rest.length; i++) {
		const char = rest.charAt(i);
		if (char === ">" && rest.charAt(i - 1) === "=") continue;
		if (OPENERS.has(char)) depth++;
		else if (CLOSERS.has(char)) depth--;
		if (depth === 0) {
			end = i;
			break;
		}
	}
	if (end < 0) return modifiers;

	for (const piece of splitTopLevel(rest.slice(1, end))) {
		const match = MODIFIER.exec(piece);
		const name = match?.[2];
		if (!match || name === undefined) continue;

		const found = (match[1] ?? "").split(/\s+/).filter((m) => m !== "");
		if (found.length > 0) modifiers.set(name, found);
	}

	return modifiers;
}
