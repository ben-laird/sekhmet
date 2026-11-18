/**
 * Exercises `@sekhmet/enum`: every feature through its main entrypoint, and
 * Option and Result again through mini barrels and single-function paths,
 * including the 0.2.0 additions `maybe`, `fallible`, `fallibleAsync` and
 * `promiseResult`. Every rejection they meet is captured as an `Err`, so the
 * exercise never leaves an unhandled rejection behind.
 *
 * @module
 */

import { Enum, type Split } from "@sekhmet/enum/core";
import { match } from "@sekhmet/enum/core/mini/exit";
import { Active, type Latch } from "@sekhmet/enum/latch";
import { maybe, None, type Option, Some } from "@sekhmet/enum/option";
import { filter, Some as MiniSome } from "@sekhmet/enum/option/mini";
import { maybe as miniMaybe } from "@sekhmet/enum/option/mini/nullable";
import { map } from "@sekhmet/enum/option/mini/transform";
import { unwrapOr } from "@sekhmet/enum/option/mini/unwrap";
import { compareNumbers, compareStrings } from "@sekhmet/enum/ordering";
import { Pending, Ready } from "@sekhmet/enum/poll";
import {
	Err,
	fallible,
	fallibleAsync,
	Ok,
	promiseResult,
	type Result,
} from "@sekhmet/enum/result";
import { mapErr } from "@sekhmet/enum/result/mini";
import { Err as MiniErr } from "@sekhmet/enum/result/mini/core";
import { fallible as miniFallible } from "@sekhmet/enum/result/mini/fallible";
import { unwrapErr } from "@sekhmet/enum/result/mini/unwrap";
import { expectEqual } from "../check.ts";

function findUser(id: number): Option<{ name: string }> {
	return id === 1 ? Some({ name: "Ada" }) : None();
}

function parsePort(text: string): Result<number, string> {
	const port = Number(text);
	return Number.isInteger(port) && port > 0
		? Ok(port)
		: Err(`invalid port: ${text}`);
}

type Shape = Split<{ Circle: [radius: number]; Square: [side: number] }>;

const parseJson = fallible({
	fn: (text: string): unknown => {
		return JSON.parse(text);
	},
	parseErr: ({ args: [text] }) => {
		return `not JSON: ${text}`;
	},
});

const loadUser = fallibleAsync({
	fn: async (id: number): Promise<string> => {
		await Promise.resolve();
		if (id !== 1) throw new Error(`no user ${id}`);
		return "Ada";
	},
	parseErr: ({ error }) => {
		return error instanceof Error ? error.message : String(error);
	},
});

function settle(ok: boolean): Promise<Result<number, string>> {
	return promiseResult<number, string>((resolve, reject) => {
		if (ok) {
			resolve(21);
		} else {
			reject("refused");
		}
	});
}

async function exerciseAdditions(): Promise<void> {
	expectEqual({
		label: "maybe main chain",
		actual: [
			maybe(null).isNone(),
			maybe(0)
				.map((n) => n + 1)
				.unwrapOr(-1),
		],
		expected: [true, 1],
	});
	expectEqual({
		label: "maybe mini",
		actual: [unwrapOr(miniMaybe(undefined), 7), unwrapOr(miniMaybe(""), "x")],
		expected: [7, ""],
	});

	expectEqual({
		label: "fallible main chain",
		actual: [
			parseJson("{")
				.mapErr((e) => e.toUpperCase())
				.unwrapErr(),
			parseJson("[1,2]")
				.map((value) => Array.isArray(value))
				.unwrapOr(false),
		],
		expected: ["NOT JSON: {", true],
	});
	const miniParse = miniFallible({
		fn: (text: string): unknown => {
			return JSON.parse(text);
		},
		parseErr: () => {
			return "bad";
		},
	});
	expectEqual({
		label: "fallible mini",
		actual: unwrapErr(miniParse("{")),
		expected: "bad",
	});

	const [found, missing] = await Promise.all([loadUser(1), loadUser(2)]);
	expectEqual({
		label: "fallibleAsync main chain",
		actual: [
			found.map((name) => name.length).unwrapOr(0),
			missing.mapErr((e) => e.toUpperCase()).unwrapErr(),
		],
		expected: [3, "NO USER 2"],
	});

	const [settled, refused] = await Promise.all([settle(true), settle(false)]);
	expectEqual({
		label: "promiseResult main chain",
		actual: [
			settled.map((n) => n * 2).unwrapOr(0),
			refused.mapErr((e) => e.length).unwrapErr(),
		],
		expected: [42, 7],
	});
}

/** Runs the exercise. */
export async function exercise(): Promise<void> {
	expectEqual({
		label: "option main chain",
		actual: [1, 2].map((id) =>
			findUser(id)
				.map((user) => user.name)
				.unwrapOr("anonymous"),
		),
		expected: ["Ada", "anonymous"],
	});
	expectEqual({
		label: "option mini chain",
		actual: unwrapOr(
			filter(
				map(MiniSome(21), (n) => n * 2),
				(n) => n > 40,
			),
			0,
		),
		expected: 42,
	});

	expectEqual({
		label: "result main chain",
		actual: [
			parsePort("8080").unwrapOr(80),
			parsePort("http")
				.mapErr((e) => e.toUpperCase())
				.unwrapErr(),
		],
		expected: [8080, "INVALID PORT: HTTP"],
	});
	expectEqual({
		label: "result mini chain",
		actual: unwrapErr(mapErr(MiniErr("boom"), (e) => e.length)),
		expected: 4,
	});

	const people = [
		{ name: "Bea", age: 30 },
		{ name: "Al", age: 30 },
		{ name: "Cy", age: 20 },
	];
	people.sort((a, b) =>
		compareNumbers(a.age, b.age)
			.andThen(compareStrings(a.name, b.name))
			.toNumber(),
	);
	expectEqual({
		label: "ordering sort",
		actual: people.map((p) => p.name),
		expected: ["Cy", "Al", "Bea"],
	});

	const connection: Latch<string, string> = Active("socket");
	connection.deactivate("closed by peer");
	expectEqual({
		label: "latch deactivate",
		actual: connection.isActive(),
		expected: false,
	});

	expectEqual({
		label: "poll",
		actual: [
			Ready(1)
				.map((n) => n + 1)
				.isReady(),
			Pending<number>().isPending(),
		],
		expected: [true, true],
	});

	const square = new Enum<Shape>("Square", 3);
	const area = (shape: Enum<Shape>): number =>
		match(shape)({
			Circle: (radius) => Math.PI * radius ** 2,
			Square: (side) => side ** 2,
		});
	expectEqual({ label: "core match", actual: area(square), expected: 9 });

	await exerciseAdditions();
}
