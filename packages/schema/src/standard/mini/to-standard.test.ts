import { Err, Ok, type Result } from "@sekhmet/enum/result/mini";
import { definePanicRuntime, type PanicRuntime } from "@sekhmet/panic";
import {
	assertEquals,
	assertInstanceOf,
	assertRejects,
	assertThrows,
} from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import {
	InvalidType,
	type SchemaIssue,
	TooSmall,
} from "@/src/core/mini/issue.ts";
import { type Issues, issues } from "@/src/core/mini/issues.ts";
import { Schema } from "@/src/core/mini/schema.ts";
import type { InferStandardInput, InferStandardOutput } from "./spec.ts";
import { toStandard } from "./to-standard.ts";

const panics = definePanicRuntime();

const text = new Schema({
	parse: (input: unknown) => {
		return typeof input === "string"
			? Ok(input)
			: Err(InvalidType({ input, expected: "string" }));
	},
});

Deno.test("toStandard declares Standard Schema v1 from the sekhmet vendor", () => {
	// Given: a schema whose input is unknown
	// When: exposing it as a Standard Schema
	const standard = toStandard({ panics, schema: text });

	// Then: its props name version 1 and the sekhmet vendor
	assertEquals(standard["~standard"].version, 1);
	assertEquals(standard["~standard"].vendor, "sekhmet");
});

Deno.test("toStandard types infer the schema's output", () => {
	// Given: a schema of unknown to string
	// When: exposing it as a Standard Schema
	const standard = toStandard({ panics, schema: text });

	// Then: Standard inference sees unknown in and string out
	assertType<IsExact<InferStandardInput<typeof standard>, unknown>>(true);
	assertType<IsExact<InferStandardOutput<typeof standard>, string>>(true);
});

Deno.test("toStandard validates synchronously when the parse is resolved", () => {
	// Given: a synchronous schema exposed as a Standard Schema
	const standard = toStandard({ panics, schema: text });

	// When: validating a valid and an invalid value
	const valid = standard["~standard"].validate("a");
	const invalid = standard["~standard"].validate(1);

	// Then: both results are plain objects, not promises
	assertEquals(valid, { value: "a" });
	assertEquals(invalid, {
		issues: [{ message: "Expected string, received number" }],
	});
});

Deno.test("toStandard returns a Promise when the parse is pending", async () => {
	// Given: an asynchronous schema exposed as a Standard Schema
	const standard = toStandard({
		panics,
		schema: new Schema({
			parse: (input: unknown) => {
				return Promise.resolve(
					typeof input === "string"
						? Ok(input)
						: Err(InvalidType({ input, expected: "string" })),
				);
			},
		}),
	});

	// When: validating a valid and an invalid value
	const valid = standard["~standard"].validate("a");
	const invalid = standard["~standard"].validate(null);

	// Then: both results are promises of the Standard results
	assertInstanceOf(valid, Promise);
	assertInstanceOf(invalid, Promise);
	assertEquals(await valid, { value: "a" });
	assertEquals(await invalid, {
		issues: [{ message: "Expected string, received null" }],
	});
});

Deno.test("toStandard reports one issue per Issues entry, with its path", () => {
	// Given: a schema failing with Issues<SchemaIssue> at nested paths
	const found = issues([
		{ path: ["name"], error: InvalidType({ input: 1, expected: "string" }) },
		{
			path: ["tags", 0],
			error: TooSmall({
				input: [],
				origin: "array",
				minimum: 1,
				inclusive: true,
			}),
		},
	]);
	const standard = toStandard({
		panics,
		schema: new Schema({ parse: (_: unknown) => Err(found) }),
	});

	// When: validating any value
	const result = standard["~standard"].validate({});

	// Then: each entry is an issue with formatIssue's message and its path
	assertEquals(result, {
		issues: [
			{ message: "Expected string, received number", path: ["name"] },
			{
				message: "Too small: expected array to have >= 1 items",
				path: ["tags", 0],
			},
		],
	});
});

Deno.test("toStandard keeps symbol path segments", () => {
	// Given: an Issues entry under a symbol key
	const key = Symbol("key");
	const standard = toStandard({
		panics,
		schema: new Schema({
			parse: (input: unknown) => {
				return Err(
					issues([
						{ path: [key], error: InvalidType({ input, expected: "string" }) },
					]),
				);
			},
		}),
	});

	// When: validating
	const result = standard["~standard"].validate(1);

	// Then: the path holds the symbol itself
	assertEquals(result, {
		issues: [{ message: "Expected string, received number", path: [key] }],
	});
});

Deno.test("toStandard converts other errors with toIssue", async (t) => {
	await t.step("a message becomes an issue at the root", () => {
		// Given: a schema failing with a custom error, and a toIssue giving a message
		const even = new Schema({
			parse: (input: unknown) => {
				return typeof input === "number" && input % 2 === 0
					? Ok(input)
					: Err({ code: "odd" });
			},
		});
		const standard = toStandard({
			panics,
			schema: even,
			toIssue: ({ code }) => `Rejected: ${code}`,
		});

		// When: validating an odd number
		const result = standard["~standard"].validate(3);

		// Then: the message is the only issue, with no path
		assertEquals(result, { issues: [{ message: "Rejected: odd" }] });
	});

	await t.step("an issue's own path follows the entry's path", () => {
		// Given: Issues of custom errors, and a toIssue that adds a path
		const standard = toStandard({
			panics,
			schema: new Schema({
				parse: (_: unknown) => {
					return Err(
						issues([
							{ path: ["outer"], error: "a" },
							{ path: [], error: "b" },
						]),
					);
				},
			}),
			toIssue: (error) => ({
				message: `bad ${error}`,
				path: [{ key: "inner" }],
			}),
		});

		// When: validating
		const result = standard["~standard"].validate(undefined);

		// Then: each entry's path is prepended to toIssue's path
		assertEquals(result, {
			issues: [
				{ message: "bad a", path: ["outer", { key: "inner" }] },
				{ message: "bad b", path: [{ key: "inner" }] },
			],
		});
	});

	await t.step("toIssue may also format SchemaIssues", () => {
		// Given: a SchemaIssue schema with a custom toIssue
		const standard = toStandard({
			panics,
			schema: text,
			toIssue: () => "nope",
		});

		// When: validating an invalid value
		const result = standard["~standard"].validate(1);

		// Then: toIssue's message replaces formatIssue's
		assertEquals(result, { issues: [{ message: "nope" }] });
	});
});

Deno.test("toStandard's types enforce its contract", async (t) => {
	await t.step("SchemaIssue and Issues<SchemaIssue> need no options", () => {
		// Given: schemas failing with SchemaIssue, Issues<SchemaIssue>, or never
		const issue = new Schema<unknown, number, SchemaIssue>({
			parse: (_) => Ok(1),
		});
		const issues = new Schema<unknown, number, Issues<SchemaIssue>>({
			parse: (_) => {
				return Ok(1);
			},
		});
		const infallible = new Schema<unknown, number, never>({
			parse: (_) => Ok(1),
		});

		// When: exposing each without options
		const results = [
			toStandard({ panics, schema: issue }),
			toStandard({ panics, schema: issues }),
			toStandard({ panics, schema: infallible }),
		];

		// Then: each compiles and validates
		assertEquals(
			results.map((standard) => standard["~standard"].validate(0)),
			[{ value: 1 }, { value: 1 }, { value: 1 }],
		);
	});

	await t.step("an input other than unknown is a type error", () => {
		// Given: a schema that only accepts strings
		const length = new Schema({ parse: (input: string) => Ok(input.length) });

		// When: exposing it as a Standard Schema
		// Then: it does not compile
		// @ts-expect-error: Standard Schema validates unknown input
		toStandard({ panics, schema: length });
		// @ts-expect-error: even with a toIssue option
		toStandard({ panics, schema: length, toIssue: () => "" });
	});

	await t.step("other errors require toIssue", () => {
		// Given: schemas failing with a string and with Issues<string>
		const plain = new Schema<unknown, number, string>({ parse: (_) => Ok(1) });
		const located = new Schema<unknown, number, Issues<string>>({
			parse: (_) => Ok(1),
		});

		// When: exposing them without options
		// Then: neither compiles
		// @ts-expect-error: a string error needs toIssue
		toStandard({ panics, schema: plain });
		// @ts-expect-error: Issues<string> needs toIssue
		toStandard({ panics, schema: located });
	});

	await t.step("toIssue receives each flattened error", () => {
		// Given: a schema failing with a string or Issues<number>
		const mixed = new Schema<unknown, number, string | Issues<number>>({
			parse: (_) => {
				return Ok(1);
			},
		});

		// When: exposing it with a toIssue
		// Then: toIssue's parameter is the flattened error, string | number
		toStandard({
			panics,
			schema: mixed,
			toIssue: (error) => {
				assertType<IsExact<typeof error, string | number>>(true);
				return String(error);
			},
		});
	});

	await t.step("bypassing the types to omit toIssue panics", () => {
		// Given: a string-error schema exposed without toIssue, against the types
		const { panics, reported } = recordingPanics();
		// @ts-expect-error: deliberately bypasses the overloads
		const standard = toStandard({
			panics,
			schema: new Schema({ parse: (_: unknown) => Err("bad") }),
		});

		// When: validating
		// Then: the broken contract panics, propagating to the caller unreported
		assertThrows(
			() => standard["~standard"].validate(0),
			TypeError,
			"needs a toIssue option",
		);
		assertEquals(reported, []);
	});
});

/** A panic runtime whose hook records each payload it reports. */
function recordingPanics(): { panics: PanicRuntime; reported: unknown[] } {
	const recording = definePanicRuntime();
	const reported: unknown[] = [];
	recording.setHook(({ payload }) => reported.push(payload));

	return { panics: recording, reported };
}

Deno.test("toStandard reports a panic, then resumes it out of validate", async (t) => {
	const bug = new Error("bug");

	await t.step("a synchronous panic throws from validate", () => {
		// Given: a throwing schema, exposed under a recording runtime
		const { panics, reported } = recordingPanics();
		const standard = toStandard({
			panics,
			schema: new Schema({
				parse: (_input: unknown): Result<string, SchemaIssue> => {
					throw bug;
				},
			}),
		});

		// When / Then: validate throws the payload, reported once
		assertThrows(() => standard["~standard"].validate("a"), Error, "bug");
		assertEquals(reported, [bug]);
	});

	await t.step("an asynchronous panic rejects validate's promise", async () => {
		// Given: a rejecting schema, exposed under a recording runtime
		const { panics, reported } = recordingPanics();
		const standard = toStandard({
			panics,
			schema: new Schema({
				parse: (_input: unknown): Promise<Result<string, SchemaIssue>> => {
					return Promise.reject(bug);
				},
			}),
		});

		// When: validating
		const validated = standard["~standard"].validate("a");

		// Then: the promise rejects with the payload, reported once
		assertInstanceOf(validated, Promise);
		await assertRejects(() => Promise.resolve(validated), Error, "bug");
		assertEquals(reported, [bug]);
	});

	for (const [timing, schema] of [
		["synchronous", new Schema({ parse: (_input: unknown) => Err("bad") })],
		[
			"asynchronous",
			new Schema({ parse: (_input: unknown) => Promise.resolve(Err("bad")) }),
		],
	] as const) {
		await t.step(`a ${timing} toIssue that throws`, async () => {
			// Given: a schema exposed with a toIssue that throws
			const { panics, reported } = recordingPanics();
			const standard = toStandard({
				panics,
				schema,
				toIssue: (): string => {
					throw bug;
				},
			});

			// When: validating a failing value
			const validate = (): unknown => standard["~standard"].validate(0);

			// Then: validate throws (or rejects with) the payload, which
			// propagates to the waiting caller without being reported
			if (timing === "synchronous") {
				assertThrows(validate, Error, "bug");
			} else {
				await assertRejects(() => Promise.resolve(validate()), Error, "bug");
			}
			assertEquals(reported, []);
		});
	}
});
