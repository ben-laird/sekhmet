/**
 * Three views of a TypeScript source text, each the same length as the
 * source with every newline kept, so an index in one is an index in all.
 */
export interface SourceViews {
	/** The source with comments blanked: code and string literals remain */
	code: string;
	/** The source with comments and string/template contents blanked */
	structure: string;
	/** Only the comments; everything else blanked */
	comments: string;
}

type Mode =
	| { kind: "code" }
	| { kind: "line-comment" }
	| { kind: "block-comment" }
	| { kind: "string"; quote: '"' | "'" }
	| { kind: "template" };

/**
 * Splits a TypeScript source into {@linkcode SourceViews} with a small lexer
 * that knows comments, strings and template literals (including nested
 * `${…}`). Regex literals are read as code, so a quote inside one can
 * confuse it; package sources here have none that do.
 */
export function sourceViews(text: string): SourceViews {
	const code: string[] = [];
	const structure: string[] = [];
	const comments: string[] = [];
	// Brace depth of each open `${` in the template literals enclosing the cursor
	const templates: number[] = [];
	let mode: Mode = { kind: "code" };

	const emit = (c: string, views: { code: boolean; structure: boolean }) => {
		const blank = c === "\n" ? "\n" : " ";
		code.push(views.code ? c : blank);
		structure.push(views.structure ? c : blank);
		comments.push(mode.kind.endsWith("comment") ? c : blank);
	};

	for (let i = 0; i < text.length; i++) {
		const c = text.charAt(i);
		const next = text.charAt(i + 1);
		switch (mode.kind) {
			case "code": {
				if (c === "/" && next === "/") {
					mode = { kind: "line-comment" };
					emit(c, { code: false, structure: false });
				} else if (c === "/" && next === "*") {
					mode = { kind: "block-comment" };
					emit(c, { code: false, structure: false });
					emit(next, { code: false, structure: false });
					i++;
				} else if (c === '"' || c === "'") {
					mode = { kind: "string", quote: c };
					emit(c, { code: true, structure: true });
				} else if (c === "`") {
					mode = { kind: "template" };
					emit(c, { code: true, structure: true });
				} else {
					const depth = templates.pop();
					if (depth === undefined) {
						// Not inside a template's `${…}`
					} else if (c === "{") {
						templates.push(depth + 1);
					} else if (c === "}" && depth === 0) {
						mode = { kind: "template" };
					} else {
						templates.push(c === "}" ? depth - 1 : depth);
					}
					emit(c, { code: true, structure: true });
				}
				break;
			}
			case "line-comment": {
				if (c === "\n") mode = { kind: "code" };
				emit(c, { code: false, structure: false });
				break;
			}
			case "block-comment": {
				if (c === "*" && next === "/") {
					emit(c, { code: false, structure: false });
					emit(next, { code: false, structure: false });
					mode = { kind: "code" };
					i++;
				} else {
					emit(c, { code: false, structure: false });
				}
				break;
			}
			case "string": {
				if (c === "\\") {
					emit(c, { code: true, structure: false });
					emit(next, { code: true, structure: false });
					i++;
				} else if (c === mode.quote || c === "\n") {
					mode = { kind: "code" };
					emit(c, { code: true, structure: true });
				} else {
					emit(c, { code: true, structure: false });
				}
				break;
			}
			case "template": {
				if (c === "\\") {
					emit(c, { code: true, structure: false });
					emit(next, { code: true, structure: false });
					i++;
				} else if (c === "`") {
					mode = { kind: "code" };
					emit(c, { code: true, structure: true });
				} else if (c === "$" && next === "{") {
					emit(c, { code: true, structure: true });
					emit(next, { code: true, structure: true });
					templates.push(0);
					mode = { kind: "code" };
					i++;
				} else {
					emit(c, { code: true, structure: false });
				}
				break;
			}
		}
	}

	return {
		code: code.join(""),
		structure: structure.join(""),
		comments: comments.join(""),
	};
}

/**
 * The 1-based line number of an index into a text.
 */
export function lineAt({
	text,
	index,
}: {
	text: string;
	index: number;
}): number {
	let line = 1;
	for (let i = 0; i < index && i < text.length; i++) {
		if (text.charCodeAt(i) === 10) line++;
	}
	return line;
}
