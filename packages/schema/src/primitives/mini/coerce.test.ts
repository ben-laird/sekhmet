import { Err, Ok } from "@sekhmet/enum/result/mini";
import { assertEquals, assertThrows } from "@std/assert";
import type { SchemaIssue } from "@/src/core/mini/issue.ts";
import { InvalidType } from "@/src/core/mini/issue.ts";
import { ParseError, parseSync, type Schema } from "@/src/core/mini/schema.ts";
import { boolean } from "./boolean.ts";
import { number } from "./number.ts";
import { string } from "./string.ts";

/** One schema's coercion cases: the converted values and the rejected inputs. */
interface Table<T> {
	readonly name: string;
	readonly schema: Schema<unknown, T, SchemaIssue>;
	readonly expected: string;
	readonly accepts: readonly [input: unknown, output: T][];
	readonly rejects: readonly unknown[];
}

/**
 * A test name's rendering of an input, the same on every runtime (no
 * `Deno.inspect`, which only Deno has).
 */
function label(input: unknown): string {
	if (typeof input === "string") return JSON.stringify(input);
	if (typeof input === "bigint") return `${input}n`;
	if (Object.is(input, -0)) return "-0";
	if (input instanceof Date) return `Date(${input.getTime()})`;
	if (typeof input === "object" && input !== null) {
		if (Object.getPrototypeOf(input) === null) return "a null-prototype object";

		return JSON.stringify(input);
	}

	return String(input);
}

function runTable<T>(table: Table<T>): void {
	for (const [input, output] of table.accepts) {
		Deno.test(`${table.name} converts ${label(input)}`, () => {
			// Given: the coercing schema
			// When: parsing a convertible input
			const result = parseSync(table.schema, input);

			// Then: it gives the converted value
			assertEquals(result, Ok(output));
		});
	}
	for (const input of table.rejects) {
		Deno.test(`${table.name} rejects ${label(input)}`, () => {
			// Given: the coercing schema
			// When: parsing an input it must not convert
			const result = parseSync(table.schema, input);

			// Then: it fails with InvalidType, keeping the input
			assertEquals(
				result,
				Err(ParseError(InvalidType({ input, expected: table.expected }))),
			);
		});
	}
}

runTable({
	name: "number({ coerce: true })",
	schema: number({ coerce: true }),
	expected: "number",
	accepts: [
		[" 12 ", 12],
		["1e3", 1000],
		["-1.5", -1.5],
		["+.5", 0.5],
		["7.", 7],
		["1E-2", 0.01],
		["\n42\t", 42],
		[true, 1],
		[false, 0],
		[9007199254740991n, Number.MAX_SAFE_INTEGER],
		[-9007199254740991n, Number.MIN_SAFE_INTEGER],
		[0n, 0],
	],
	rejects: [
		"",
		"   ",
		"0x10",
		"0b1",
		"1_000",
		"Infinity",
		"NaN",
		"12px",
		".",
		"1e",
		9007199254740992n,
		null,
		undefined,
		[],
		{},
		Symbol("s"),
		new Date(0),
	],
});

runTable({
	name: 'number({ coerce: "native" })',
	schema: number({ coerce: "native" }),
	expected: "number",
	accepts: [
		["", 0],
		["0x10", 16],
		[null, 0],
		[[], 0],
		[true, 1],
		[2n ** 60n, 2 ** 60],
		[new Date(5), 5],
	],
	rejects: [Symbol("s"), Object.create(null)],
});

runTable({
	name: "string({ coerce: true })",
	schema: string({ coerce: true }),
	expected: "string",
	accepts: [
		[123, "123"],
		[-0, "0"],
		[1.5, "1.5"],
		[10n, "10"],
		[true, "true"],
		[false, "false"],
	],
	rejects: [
		null,
		undefined,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		{},
		[],
		Symbol("s"),
	],
});

runTable({
	name: 'string({ coerce: "native" })',
	schema: string({ coerce: "native" }),
	expected: "string",
	accepts: [
		[null, "null"],
		[undefined, "undefined"],
		[Number.NaN, "NaN"],
		[{}, "[object Object]"],
		[[1, 2], "1,2"],
		[Symbol("s"), "Symbol(s)"],
	],
	rejects: [Object.create(null)],
});

runTable({
	name: "boolean({ coerce: true })",
	schema: boolean({ coerce: true }),
	expected: "boolean",
	accepts: [
		[0, false],
		[-0, false],
		[1, true],
		[0n, false],
		[1n, true],
		["false", false],
		[" Off ", false],
		["YES", true],
		["enabled", true],
	],
	rejects: ["maybe", "", 2, -1, 2n, null, undefined, {}, [], Number.NaN],
});

runTable({
	name: 'boolean({ coerce: "native" })',
	schema: boolean({ coerce: "native" }),
	expected: "boolean",
	accepts: [
		["false", true],
		["", false],
		[0, false],
		[2, true],
		[null, false],
		[{}, true],
	],
	rejects: [],
});

Deno.test("native coercion still applies number's own checks", () => {
	for (const input of ["abc", undefined, {}]) {
		// Given: native-coercing number schemas, with and without nan allowed
		const strict = number({ coerce: "native" });
		const lenient = number({ coerce: "native", nan: true });

		// When: parsing a value that Number() turns into NaN
		const rejected = parseSync(strict, input);
		const accepted = parseSync(lenient, input);

		// Then: NaN fails unless nan: true; the issue describes the coerced value
		assertEquals(
			rejected,
			Err(ParseError(InvalidType({ input: Number.NaN, expected: "number" }))),
		);
		assertEquals(accepted, Ok(Number.NaN));
	}
});

Deno.test("strict coercion of an overflowing exponent still rejects Infinity", () => {
	// Given: strict-coercing number schemas, with and without infinite allowed
	const strict = number({ coerce: true });
	const lenient = number({ coerce: true, infinite: true });

	// When: parsing an exponent string beyond the number range
	// Then: Infinity fails unless infinite: true
	assertEquals(
		parseSync(strict, "1e999"),
		Err(
			ParseError(
				InvalidType({ input: Number.POSITIVE_INFINITY, expected: "number" }),
			),
		),
	);
	assertEquals(parseSync(lenient, "1e999"), Ok(Number.POSITIVE_INFINITY));
});

Deno.test("native coercion lets errors other than TypeError propagate", () => {
	// Given: an object whose own conversion code throws a non-TypeError
	const broken = {
		valueOf(): number {
			throw new RangeError("broken valueOf");
		},
	};

	// When: native-coercing it
	// Then: the error is a bug in the input, so it propagates
	assertThrows(
		() => parseSync(number({ coerce: "native" }), broken),
		RangeError,
		"broken valueOf",
	);
});
