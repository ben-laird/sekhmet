/**
 * Rewrites mini JSDoc examples for main: a `self`-first function's calls
 * move into method-call form (`map(Some(10), f)` becomes `Some(10).map(f)`),
 * and imports from the mini entrypoint move to the main one.
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
		const isSpread = code.slice(at - 3, at) === "...";
		if (at > 0 && IDENTIFIER_CHAR.test(before) && !isSpread) {
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

/**
 * The expression an object literal gives `field`, when that is its only
 * property (`{ field: expression }` or the shorthand `{ field }`).
 *
 * @param options.text - The object literal's source
 * @param options.field - The property to read
 * @returns The expression, or `undefined` when the literal has another shape
 */
function soleField({
	text,
	field,
}: {
	text: string;
	field: string;
}): string | undefined {
	const literal = text.trim();
	if (!(literal.startsWith("{") && literal.endsWith("}"))) return undefined;

	const body = `${literal.slice(1, -1)})`;
	const end = argumentEnd({ code: body, start: 0 });
	if (end < 0 || body.slice(end + 1, -1).trim() !== "") return undefined;

	const property = body.slice(0, end).trim();
	if (property === field) return field;

	const label = new RegExp(`^${field}\\s*:`).exec(property);

	return label === null ? undefined : property.slice(label[0].length).trim();
}

/**
 * Rewrites every call of `name` whose only argument is an object literal
 * holding just `field` into method form on that field's value:
 * `array({ item: text })` becomes `text.array()`. A call passing other
 * properties stays a function call.
 *
 * @param options.code - The example code
 * @param options.name - The function being turned into a method
 * @param options.field - The options field that holds the receiver
 * @returns The rewritten code, or `undefined` when a call can't be parsed
 */
export function toFieldMethodForm({
	code,
	name,
	field,
}: {
	code: string;
	name: string;
	field: string;
}): string | undefined {
	const call = `${name}(`;
	let output = "";
	let cursor = 0;

	while (cursor < code.length) {
		const at = code.indexOf(call, cursor);
		if (at < 0) break;

		const argStart = at + call.length;
		if (at > 0 && IDENTIFIER_CHAR.test(code.charAt(at - 1))) {
			output += code.slice(cursor, argStart);
			cursor = argStart;
			continue;
		}

		const end = argumentEnd({ code, start: argStart });
		if (end < 0) return undefined;

		const receiverText =
			code.charAt(end) === ")"
				? soleField({ text: code.slice(argStart, end), field })
				: undefined;
		if (receiverText === undefined) {
			output += code.slice(cursor, argStart);
			cursor = argStart;
			continue;
		}

		const receiver = toFieldMethodForm({ code: receiverText, name, field });
		if (receiver === undefined) return undefined;

		const wrapped = isSimpleReceiver(receiver) ? receiver : `(${receiver})`;
		output += `${code.slice(cursor, at)}${wrapped}.${name}()`;
		cursor = end + 1;
	}

	return output + code.slice(cursor);
}

const NAMED_IMPORT =
	/import\s+(type\s+)?\{([^}]*)\}\s*from\s*(["'])([^"']+)\3;?[ \t]*\n?/g;

/** The name an import specifier binds from its module (`a as b` imports `a`). */
function importedName(specifier: string): string {
	const withoutType = specifier.replace(/^type\s+/, "");
	return withoutType.split(/\s+as\s+/)[0]?.trim() ?? withoutType;
}

/**
 * Rewrites the named imports of a JSDoc example from a feature's mini
 * entrypoint (or one of its subpaths) to its main entrypoint. Names that
 * became methods are dropped, since main calls them on the receiver; names
 * main leaves out stay imported from mini. An import left empty is removed.
 *
 * @param options.code - The example code
 * @param options.entrypoint - The main entrypoint (e.g. `@sekhmet/enum/option`)
 * @param options.methods - Mini functions that are methods in main
 * @param options.omitted - Mini exports main does not export
 * @returns The rewritten code
 */
export function toMainImports({
	code,
	entrypoint,
	methods,
	omitted,
}: {
	code: string;
	entrypoint: string;
	methods: ReadonlySet<string>;
	omitted: ReadonlySet<string>;
}): string {
	const mini = `${entrypoint}/mini`;

	const rewritten = code.replace(
		NAMED_IMPORT,
		(
			statement: string,
			typeOnly: string | undefined,
			list: string,
			_quote: string,
			from: string,
		): string => {
			if (from !== mini && !from.startsWith(`${mini}/`)) return statement;

			const kept = list
				.split(",")
				.map((specifier) => specifier.trim())
				.filter(
					(specifier) =>
						specifier !== "" && !methods.has(importedName(specifier)),
				);
			const isOmitted = (specifier: string): boolean =>
				omitted.has(importedName(specifier));
			const head = typeOnly === undefined ? "import" : "import type";
			const render = (names: string[], specifier: string): string =>
				names.length === 0
					? ""
					: `${head} { ${names.join(", ")} } from "${specifier}";\n`;

			return (
				render(
					kept.filter((specifier) => !isOmitted(specifier)),
					entrypoint,
				) + render(kept.filter(isOmitted), from)
			);
		},
	);

	// A removed import can leave the fence opening on a blank line
	return rewritten.replace(/^(```[^\n]*\n)\n+/gm, "$1");
}
