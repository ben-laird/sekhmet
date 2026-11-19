/**
 * The functions in a source and the parameters each binds, read from the
 * structure view (comments and string contents blanked), so the
 * Given/When/Then check can tell a test context's `t.step` from any other
 * `.step` call.
 *
 * @module
 */

/** A function in a source: where it starts, its body, and its parameters. */
export interface FunctionBinding {
	/** Index where the function starts (its parameter list or name) */
	readonly start: number;
	/** Index of the first character of its body */
	readonly bodyStart: number;
	/** Index just past the end of its body */
	readonly bodyEnd: number;
	/** The plain identifier parameters it binds, in order (`undefined` for a destructured one) */
	readonly params: readonly (string | undefined)[];
}

// `(a, b) =>` and `(a: T): R =>`
const ARROW_LIST = /\(([^()]*)\)\s*(?::[^=;{}()]+)?=>\s*/g;
// `a =>`, but not `x.a =>`, part of a longer name, or a return type `): R =>`
const ARROW_BARE = /(?<![\w$.]|\)\s*:\s*)([A-Za-z_$][\w$]*)\s*=>\s*/g;
// `function (a) {`, `async function* name(a): R {`
const FUNCTION = /\bfunction\b\s*\*?\s*[\w$]*\s*\(([^()]*)\)\s*(?::[^{;]*)?\{/g;
// A method shorthand Deno's test options use: `fn(t) {`
const FN_METHOD = /\bfn\s*\(([^()]*)\)\s*\{/g;

/**
 * Every arrow function, `function` and `fn(…) {}` method in `structure`,
 * sorted by where it starts.
 *
 * @param structure The source's structure view
 * @returns The functions found
 */
export function functionBindings(structure: string): FunctionBinding[] {
	const found: FunctionBinding[] = [];
	const add = ({
		start,
		bodyStart,
		params,
	}: {
		start: number;
		bodyStart: number;
		params: string;
	}): void => {
		found.push({
			start,
			bodyStart,
			bodyEnd: bodyEnd({ text: structure, bodyStart }),
			params: paramNames(params),
		});
	};

	for (const match of structure.matchAll(ARROW_LIST)) {
		const bodyStart = match.index + match[0].length;
		add({ start: match.index, bodyStart, params: match[1] ?? "" });
	}
	for (const match of structure.matchAll(ARROW_BARE)) {
		const bodyStart = match.index + match[0].length;
		add({ start: match.index, bodyStart, params: match[1] ?? "" });
	}
	for (const pattern of [FUNCTION, FN_METHOD]) {
		for (const match of structure.matchAll(pattern)) {
			// The body starts at the match's closing `{`
			const bodyStart = match.index + match[0].length - 1;
			add({ start: match.index, bodyStart, params: match[1] ?? "" });
		}
	}
	return found.sort((a, b) => a.start - b.start);
}

/** The plain identifier parameters in a parameter list, in order. */
function paramNames(list: string): (string | undefined)[] {
	if (list.trim() === "") return [];
	return splitTopLevel(list).map((param) => {
		return /^\s*(?:\.\.\.)?\s*([A-Za-z_$][\w$]*)/.exec(param)?.[1];
	});
}

/** Splits on the commas not nested in brackets. */
function splitTopLevel(list: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let from = 0;
	for (let i = 0; i < list.length; i++) {
		const c = list.charAt(i);
		if ("{[<".includes(c)) depth++;
		else if ("}]>".includes(c)) depth--;
		else if (c === "," && depth === 0) {
			parts.push(list.slice(from, i));
			from = i + 1;
		}
	}
	parts.push(list.slice(from));
	return parts;
}

/**
 * Where a body that starts at `bodyStart` ends: past its matching `}` for a
 * block, or, for an expression, at the first `,` or `;` outside brackets or
 * the first bracket that closes one it didn't open.
 */
function bodyEnd({
	text,
	bodyStart,
}: {
	text: string;
	bodyStart: number;
}): number {
	const block = text.charAt(bodyStart) === "{";
	let depth = 0;
	for (let i = bodyStart; i < text.length; i++) {
		const c = text.charAt(i);
		if ("([{".includes(c)) depth++;
		else if (")]}".includes(c)) {
			depth--;
			if (block && depth === 0) return i + 1;
			if (depth < 0) return i;
		} else if (!block && depth === 0 && (c === "," || c === ";")) return i;
	}
	return text.length;
}
