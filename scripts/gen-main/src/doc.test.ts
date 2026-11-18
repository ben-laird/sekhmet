import { assert, assertEquals } from "@std/assert";
import { decodeDocJson, decodeType } from "./doc.ts";

const FILE = "file:///repo/mini/ops.ts";

const ref = (name: string, resolution?: unknown): unknown => ({
	repr: name,
	kind: "typeRef",
	value: {
		typeName: name,
		...(resolution === undefined ? {} : { resolution }),
	},
});

function docJson(declarations: unknown[]): unknown {
	return {
		version: 2,
		nodes: { [FILE]: { symbols: [{ name: "isSome", declarations }] } },
	};
}

Deno.test("decodeDocJson decodes a function signature with its JSDoc", () => {
	// Given: deno doc output for `isSome<T>(self: Option<T>): self is Option<T>`
	const json = docJson([
		{
			location: { filename: FILE, line: 1, col: 0, byteIndex: 10 },
			declarationKind: "export",
			jsDoc: {
				doc: "Checks.",
				tags: [{ kind: "param", name: "self", doc: "The Option" }],
			},
			kind: "function",
			def: {
				params: [
					{
						kind: "identifier",
						name: "self",
						optional: false,
						tsType: {
							repr: "Option",
							kind: "typeRef",
							value: {
								typeName: "Option",
								typeParams: [ref("T", { kind: "typeParam" })],
								resolution: {
									kind: "import",
									specifier: "./core.ts",
									name: "Option",
								},
							},
						},
					},
				],
				returnType: {
					kind: "typePredicate",
					value: {
						param: { type: "identifier", name: "self" },
						type: ref("Option", { kind: "local" }),
					},
				},
				hasBody: true,
				typeParams: [{ name: "T" }],
			},
		},
	]);

	// When: decoding it
	const decoded = decodeDocJson(json);

	// Then: the signature, resolution and docs are all present
	assert(decoded.ok);
	const [symbol] = decoded.value.get(FILE) ?? [];
	const [declaration] = symbol?.declarations ?? [];
	assert(declaration?.kind === "function");
	assertEquals(declaration.location, { filename: FILE, byteIndex: 10 });
	assertEquals(declaration.jsDoc?.tags, [
		{ kind: "param", name: "self", doc: "The Option" },
	]);
	assertEquals(declaration.params[0]?.type, {
		kind: "ref",
		name: "Option",
		args: [
			{ kind: "ref", name: "T", args: [], resolution: { kind: "typeParam" } },
		],
		resolution: { kind: "import", specifier: "./core.ts", name: "Option" },
	});
	assertEquals(declaration.returnType, {
		kind: "predicate",
		asserts: false,
		subject: "self",
		type: {
			kind: "ref",
			name: "Option",
			args: [],
			resolution: { kind: "local" },
		},
	});
	assertEquals(declaration.hasBody, true);
});

Deno.test("decodeDocJson records type aliases as type-only", () => {
	// Given: a type alias declaration
	const json = docJson([{ kind: "typeAlias", def: {} }]);

	// When: decoding it
	const decoded = decodeDocJson(json);

	// Then: it is kept only by kind
	assert(decoded.ok);
	assertEquals(decoded.value.get(FILE)?.[0]?.declarations, [
		{ kind: "other", typeOnly: true },
	]);
});

Deno.test("decodeDocJson records an interface's own property names", () => {
	// Given: an interface declaring two properties
	const json = docJson([
		{
			kind: "interface",
			def: { properties: [{ name: "item" }, { name: "minItems" }] },
		},
	]);

	// When: decoding it
	const decoded = decodeDocJson(json);

	// Then: it is type-only, with its property names
	assert(decoded.ok);
	assertEquals(decoded.value.get(FILE)?.[0]?.declarations, [
		{ kind: "other", typeOnly: true, properties: ["item", "minItems"] },
	]);
});

Deno.test("decodeDocJson rejects an unknown format version", () => {
	// Given: output in a format this decoder doesn't know
	const json = { version: 1, nodes: {} };

	// When: decoding it
	const decoded = decodeDocJson(json);

	// Then: it fails at the version
	assert(!decoded.ok);
	assertEquals(decoded.error.path, "$.version");
});

Deno.test("decodeType rejects type kinds it can't render", () => {
	// Given: a mapped type
	const json = { kind: "mapped", value: {} };

	// When: decoding it
	const decoded = decodeType(json, "$.t");

	// Then: it fails with the path and kind
	assert(!decoded.ok);
	assertEquals(decoded.error, {
		kind: "decode",
		path: "$.t.kind",
		message: "unsupported type kind mapped",
	});
});
