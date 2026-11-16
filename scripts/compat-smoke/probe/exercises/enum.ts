/**
 * Exercises `@sekhmet/enum`: every feature through its main entrypoint, and
 * Option and Result again through mini barrels and single-function paths.
 *
 * @module
 */

import { Enum, type Split } from "@sekhmet/enum/core";
import { match } from "@sekhmet/enum/core/mini/exit";
import { Active, type Latch } from "@sekhmet/enum/latch";
import { None, type Option, Some } from "@sekhmet/enum/option";
import { filter, Some as MiniSome } from "@sekhmet/enum/option/mini";
import { map } from "@sekhmet/enum/option/mini/transform";
import { unwrapOr } from "@sekhmet/enum/option/mini/unwrap";
import { compareNumbers, compareStrings } from "@sekhmet/enum/ordering";
import { Pending, Ready } from "@sekhmet/enum/poll";
import { Err, Ok, type Result } from "@sekhmet/enum/result";
import { mapErr } from "@sekhmet/enum/result/mini";
import { Err as MiniErr } from "@sekhmet/enum/result/mini/core";
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

/** Runs the exercise. */
export function exercise(): void {
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
}
