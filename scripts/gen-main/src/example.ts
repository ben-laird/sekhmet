/**
 * Rewrites JSDoc examples of a `self`-first function into method-call form:
 * `map(Some(10), f)` becomes `Some(10).map(f)`.
 *
 * @module
 */

const IDENTIFIER_CHAR = /[\w$.]/;
const RECEIVER_HEAD = /^[A-Za-z_$][\w$.]*(?:<[^<>]*>)?/;
const QUOTES = new Set(['"', "'", "`"]);
const PAIRS: ReadonlyMap<string, string> = new Map([
	["(", ")"],
	["[", "]"],
	["{", "}"],
]);

/**
 * Finds where the argument starting at `start` ends: the index of the
 * top-level `,` or `)` after it.
 *
 * @param options.code - The code being scanned
 * @param options.start - The index the argument starts at
 * @returns The index of the delimiter, or -1 when the brackets don't balance
 */
function argumentEnd({ code, start }: { code: string; start: number }): number {
	const stack: string[] = [];

	for (let i = start; i < code.length; i++) {
		const char = code.charAt(i);

		if (QUOTES.has(char)) {
			const close = code.indexOf(char, i + 1);
			if (close < 0) return -1;
			i = close;
			continue;
		}

		const closer = PAIRS.get(char);
		if (closer !== undefined) {
			stack.push(closer);
			continue;
		}

		if (stack.length === 0 && (char === "," || char === ")")) return i;

		if (char === ")" || char === "]" || char === "}") {
			if (stack.pop() !== char) return -1;
		}
	}

	return -1;
}

/**
 * Finds the `)` that closes a call whose arguments start at `start`.
 *
 * @param options.code - The code being scanned
 * @param options.start - The index just after the call's `(`
 * @returns The index of the closing `)`, or -1 when the brackets don't balance
 */
function callEnd({ code, start }: { code: string; start: number }): number {
	let cursor = start;

	while (cursor < code.length) {
		const end = argumentEnd({ code, start: cursor });
		if (end < 0 || code.charAt(end) === ")") return end;
		cursor = end + 1;
	}

	return -1;
}

/**
 * Whether an expression can take a `.method()` suffix without parentheses:
 * an identifier path, optionally followed by type arguments and one call.
 *
 * @param expression - The receiver expression
 * @returns `true` if no parentheses are needed
 */
function isSimpleReceiver(expression: string): boolean {
	const head = RECEIVER_HEAD.exec(expression);
	if (!head) return false;

	const rest = expression.slice(head[0].length);
	if (rest === "") return true;
	if (!rest.startsWith("(")) return false;

	return argumentEnd({ code: rest, start: 1 }) === rest.length - 1;
}

/**
 * Rewrites every call of `name` in `code` from function form to method form,
 * treating the first argument as the receiver. A receiver that isn't a plain
 * identifier or call is parenthesized.
 *
 * @param options.code - The example code
 * @param options.name - The function being turned into a method
 * @returns The rewritten code, or `undefined` when a call can't be parsed
 */
export function toMethodForm({
	code,
	name,
}: {
	code: string;
	name: string;
}): string | undefined {
	const call = `${name}(`;
	let output = "";
	let cursor = 0;

	while (cursor < code.length) {
		const at = code.indexOf(call, cursor);
		if (at < 0) break;

		const before = code.charAt(at - 1);
		if (at > 0 && IDENTIFIER_CHAR.test(before)) {
			output += code.slice(cursor, at + call.length);
			cursor = at + call.length;
			continue;
		}

		const argStart = at + call.length;
		const end = argumentEnd({ code, start: argStart });
		if (end < 0 || callEnd({ code, start: argStart }) < 0) return undefined;

		const receiverText = code.slice(argStart, end).trim();
		if (receiverText === "") return undefined;

		const receiver = toMethodForm({ code: receiverText, name });
		if (receiver === undefined) return undefined;

		const wrapped = isSimpleReceiver(receiver) ? receiver : `(${receiver})`;
		output += `${code.slice(cursor, at)}${wrapped}.${name}(`;

		cursor = code.charAt(end) === "," ? end + 1 : end;
		while (code.charAt(cursor) === " " && code.charAt(end) === ",") cursor++;
	}

	return output + code.slice(cursor);
}
