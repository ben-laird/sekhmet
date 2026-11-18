/**
 * Exercises `@sekhmet/schema`: every export path, the root and each main
 * entrypoint chaining methods, each mini barrel, and each single-module
 * path. Primitives, composites and the algebra parse good and bad values;
 * a schema reads back its node and annotations; Standard Schema round-trips
 * both ways, synchronously and asynchronously. Every async parse resolves to
 * a Result, so the exercise never leaves a promise rejection behind.
 *
 * @module
 */

import { match } from "@sekhmet/enum/core/mini/exit";
import { isolate } from "@sekhmet/enum/core/mini/isolate";
import { unwrapOr } from "@sekhmet/enum/option/mini";
import { Err, Ok } from "@sekhmet/enum/result";
import {
	isErr,
	isOk,
	type Result,
	unwrap,
	unwrapErr,
} from "@sekhmet/enum/result/mini";
import { object as rootObject, string as rootString } from "@sekhmet/schema";
import { type Branded, partial as mainPartial } from "@sekhmet/schema/algebra";
import { or, pick, readonly } from "@sekhmet/schema/algebra/mini";
import { brand } from "@sekhmet/schema/algebra/mini/brand";
import { or as miniOr } from "@sekhmet/schema/algebra/mini/or";
import { readonly as miniReadonly } from "@sekhmet/schema/algebra/mini/readonly";
import { omit, required } from "@sekhmet/schema/algebra/mini/shape";
import { array, object, union } from "@sekhmet/schema/composites";
import {
	array as miniArray,
	object as miniObject,
} from "@sekhmet/schema/composites/mini";
import { array as arrayOf } from "@sekhmet/schema/composites/mini/array";
import { discriminatedUnion } from "@sekhmet/schema/composites/mini/discriminated-union";
import { enumOf } from "@sekhmet/schema/composites/mini/enum-of";
import {
	lazy,
	nullable,
	optional,
} from "@sekhmet/schema/composites/mini/modifiers";
import {
	object as objectOf,
	type Shape,
} from "@sekhmet/schema/composites/mini/object";
import { record } from "@sekhmet/schema/composites/mini/record";
import { tuple } from "@sekhmet/schema/composites/mini/tuple";
import { union as unionOf } from "@sekhmet/schema/composites/mini/union";
import { description, is, nodeOf, Schema, title } from "@sekhmet/schema/core";
import {
	formatIssue,
	map,
	type ParseSyncError,
	parseSync,
} from "@sekhmet/schema/core/mini";
import {
	annotate,
	annotation,
	annotationKey,
} from "@sekhmet/schema/core/mini/annotation";
import { is as guard } from "@sekhmet/schema/core/mini/guard";
import { isSchemaIssue } from "@sekhmet/schema/core/mini/issue";
import { entries, isIssues } from "@sekhmet/schema/core/mini/issues";
import { children, custom, nodeKind } from "@sekhmet/schema/core/mini/node";
import { Async, from, Sync } from "@sekhmet/schema/core/mini/potential";
import {
	Schema as MiniSchema,
	parse as miniParse,
	parseAsync,
} from "@sekhmet/schema/core/mini/schema";
import { viewed } from "@sekhmet/schema/core/mini/view";
import { number, string } from "@sekhmet/schema/primitives";
import { boolean as miniBoolean } from "@sekhmet/schema/primitives/mini";
import { bigint } from "@sekhmet/schema/primitives/mini/bigint";
import { boolean } from "@sekhmet/schema/primitives/mini/boolean";
import type { CoerceMode } from "@sekhmet/schema/primitives/mini/coerce";
import { date } from "@sekhmet/schema/primitives/mini/date";
import { literal } from "@sekhmet/schema/primitives/mini/literal";
import { never } from "@sekhmet/schema/primitives/mini/never";
import { null_ } from "@sekhmet/schema/primitives/mini/null";
import { number as miniNumber } from "@sekhmet/schema/primitives/mini/number";
import { string as miniString } from "@sekhmet/schema/primitives/mini/string";
import { stringbool } from "@sekhmet/schema/primitives/mini/stringbool";
import { symbol } from "@sekhmet/schema/primitives/mini/symbol";
import { undefined_ } from "@sekhmet/schema/primitives/mini/undefined";
import { unknown } from "@sekhmet/schema/primitives/mini/unknown";
import { fromStandard, toStandard } from "@sekhmet/schema/standard";
import { toStandard as miniToStandard } from "@sekhmet/schema/standard/mini";
import { fromStandard as miniFromStandard } from "@sekhmet/schema/standard/mini/from-standard";
import type { StandardSchemaV1 } from "@sekhmet/schema/standard/mini/spec";
import { toStandard as toStandardOf } from "@sekhmet/schema/standard/mini/to-standard";
import { expectEqual } from "../check.ts";

/** The error a synchronous parse failed with; throws on an async parse. */
function rejection<E>(result: Result<unknown, ParseSyncError<E>>): E {
	return match(unwrapErr(result))<E>({
		UnexpectedAsyncParse: () => {
			throw new Error("expected a synchronous parse");
		},
		ParseError: (error) => error,
	});
}

function exercisePrimitives(): void {
	const coerce: CoerceMode = true;
	const accepted = [
		parseSync(miniString({ trim: true, minLength: 2 }), " Ada "),
		parseSync(miniNumber({ coerce, int: true }), "42"),
		parseSync(boolean(), true),
		parseSync(miniBoolean(), false),
		parseSync(stringbool(), "yes"),
		parseSync(literal("on"), "on"),
		parseSync(null_(), null),
		parseSync(undefined_(), undefined),
		parseSync(unknown(), 7),
	];
	expectEqual({
		label: "the primitives accept good values",
		actual: accepted.map((result) => unwrap(result)),
		expected: ["Ada", 42, true, false, true, "on", null, undefined, 7],
	});

	const sym = Symbol("s");
	const day = new Date(0);
	expectEqual({
		label: "bigint, symbol and date accept their own kind",
		actual: [
			unwrap(parseSync(bigint({ multipleOf: 2n }), 4n)) === 4n,
			unwrap(parseSync(symbol(), sym)) === sym,
			unwrap(parseSync(date(), day)).getTime(),
		],
		expected: [true, true, 0],
	});

	const rejected = [
		rejection(parseSync(miniString(), 1)),
		rejection(parseSync(miniNumber({ min: 0 }), -1)),
		rejection(parseSync(never(), "anything")),
	];
	expectEqual({
		label: "the primitives reject bad values with a SchemaIssue",
		actual: rejected.map(isSchemaIssue),
		expected: [true, true, true],
	});
	expectEqual({
		label: "formatIssue renders a SchemaIssue",
		actual: typeof formatIssue(rejection(parseSync(miniString(), 1))),
		expected: "string",
	});
}

function exerciseComposites(): void {
	const user = objectOf({
		shape: { name: miniString(), age: optional(miniNumber()) },
		unknownKeys: "strict",
	});
	expectEqual({
		label: "a mini object parses and strips nothing it declares",
		actual: unwrap(parseSync(user, { name: "Ada", age: undefined })),
		expected: { name: "Ada", age: undefined },
	});
	const failed = rejection(parseSync(user, { name: 1, extra: true }));
	expectEqual({
		label:
			"a mini object reports every failure with its path, a missing key too",
		actual: [isIssues(failed), entries(failed).map(({ path }) => path)],
		expected: [true, [["name"], ["age"], ["extra"]]],
	});

	const shape = discriminatedUnion({
		key: "kind",
		options: {
			circle: miniObject({ shape: { radius: miniNumber() } }),
			square: miniObject({ shape: { side: miniNumber() } }),
		},
	});
	const tree = lazy(() => miniArray({ item: miniString() }));
	expectEqual({
		label: "the other mini composites parse",
		actual: [
			unwrap(parseSync(shape, { kind: "square", side: 2 })).kind,
			unwrap(parseSync(arrayOf({ item: nullable(miniNumber()) }), [1, null])),
			unwrap(parseSync(tuple([miniString(), miniNumber()]), ["a", 1])),
			unwrap(
				parseSync(record({ key: miniString(), value: miniNumber() }), { a: 1 }),
			),
			unwrap(parseSync(unionOf([miniString(), miniNumber()]), 3)),
			unwrap(parseSync(enumOf(["red", "green"]), "green")),
			unwrap(parseSync(tree, ["x"])),
		],
		expected: ["square", [1, null], ["a", 1], { a: 1 }, 3, "green", ["x"]],
	});
}

function exerciseAlgebra(): void {
	const account = {
		name: miniString(),
		password: miniString(),
		nickname: { schema: miniString(), key: "optional" },
	} satisfies Shape;
	const visible = miniObject({
		shape: omit({ shape: account, keys: ["password"] }),
	});
	const named = miniObject({ shape: pick({ shape: account, keys: ["name"] }) });
	const strict = miniObject({ shape: required(account) });
	const either = or({ left: miniString(), right: miniNumber() });
	const either2 = miniOr({ left: miniNumber(), right: miniString() });
	const frozen = readonly(miniArray({ item: miniString() }));
	const frozen2 = miniReadonly(miniObject({ shape: { a: miniNumber() } }));
	const id = brand(miniString(), "Id");

	expectEqual({
		label: "the mini algebra reshapes, combines and freezes",
		actual: [
			unwrap(parseSync(visible, { name: "Ada", password: "x" })),
			unwrap(parseSync(named, { name: "Ada", password: "x" })),
			isErr(parseSync(strict, { name: "Ada", password: "x" })),
			unwrap(parseSync(either, 1)),
			unwrap(parseSync(either2, "b")),
			Object.isFrozen(unwrap(parseSync(frozen, ["a"]))),
			Object.isFrozen(unwrap(parseSync(frozen2, { a: 1 }))),
			unwrap(parseSync(id, "u1")),
		],
		expected: [
			{ name: "Ada" },
			{ name: "Ada" },
			true,
			1,
			"b",
			true,
			true,
			"u1",
		],
	});
}

function exerciseDescriptions(): void {
	const label = annotationKey<string>({ name: "label" });
	const labelled = annotate(miniString(), [label("Name")]);
	const point = kindedPoint();

	expectEqual({
		label: "a schema carries its node and annotations as data",
		actual: [
			unwrapOr(annotation({ schema: labelled, key: label }), "?"),
			unwrapOr(annotation({ schema: miniString(), key: label }), "?"),
			isolate(nodeOf(miniString({ minLength: 1 })), "Leaf"),
			children(nodeOf(miniArray({ item: miniString() }))).length,
			isolate(nodeOf(point), "Custom"),
			point.x === point.y,
		],
		expected: ["Name", "?", true, 1, true, false],
	});

	const isText = guard(miniString());
	const isNumber = is(number());
	expectEqual({
		label: "a schema is a type guard",
		actual: [isText("a"), isText(1), [1, "b", 2].filter(isNumber)],
		expected: [true, false, [1, 2]],
	});
}

function kindedPoint(): MiniSchema<unknown, unknown, unknown> & {
	readonly x: MiniSchema<unknown, number, unknown>;
	readonly y: MiniSchema<unknown, number, unknown>;
} {
	const kind = nodeKind<{ readonly dims: number }>({ name: "Point" });
	const x = miniNumber();
	const y = miniNumber();

	return viewed({
		init: {
			parse: (input: unknown) => Ok(input),
			node: custom({ kind, data: { dims: 2 }, children: [x, y] }),
		},
		view: { x, y },
	});
}

function exerciseMain(): void {
	const port = rootString()
		.preprocess((input: string) => input.trim())
		.andThen((text) => {
			const parsed = Number(text);
			if (Number.isInteger(parsed) && parsed > 0) {
				return Ok<number, string>(parsed);
			}

			return Err<number, string>("not a port");
		})
		.orElse(() => Ok(8080));
	// {}
	type UserId = Branded<string, "UserId">;
	const userId = string().with.or(number()).map(String).with.brand("UserId");
	const ids = userId.array().with.readonly();
	const parsedIds: readonly UserId[] = unwrap(ids.parseSync(["u1", 2]));
	const user = rootObject({
		shape: {
			name: string({ minLength: 1 }).annotate([
				title("Name"),
				description("Who you are"),
			]),
			tags: array({ item: string() }),
		},
	});
	const patch = object({ shape: mainPartial(user.shape) });

	expectEqual({
		label: "the main API chains methods and keeps typed views",
		actual: [
			unwrap(port.parseSync(" 3000 ")),
			unwrap(port.parseSync("http")),
			parsedIds,
			Object.isFrozen(parsedIds),
			unwrap(user.shape.name.parseSync("Ada")),
			unwrap(patch.parseSync({})),
			isOk(union([string(), number()]).parseSync(1)),
			user instanceof Schema,
			string().map((text) => text.length) instanceof Schema,
		],
		expected: [3000, 8080, ["u1", "2"], true, "Ada", {}, true, true, true],
	});
}

async function exerciseAsync(): Promise<void> {
	const later = new MiniSchema({
		parse: (input: unknown) => {
			return Promise.resolve(
				typeof input === "string" ? Ok(input) : Err("not text"),
			);
		},
	});
	const pair = miniObject({ shape: { a: later, b: miniNumber() } });
	const doubled = map(miniNumber(), (n) => n * 2);
	const potentials = [
		isolate(miniParse(doubled, 2), "Sync"),
		isolate(miniParse(later, "a"), "Async"),
		isolate(Sync(1), "Sync"),
		isolate(Async(Promise.resolve(1)), "Async"),
		isolate(from(1), "Sync"),
	];
	expectEqual({
		label: "a parse is Sync when it finished and Async when it awaits",
		actual: potentials,
		expected: [true, true, true, true, true],
	});
	expectEqual({
		label: "parseSync reports an async parse instead of awaiting it",
		actual: isErr(parseSync(later, "a")),
		expected: true,
	});

	const good = await parseAsync(pair, { a: "x", b: 1 });
	const bad = await parseAsync(pair, { a: 1, b: 1 });
	const mainLater = Schema.fromMini(later).map((text) => text.length);
	expectEqual({
		label: "parseAsync awaits an async child, as a Result",
		actual: [
			unwrap(good),
			entries(unwrapErr(bad)).map(({ path }) => path),
			unwrap(await mainLater.parseAsync("four")),
		],
		expected: [{ a: "x", b: 1 }, [["a"]], 4],
	});
}

async function exerciseStandard(): Promise<void> {
	const standard: StandardSchemaV1<unknown, string> = toStandard({
		schema: string(),
	});
	const viaMini = miniToStandard({ schema: miniNumber() });
	const viaPath = toStandardOf({ schema: miniString() });
	const valid = standard["~standard"].validate("a");
	const invalid = viaMini["~standard"].validate("x");
	expectEqual({
		label: "toStandard validates synchronously for a Sync parse",
		actual: [
			valid instanceof Promise ? "async" : valid,
			invalid instanceof Promise ? "async" : "issues" in invalid,
			viaPath["~standard"].vendor,
		],
		expected: [{ value: "a" }, true, "sekhmet"],
	});

	const back = fromStandard(viaMini);
	const backMini = miniFromStandard(viaPath);
	const asyncStandard: StandardSchemaV1<unknown, number> = {
		"~standard": {
			version: 1,
			vendor: "probe",
			validate: (value) => {
				return Promise.resolve(
					typeof value === "number"
						? { value }
						: { issues: [{ message: "not a number" }] },
				);
			},
		},
	};
	const fromAsync = await parseAsync(fromStandard(asyncStandard), "x");
	expectEqual({
		label: "fromStandard wraps a Standard Schema, sync or async",
		actual: [
			unwrap(back.parseSync(3)),
			unwrap(parseSync(backMini, "b")),
			entries(unwrapErr(fromAsync)).map(({ error }) => error.message),
		],
		expected: [3, "b", ["not a number"]],
	});
}

/** Runs the exercise. */
export async function exercise(): Promise<void> {
	exercisePrimitives();
	exerciseComposites();
	exerciseAlgebra();
	exerciseDescriptions();
	exerciseMain();
	await exerciseAsync();
	await exerciseStandard();
}
