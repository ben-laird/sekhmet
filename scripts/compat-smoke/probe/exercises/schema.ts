/**
 * Exercises `@sekhmet/schema`: every export path, the root and each main
 * entrypoint chaining methods, each mini barrel, and each single-module
 * path. Primitives, composites and the algebra parse good and bad values;
 * a schema reads back its node and annotations; Standard Schema round-trips
 * both ways, synchronously and asynchronously. Every parse runs under a
 * panic runtime and resolves to an Outcome, so the exercise never leaves a
 * promise rejection behind.
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
import { definePanicRuntime } from "@sekhmet/panic";
import { resume } from "@sekhmet/panic/outcome/mini";
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
import {
	Schema as MiniSchema,
	parse as miniParse,
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
import { isPending, isResolved, wait } from "@sekhmet/vow";
import { expectEqual } from "../check.ts";

const panics = definePanicRuntime();

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
		parseSync(miniString({ trim: true, minLength: 2 }), {
			input: " Ada ",
			panics,
		}),
		parseSync(miniNumber({ coerce, int: true }), { input: "42", panics }),
		parseSync(boolean(), { input: true, panics }),
		parseSync(miniBoolean(), { input: false, panics }),
		parseSync(stringbool(), { input: "yes", panics }),
		parseSync(literal("on"), { input: "on", panics }),
		parseSync(null_(), { input: null, panics }),
		parseSync(undefined_(), { input: undefined, panics }),
		parseSync(unknown(), { input: 7, panics }),
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
			unwrap(parseSync(bigint({ multipleOf: 2n }), { input: 4n, panics })) ===
				4n,
			unwrap(parseSync(symbol(), { input: sym, panics })) === sym,
			unwrap(parseSync(date(), { input: day, panics })).getTime(),
		],
		expected: [true, true, 0],
	});

	const rejected = [
		rejection(parseSync(miniString(), { input: 1, panics })),
		rejection(parseSync(miniNumber({ min: 0 }), { input: -1, panics })),
		rejection(parseSync(never(), { input: "anything", panics })),
	];
	expectEqual({
		label: "the primitives reject bad values with a SchemaIssue",
		actual: rejected.map(isSchemaIssue),
		expected: [true, true, true],
	});
	expectEqual({
		label: "formatIssue renders a SchemaIssue",
		actual: typeof formatIssue(
			rejection(parseSync(miniString(), { input: 1, panics })),
		),
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
		actual: unwrap(
			parseSync(user, { input: { name: "Ada", age: undefined }, panics }),
		),
		expected: { name: "Ada", age: undefined },
	});
	const failed = rejection(
		parseSync(user, { input: { name: 1, extra: true }, panics }),
	);
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
			unwrap(parseSync(shape, { input: { kind: "square", side: 2 }, panics }))
				.kind,
			unwrap(
				parseSync(arrayOf({ item: nullable(miniNumber()) }), {
					input: [1, null],
					panics,
				}),
			),
			unwrap(
				parseSync(tuple([miniString(), miniNumber()]), {
					input: ["a", 1],
					panics,
				}),
			),
			unwrap(
				parseSync(record({ key: miniString(), value: miniNumber() }), {
					input: { a: 1 },
					panics,
				}),
			),
			unwrap(
				parseSync(unionOf([miniString(), miniNumber()]), { input: 3, panics }),
			),
			unwrap(parseSync(enumOf(["red", "green"]), { input: "green", panics })),
			unwrap(parseSync(tree, { input: ["x"], panics })),
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
			unwrap(
				parseSync(visible, { input: { name: "Ada", password: "x" }, panics }),
			),
			unwrap(
				parseSync(named, { input: { name: "Ada", password: "x" }, panics }),
			),
			isErr(
				parseSync(strict, { input: { name: "Ada", password: "x" }, panics }),
			),
			unwrap(parseSync(either, { input: 1, panics })),
			unwrap(parseSync(either2, { input: "b", panics })),
			Object.isFrozen(unwrap(parseSync(frozen, { input: ["a"], panics }))),
			Object.isFrozen(unwrap(parseSync(frozen2, { input: { a: 1 }, panics }))),
			unwrap(parseSync(id, { input: "u1", panics })),
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

	const isText = guard(miniString(), { panics });
	const isNumber = is(number(), { panics });
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
	const parsedIds: readonly UserId[] = unwrap(
		ids.parseSync({ input: ["u1", 2], panics }),
	);
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
			unwrap(port.parseSync({ input: " 3000 ", panics })),
			unwrap(port.parseSync({ input: "http", panics })),
			parsedIds,
			Object.isFrozen(parsedIds),
			unwrap(user.shape.name.parseSync({ input: "Ada", panics })),
			unwrap(patch.parseSync({ input: {}, panics })),
			isOk(union([string(), number()]).parseSync({ input: 1, panics })),
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
	const panics = definePanicRuntime();
	const timings = [
		isResolved(miniParse(doubled, { input: 2, panics })),
		isPending(miniParse(later, { input: "a", panics })),
	];
	expectEqual({
		label: "a parse resolves now when it finished, and later when it awaits",
		actual: timings,
		expected: [true, true],
	});
	expectEqual({
		label: "parseSync reports an async parse instead of awaiting it",
		actual: isErr(parseSync(later, { input: "a", panics })),
		expected: true,
	});

	const good = await wait(miniParse(pair, { input: { a: "x", b: 1 }, panics }));
	const bad = await wait(miniParse(pair, { input: { a: 1, b: 1 }, panics }));
	const mainLater = Schema.fromMini(later).map((text) => text.length);
	const counted = await wait(mainLater.parse({ input: "four", panics }));
	expectEqual({
		label: "parse waits for an async child, as an Outcome",
		actual: [
			unwrap(resume(good)),
			entries(unwrapErr(resume(bad))).map(({ path }) => path),
			unwrap(resume(counted)),
		],
		expected: [{ a: "x", b: 1 }, [["a"]], 4],
	});
}

async function exerciseStandard(): Promise<void> {
	const panics = definePanicRuntime();
	const standard: StandardSchemaV1<unknown, string> = toStandard({
		schema: string(),
		panics,
	});
	const viaMini = miniToStandard({ schema: miniNumber(), panics });
	const viaPath = toStandardOf({ schema: miniString(), panics });
	const valid = standard["~standard"].validate("a");
	const invalid = viaMini["~standard"].validate("x");
	expectEqual({
		label: "toStandard validates synchronously for a synchronous parse",
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
	const fromAsync = resume(
		await wait(miniParse(fromStandard(asyncStandard), { input: "x", panics })),
	);
	expectEqual({
		label: "fromStandard wraps a Standard Schema, sync or async",
		actual: [
			unwrap(back.parseSync({ input: 3, panics })),
			unwrap(parseSync(backMini, { input: "b", panics })),
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
