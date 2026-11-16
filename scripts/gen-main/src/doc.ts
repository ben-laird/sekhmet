/**
 * The subset of `deno doc --json` (format version 2) that main-API generation
 * reads, and a decoder from the raw JSON into it.
 *
 * Only the signatures of functions and the headers of classes are decoded in
 * full. Type aliases and interfaces are recorded by name and kind alone, since
 * the generator only re-exports them.
 *
 * @module
 */

import { all, err, ok, type Result } from "./result.ts";

/** Where a type reference's name comes from. */
export type Resolution =
	| { readonly kind: "typeParam" }
	| { readonly kind: "local" }
	| {
			readonly kind: "import";
			readonly specifier: string;
			readonly name: string;
	  }
	| { readonly kind: "global" };

/** A type parameter declaration (`T extends C = D`). */
export interface TypeParam {
	/** The parameter's name. */
	readonly name: string;
	/** The `extends` constraint, if any. */
	readonly constraint: TypeNode | undefined;
	/** The default type, if any. */
	readonly default: TypeNode | undefined;
}

/** A function or method parameter. */
export type Param =
	| {
			readonly kind: "identifier";
			readonly name: string;
			readonly optional: boolean;
			readonly type: TypeNode | undefined;
	  }
	| {
			readonly kind: "rest";
			readonly name: string;
			readonly type: TypeNode | undefined;
	  };

/** A property of an object type literal. */
export interface Property {
	/** The property's key. */
	readonly name: string;
	/** Whether the property is optional (`key?:`). */
	readonly optional: boolean;
	/** Whether the property is `readonly`. */
	readonly readonly: boolean;
	/** The property's type, if annotated. */
	readonly type: TypeNode | undefined;
}

/** A type expression. */
export type TypeNode =
	| { readonly kind: "keyword"; readonly keyword: string }
	| { readonly kind: "literal"; readonly text: string }
	| {
			readonly kind: "ref";
			readonly name: string;
			readonly args: readonly TypeNode[];
			readonly resolution: Resolution;
	  }
	| { readonly kind: "union"; readonly types: readonly TypeNode[] }
	| { readonly kind: "intersection"; readonly types: readonly TypeNode[] }
	| { readonly kind: "array"; readonly element: TypeNode }
	| {
			readonly kind: "tuple";
			readonly elements: readonly TypeNode[];
			/** Element labels, recovered from source since `deno doc` drops them. */
			readonly labels?: readonly (string | undefined)[];
	  }
	| { readonly kind: "rest"; readonly type: TypeNode }
	| { readonly kind: "optional"; readonly type: TypeNode }
	| { readonly kind: "parenthesized"; readonly type: TypeNode }
	| {
			readonly kind: "typeOperator";
			readonly operator: string;
			readonly type: TypeNode;
	  }
	| {
			readonly kind: "indexedAccess";
			readonly object: TypeNode;
			readonly index: TypeNode;
	  }
	| {
			readonly kind: "function";
			readonly constructor: boolean;
			readonly typeParams: readonly TypeParam[];
			readonly params: readonly Param[];
			readonly returnType: TypeNode;
	  }
	| {
			readonly kind: "predicate";
			readonly asserts: boolean;
			readonly subject: string;
			readonly type: TypeNode | undefined;
	  }
	| { readonly kind: "object"; readonly properties: readonly Property[] }
	| { readonly kind: "this" };

/** One JSDoc block tag. */
export type JsDocTag =
	| { readonly kind: "param"; readonly name: string; readonly doc: string }
	| { readonly kind: "template"; readonly name: string; readonly doc: string }
	| { readonly kind: "return"; readonly doc: string }
	| { readonly kind: "example"; readonly doc: string }
	| {
			readonly kind: "throws";
			readonly type: TypeNode | undefined;
			readonly doc: string;
	  }
	| { readonly kind: "see"; readonly doc: string }
	| { readonly kind: "deprecated"; readonly doc: string }
	| { readonly kind: "unsupported"; readonly value: string };

/** A parsed JSDoc comment. */
export interface JsDoc {
	/** The description before the first tag. */
	readonly doc: string;
	/** The block tags, in source order. */
	readonly tags: readonly JsDocTag[];
}

/** Where a declaration starts in its source file. */
export interface Location {
	/** The file's URL. */
	readonly filename: string;
	/** The UTF-8 byte offset of the declaration's first token. */
	readonly byteIndex: number;
}

/** One declaration of an exported function (an overload or the implementation). */
export interface FunctionDeclaration {
	/** Discriminant. */
	readonly kind: "function";
	/** Where it starts. */
	readonly location: Location;
	/** Its JSDoc, if any. */
	readonly jsDoc: JsDoc | undefined;
	/** Its type parameters. */
	readonly typeParams: readonly TypeParam[];
	/** Its parameters. */
	readonly params: readonly Param[];
	/** Its declared return type, if annotated. */
	readonly returnType: TypeNode | undefined;
	/** Whether this declaration has a body (the implementation of an overload set). */
	readonly hasBody: boolean;
}

/** An exported class's header. */
export interface ClassDeclaration {
	/** Discriminant. */
	readonly kind: "class";
	/** Where it starts. */
	readonly location: Location;
	/** Its JSDoc, if any. */
	readonly jsDoc: JsDoc | undefined;
	/** Its type parameters. */
	readonly typeParams: readonly TypeParam[];
}

/** Any other exported declaration, recorded only so it can be re-exported. */
export interface OtherDeclaration {
	/** The `deno doc` kind (`typeAlias`, `interface`, `variable`, …). */
	readonly kind: "other";
	/** Whether the declaration exists only at the type level. */
	readonly typeOnly: boolean;
	/** An interface's own property names (not inherited ones); absent otherwise. */
	readonly properties?: readonly string[];
}

/** One declaration of an exported symbol. */
export type Declaration =
	| FunctionDeclaration
	| ClassDeclaration
	| OtherDeclaration;

/** An exported symbol and its declarations. */
export interface DocSymbol {
	/** The exported name. */
	readonly name: string;
	/** Every declaration (overloads included). */
	readonly declarations: readonly Declaration[];
}

/** The exported symbols of every documented module, keyed by module URL. */
export type DocModules = ReadonlyMap<string, readonly DocSymbol[]>;

/** Why the `deno doc` output could not be decoded. */
export interface DecodeError {
	/** Discriminant. */
	readonly kind: "decode";
	/** The JSON path of the offending value. */
	readonly path: string;
	/** What was expected there. */
	readonly message: string;
}

/** A decoded value, or why decoding failed. */
export type Decoded<T> = Result<T, DecodeError>;

function fail(path: string, message: string): Decoded<never> {
	return err({ kind: "decode", path, message });
}

function isObject(value: unknown): value is object {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function field(value: object, key: string): unknown {
	return Reflect.get(value, key);
}

function object(value: unknown, path: string): Decoded<object> {
	return isObject(value) ? ok(value) : fail(path, "expected an object");
}

function array(value: unknown, path: string): Decoded<readonly unknown[]> {
	return Array.isArray(value) ? ok(value) : fail(path, "expected an array");
}

function string(value: unknown, path: string): Decoded<string> {
	return typeof value === "string"
		? ok(value)
		: fail(path, "expected a string");
}

function optionalString(value: unknown, path: string): Decoded<string> {
	return value === undefined ? ok("") : string(value, path);
}

function flag(value: unknown, path: string): Decoded<boolean> {
	if (value === undefined) return ok(false);
	return typeof value === "boolean"
		? ok(value)
		: fail(path, "expected a boolean");
}

function list<T>(
	value: unknown,
	path: string,
	decode: (item: unknown, path: string) => Decoded<T>,
): Decoded<T[]> {
	if (value === undefined) return ok([]);
	const items = array(value, path);
	if (!items.ok) return items;

	return all(items.value.map((item, i) => decode(item, `${path}[${i}]`)));
}

function optionalType(
	value: unknown,
	path: string,
): Decoded<TypeNode | undefined> {
	return value === undefined ? ok(undefined) : decodeType(value, path);
}

function decodeResolution(value: unknown, path: string): Decoded<Resolution> {
	if (value === undefined) return ok({ kind: "global" });
	const res = object(value, path);
	if (!res.ok) return res;

	const kind = field(res.value, "kind");
	if (kind === "typeParam") return ok({ kind: "typeParam" });
	if (kind === "local") return ok({ kind: "local" });
	if (kind === "import") {
		const specifier = string(
			field(res.value, "specifier"),
			`${path}.specifier`,
		);
		if (!specifier.ok) return specifier;
		const name = string(field(res.value, "name"), `${path}.name`);
		if (!name.ok) return name;

		return ok({ kind: "import", specifier: specifier.value, name: name.value });
	}

	return fail(`${path}.kind`, `unknown resolution kind ${String(kind)}`);
}

/**
 * Decodes a type parameter declaration.
 *
 * @param value - The raw JSON
 * @param path - The JSON path, for error messages
 * @returns The type parameter, or why it could not be decoded
 */
export function decodeTypeParam(
	value: unknown,
	path: string,
): Decoded<TypeParam> {
	const tp = object(value, path);
	if (!tp.ok) return tp;

	const name = string(field(tp.value, "name"), `${path}.name`);
	if (!name.ok) return name;
	const constraint = optionalType(
		field(tp.value, "constraint"),
		`${path}.constraint`,
	);
	if (!constraint.ok) return constraint;
	const defaultType = optionalType(
		field(tp.value, "default"),
		`${path}.default`,
	);
	if (!defaultType.ok) return defaultType;

	return ok({
		name: name.value,
		constraint: constraint.value,
		default: defaultType.value,
	});
}

/**
 * Decodes a parameter. Destructuring and default-valued parameters are
 * rejected, since a generated method could not forward them by name.
 *
 * @param value - The raw JSON
 * @param path - The JSON path, for error messages
 * @returns The parameter, or why it could not be decoded
 */
export function decodeParam(value: unknown, path: string): Decoded<Param> {
	const param = object(value, path);
	if (!param.ok) return param;

	const type = optionalType(field(param.value, "tsType"), `${path}.tsType`);
	if (!type.ok) return type;

	const kind = field(param.value, "kind");
	if (kind === "identifier") {
		const name = string(field(param.value, "name"), `${path}.name`);
		if (!name.ok) return name;
		const optional = flag(field(param.value, "optional"), `${path}.optional`);
		if (!optional.ok) return optional;

		return ok({
			kind: "identifier",
			name: name.value,
			optional: optional.value,
			type: type.value,
		});
	}
	if (kind === "rest") {
		const arg = object(field(param.value, "arg"), `${path}.arg`);
		if (!arg.ok) return arg;
		if (field(arg.value, "kind") !== "identifier") {
			return fail(`${path}.arg`, "expected an identifier rest parameter");
		}
		const name = string(field(arg.value, "name"), `${path}.arg.name`);
		if (!name.ok) return name;

		return ok({ kind: "rest", name: name.value, type: type.value });
	}

	return fail(`${path}.kind`, `unsupported parameter kind ${String(kind)}`);
}

function decodeProperty(value: unknown, path: string): Decoded<Property> {
	const prop = object(value, path);
	if (!prop.ok) return prop;

	const name = string(field(prop.value, "name"), `${path}.name`);
	if (!name.ok) return name;
	if (field(prop.value, "computed") === true) {
		return fail(path, "computed property keys are not supported");
	}
	const optional = flag(field(prop.value, "optional"), `${path}.optional`);
	if (!optional.ok) return optional;
	const readonly = flag(field(prop.value, "readonly"), `${path}.readonly`);
	if (!readonly.ok) return readonly;
	const type = optionalType(field(prop.value, "tsType"), `${path}.tsType`);
	if (!type.ok) return type;

	return ok({
		name: name.value,
		optional: optional.value,
		readonly: readonly.value,
		type: type.value,
	});
}

function decodeLiteral(value: unknown, path: string): Decoded<TypeNode> {
	const lit = object(value, path);
	if (!lit.ok) return lit;

	const kind = field(lit.value, "kind");
	const text = (() => {
		switch (kind) {
			case "number":
			case "boolean":
				return String(field(lit.value, kind));
			case "string":
				return JSON.stringify(field(lit.value, "string"));
			case "bigInt":
				return `${String(field(lit.value, "string"))}n`;
			default:
				return undefined;
		}
	})();

	if (text === undefined) {
		return fail(`${path}.kind`, `unsupported literal kind ${String(kind)}`);
	}

	return ok({ kind: "literal", text });
}

function decodeFunctionType(value: unknown, path: string): Decoded<TypeNode> {
	const fn = object(value, path);
	if (!fn.ok) return fn;

	const isConstructor = flag(
		field(fn.value, "constructor"),
		`${path}.constructor`,
	);
	if (!isConstructor.ok) return isConstructor;
	const typeParams = list(
		field(fn.value, "typeParams"),
		`${path}.typeParams`,
		decodeTypeParam,
	);
	if (!typeParams.ok) return typeParams;
	const params = list(field(fn.value, "params"), `${path}.params`, decodeParam);
	if (!params.ok) return params;
	const returnType = decodeType(field(fn.value, "tsType"), `${path}.tsType`);
	if (!returnType.ok) return returnType;

	return ok({
		kind: "function",
		constructor: isConstructor.value,
		typeParams: typeParams.value,
		params: params.value,
		returnType: returnType.value,
	});
}

function decodePredicate(value: unknown, path: string): Decoded<TypeNode> {
	const pred = object(value, path);
	if (!pred.ok) return pred;

	const asserts = flag(field(pred.value, "asserts"), `${path}.asserts`);
	if (!asserts.ok) return asserts;
	const param = object(field(pred.value, "param"), `${path}.param`);
	if (!param.ok) return param;
	const subject =
		field(param.value, "type") === "this"
			? ok("this")
			: string(field(param.value, "name"), `${path}.param.name`);
	if (!subject.ok) return subject;
	const type = optionalType(field(pred.value, "type"), `${path}.type`);
	if (!type.ok) return type;

	return ok({
		kind: "predicate",
		asserts: asserts.value,
		subject: subject.value,
		type: type.value,
	});
}

function decodeObjectType(value: unknown, path: string): Decoded<TypeNode> {
	const lit = object(value, path);
	if (!lit.ok) return lit;

	for (const key of ["methods", "callSignatures", "indexSignatures"]) {
		const members = field(lit.value, key);
		if (Array.isArray(members) && members.length > 0) {
			return fail(`${path}.${key}`, "only property members are supported");
		}
	}

	const properties = list(
		field(lit.value, "properties"),
		`${path}.properties`,
		decodeProperty,
	);
	if (!properties.ok) return properties;

	return ok({ kind: "object", properties: properties.value });
}

function decodeRef(value: unknown, path: string): Decoded<TypeNode> {
	const ref = object(value, path);
	if (!ref.ok) return ref;

	const name = string(field(ref.value, "typeName"), `${path}.typeName`);
	if (!name.ok) return name;
	const args = list(
		field(ref.value, "typeParams"),
		`${path}.typeParams`,
		decodeType,
	);
	if (!args.ok) return args;
	const resolution = decodeResolution(
		field(ref.value, "resolution"),
		`${path}.resolution`,
	);
	if (!resolution.ok) return resolution;

	return ok({
		kind: "ref",
		name: name.value,
		args: args.value,
		resolution: resolution.value,
	});
}

function wrapped<K extends "array" | "rest" | "optional" | "parenthesized">(
	kind: K,
	inner: Decoded<TypeNode>,
): Decoded<TypeNode> {
	if (!inner.ok) return inner;

	switch (kind) {
		case "array":
			return ok({ kind: "array", element: inner.value });
		case "rest":
			return ok({ kind: "rest", type: inner.value });
		case "optional":
			return ok({ kind: "optional", type: inner.value });
		default:
			return ok({ kind: "parenthesized", type: inner.value });
	}
}

/**
 * Decodes a type expression. Type kinds that never appear in a function
 * signature the generator supports (conditional, mapped, infer, …) are
 * rejected with their path, so an unsupported signature fails loudly.
 *
 * @param value - The raw JSON
 * @param path - The JSON path, for error messages
 * @returns The type, or why it could not be decoded
 */
export function decodeType(value: unknown, path: string): Decoded<TypeNode> {
	const type = object(value, path);
	if (!type.ok) return type;

	const kind = field(type.value, "kind");
	const inner = field(type.value, "value");
	const at = `${path}.value`;

	switch (kind) {
		case "keyword": {
			const keyword = string(inner, at);
			if (!keyword.ok) return keyword;
			return ok({ kind: "keyword", keyword: keyword.value });
		}
		case "literal":
			return decodeLiteral(inner, at);
		case "typeRef":
			return decodeRef(inner, at);
		case "union":
		case "intersection": {
			const types = list(inner, at, decodeType);
			if (!types.ok) return types;
			return ok({ kind, types: types.value });
		}
		case "tuple": {
			const elements = list(inner, at, decodeType);
			if (!elements.ok) return elements;
			return ok({ kind: "tuple", elements: elements.value });
		}
		case "array":
		case "rest":
		case "optional":
		case "parenthesized":
			return wrapped(kind, decodeType(inner, at));
		case "typeOperator": {
			const op = object(inner, at);
			if (!op.ok) return op;
			const operator = string(field(op.value, "operator"), `${at}.operator`);
			if (!operator.ok) return operator;
			const operand = decodeType(field(op.value, "tsType"), `${at}.tsType`);
			if (!operand.ok) return operand;
			return ok({
				kind: "typeOperator",
				operator: operator.value,
				type: operand.value,
			});
		}
		case "indexedAccess": {
			const access = object(inner, at);
			if (!access.ok) return access;
			const objType = decodeType(
				field(access.value, "objType"),
				`${at}.objType`,
			);
			if (!objType.ok) return objType;
			const indexType = decodeType(
				field(access.value, "indexType"),
				`${at}.indexType`,
			);
			if (!indexType.ok) return indexType;
			return ok({
				kind: "indexedAccess",
				object: objType.value,
				index: indexType.value,
			});
		}
		case "fnOrConstructor":
			return decodeFunctionType(inner, at);
		case "typePredicate":
			return decodePredicate(inner, at);
		case "typeLiteral":
			return decodeObjectType(inner, at);
		case "this":
			return ok({ kind: "this" });
		default:
			return fail(`${path}.kind`, `unsupported type kind ${String(kind)}`);
	}
}

function decodeTag(value: unknown, path: string): Decoded<JsDocTag> {
	const tag = object(value, path);
	if (!tag.ok) return tag;

	const kind = field(tag.value, "kind");
	const doc = optionalString(field(tag.value, "doc"), `${path}.doc`);
	if (!doc.ok) return doc;

	switch (kind) {
		case "param":
		case "template": {
			const name = string(field(tag.value, "name"), `${path}.name`);
			if (!name.ok) return name;
			return ok({ kind, name: name.value, doc: doc.value });
		}
		case "return":
		case "example":
		case "see":
		case "deprecated":
			return ok({ kind, doc: doc.value });
		case "throws": {
			const type = optionalType(field(tag.value, "tsType"), `${path}.tsType`);
			if (!type.ok) return type;
			return ok({ kind, type: type.value, doc: doc.value });
		}
		case "unsupported": {
			const raw = string(field(tag.value, "value"), `${path}.value`);
			if (!raw.ok) return raw;
			return ok({ kind, value: raw.value });
		}
		default:
			return fail(`${path}.kind`, `unsupported JSDoc tag ${String(kind)}`);
	}
}

function decodeJsDoc(value: unknown, path: string): Decoded<JsDoc | undefined> {
	if (value === undefined) return ok(undefined);
	const jsDoc = object(value, path);
	if (!jsDoc.ok) return jsDoc;

	const doc = optionalString(field(jsDoc.value, "doc"), `${path}.doc`);
	if (!doc.ok) return doc;
	const tags = list(field(jsDoc.value, "tags"), `${path}.tags`, decodeTag);
	if (!tags.ok) return tags;

	return ok({ doc: doc.value, tags: tags.value });
}

function decodeLocation(value: unknown, path: string): Decoded<Location> {
	const loc = object(value, path);
	if (!loc.ok) return loc;

	const filename = string(field(loc.value, "filename"), `${path}.filename`);
	if (!filename.ok) return filename;
	const byteIndex = field(loc.value, "byteIndex");
	if (typeof byteIndex !== "number") {
		return fail(`${path}.byteIndex`, "expected a number");
	}

	return ok({ filename: filename.value, byteIndex });
}

const TYPE_ONLY_KINDS: ReadonlySet<unknown> = new Set([
	"typeAlias",
	"interface",
]);

function propertyName(value: unknown, path: string): Decoded<string> {
	const property = object(value, path);
	if (!property.ok) return property;

	return string(field(property.value, "name"), `${path}.name`);
}

/** An interface, kept by its own property names (to check borrowed fields). */
function decodeInterface(decl: object, path: string): Decoded<Declaration> {
	const def = object(field(decl, "def"), `${path}.def`);
	if (!def.ok) return def;
	const properties = list(
		field(def.value, "properties"),
		`${path}.def.properties`,
		propertyName,
	);
	if (!properties.ok) return properties;

	return ok({ kind: "other", typeOnly: true, properties: properties.value });
}

function decodeDeclaration(value: unknown, path: string): Decoded<Declaration> {
	const decl = object(value, path);
	if (!decl.ok) return decl;

	const kind = field(decl.value, "kind");
	if (kind === "interface") return decodeInterface(decl.value, path);
	if (kind !== "function" && kind !== "class") {
		return ok({ kind: "other", typeOnly: TYPE_ONLY_KINDS.has(kind) });
	}

	const location = decodeLocation(
		field(decl.value, "location"),
		`${path}.location`,
	);
	if (!location.ok) return location;
	const jsDoc = decodeJsDoc(field(decl.value, "jsDoc"), `${path}.jsDoc`);
	if (!jsDoc.ok) return jsDoc;
	const def = object(field(decl.value, "def"), `${path}.def`);
	if (!def.ok) return def;
	const typeParams = list(
		field(def.value, "typeParams"),
		`${path}.def.typeParams`,
		decodeTypeParam,
	);
	if (!typeParams.ok) return typeParams;

	if (kind === "class") {
		return ok({
			kind,
			location: location.value,
			jsDoc: jsDoc.value,
			typeParams: typeParams.value,
		});
	}

	const params = list(
		field(def.value, "params"),
		`${path}.def.params`,
		decodeParam,
	);
	if (!params.ok) return params;
	const returnType = optionalType(
		field(def.value, "returnType"),
		`${path}.def.returnType`,
	);
	if (!returnType.ok) return returnType;
	const hasBody = flag(field(def.value, "hasBody"), `${path}.def.hasBody`);
	if (!hasBody.ok) return hasBody;

	return ok({
		kind,
		location: location.value,
		jsDoc: jsDoc.value,
		typeParams: typeParams.value,
		params: params.value,
		returnType: returnType.value,
		hasBody: hasBody.value,
	});
}

function decodeSymbol(value: unknown, path: string): Decoded<DocSymbol> {
	const sym = object(value, path);
	if (!sym.ok) return sym;

	const name = string(field(sym.value, "name"), `${path}.name`);
	if (!name.ok) return name;
	const declarations = list(
		field(sym.value, "declarations"),
		`${path}.declarations`,
		decodeDeclaration,
	);
	if (!declarations.ok) return declarations;

	return ok({ name: name.value, declarations: declarations.value });
}

/**
 * Decodes the full output of `deno doc --json` for one or more modules.
 *
 * @param json - The parsed JSON output
 * @returns Each module's exported symbols, or why the output could not be decoded
 */
export function decodeDocJson(json: unknown): Decoded<DocModules> {
	const root = object(json, "$");
	if (!root.ok) return root;

	if (field(root.value, "version") !== 2) {
		return fail("$.version", "expected deno doc JSON format version 2");
	}

	const nodes = object(field(root.value, "nodes"), "$.nodes");
	if (!nodes.ok) return nodes;

	const modules = new Map<string, readonly DocSymbol[]>();
	for (const [url, node] of Object.entries(nodes.value)) {
		const path = `$.nodes[${JSON.stringify(url)}]`;
		const mod = object(node, path);
		if (!mod.ok) return mod;
		const symbols = list(
			field(mod.value, "symbols"),
			`${path}.symbols`,
			decodeSymbol,
		);
		if (!symbols.ok) return symbols;
		modules.set(url, symbols.value);
	}

	return ok(modules);
}
