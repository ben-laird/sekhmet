/**
 * The guard that keeps main modules' import cycles safe.
 *
 * Main modules that convert to each other's classes import each other
 * (option/main ↔ result/main). An ES module cycle is safe as long as no
 * module uses an imported binding while it evaluates, since the other module
 * may not have run yet. So a generated module may use a wrap target only
 * inside function and method bodies, never at module scope.
 *
 * @module
 */

const QUOTES = new Set(['"', "'", "`"]);

/** Removes comments and string contents, keeping line structure. */
function stripCommentsAndStrings(source: string): string {
	let output = "";

	for (let i = 0; i < source.length; i++) {
		const char = source.charAt(i);
		const next = source.charAt(i + 1);

		if (char === "/" && next === "/") {
			const end = source.indexOf("\n", i);
			i = end < 0 ? source.length : end - 1;
			continue;
		}
		if (char === "/" && next === "*") {
			const end = source.indexOf("*/", i + 2);
			i = end < 0 ? source.length : end + 1;
			continue;
		}
		if (QUOTES.has(char)) {
			let end = i + 1;
			while (end < source.length && source.charAt(end) !== char) {
				if (source.charAt(end) === "\\") end++;
				end++;
			}
			output += `${char}${char}`;
			i = end;
			continue;
		}

		output += char;
	}

	return output;
}

/** The code outside every `{ … }` block, without import declarations. */
function moduleScope(source: string): string {
	let depth = 0;
	let scope = "";

	for (const char of stripCommentsAndStrings(source)) {
		if (char === "{") depth++;
		if (depth === 0) scope += char;
		if (char === "}") depth--;
	}

	return scope
		.split("\n")
		.filter((line) => !/^\s*import\b/.test(line))
		.join("\n");
}

/**
 * Finds uses of the named bindings as values at module scope: member access
 * or calls (`X.f(`, `X(`), construction (`new X`) and inheritance
 * (`extends X`). Type positions (`): X<T>`) are not uses.
 *
 * @param options.source - The generated module source
 * @param options.names - The wrap targets imported from other main modules
 * @returns Each offending use, in source order
 */
export function moduleScopeValueUses({
	source,
	names,
}: {
	source: string;
	names: readonly string[];
}): string[] {
	const scope = moduleScope(source);
	const uses: { at: number; text: string }[] = [];

	for (const name of names) {
		const patterns = [
			new RegExp(`(?<![.\\w$])${name}\\s*\\.\\s*[\\w$]+\\s*\\(`, "g"),
			new RegExp(`(?<![.\\w$])(?<!\\bnew\\s+)${name}\\s*\\(`, "g"),
			new RegExp(`\\bnew\\s+${name}\\b`, "g"),
			new RegExp(`\\bextends\\s+${name}\\b`, "g"),
		];
		for (const pattern of patterns) {
			for (const match of scope.matchAll(pattern)) {
				uses.push({ at: match.index, text: match[0] });
			}
		}
	}

	return uses.sort((a, b) => a.at - b.at).map((use) => use.text);
}
