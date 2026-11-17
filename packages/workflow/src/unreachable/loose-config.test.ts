import { assert } from "@std/assert";

/**
 * Type-checks the helpers in a project with TypeScript's defaults plus
 * `strict`, where `exactOptionalPropertyTypes` is off, as it is in most
 * projects that will use them. It shells out to `deno check`, so it runs
 * only where `Deno.Command` exists (not under the compat suite).
 */
const FIXTURE = (modules: {
	unreachable: string;
	todo: string;
	invariant: string;
}): string => {
	return `import { unreachable } from "${modules.unreachable}";
import { todo, unimplemented } from "${modules.todo}";
import { defined, invariant, satisfies } from "${modules.invariant}";

type Shape = { kind: "a" } | { kind: "b" };
declare const anything: any;

export function exhaustive(shape: Shape): number {
	switch (shape.kind) {
		case "a": return 1;
		case "b": return 2;
		default: return unreachable({ value: shape });
	}
}

export function missedUndefined(value: "a" | undefined): number {
	switch (value) {
		case "a": return 1;
		// @ts-expect-error undefined is left unhandled, so value is not never
		default: return unreachable({ value });
	}
}

// @ts-expect-error any is not never
export const fromAny = (): never => unreachable({ value: anything });
// @ts-expect-error undefined is not never
export const fromUndefined = (): never => unreachable({ value: undefined });
export const bare = (): never => unreachable();
export const withUrl = (): never => unreachable({ issueUrl: new URL("https://x.test") });

export const todos = (): never => todo({ description: undefined, trackingUrl: undefined });
export const gaps = (): never => unimplemented({ subtasks: [{ description: "a", complete: undefined }] });
// @ts-expect-error a subtask needs a description
export const noDescription = (): never => todo({ subtasks: [{ complete: true }] });

export function narrowed(value: string | undefined): string {
	invariant(value !== undefined, { expectedBehavior: "it should be set", issueUrl: undefined });
	return value;
}

export const present = (value: string | null | undefined): string => defined(value, { expectedBehavior: "it should be set", issueUrl: undefined });
export const notNull = (value: string | null | undefined): string | undefined => defined(value, { absent: "null", expectedBehavior: "it should be set" });
// With absent explicitly undefined (the default at runtime), nothing is narrowed
export const unsure = (value: string | null): string | null => defined(value, { absent: undefined, expectedBehavior: "it should be set" });
// @ts-expect-error "falsy" is not an absent mode
export const falsy = (value: string | null): string => defined(value, { absent: "falsy", expectedBehavior: "it should be set" });

const isString = (value: unknown): value is string => typeof value === "string";
export const checked = (value: string | number): string => satisfies(value, { predicate: isString, expectedBehavior: "it should be a string", issueUrl: undefined });
`;
};

Deno.test({
	name: "the helpers type-check without exactOptionalPropertyTypes",
	ignore: typeof Deno.Command !== "function",
	fn: async () => {
		// Given: a project with only `strict` on, mapping the helpers' imports
		// to this workspace's source
		const dir = await Deno.makeTempDir({ prefix: "workflow-loose-" });
		try {
			await Deno.writeTextFile(
				`${dir}/deno.json`,
				JSON.stringify({
					compilerOptions: { strict: true },
					imports: {
						"@sekhmet/panic/mini/core": import.meta.resolve(
							"@sekhmet/panic/mini/core",
						),
					},
				}),
			);
			await Deno.writeTextFile(
				`${dir}/fixture.ts`,
				FIXTURE({
					unreachable: import.meta.resolve("@/src/unreachable/unreachable.ts"),
					todo: import.meta.resolve("@/src/todo/todo.ts"),
					invariant: import.meta.resolve("@/src/invariant/mod.ts"),
				}),
			);

			// When: type-checking it
			const output = await new Deno.Command(Deno.execPath(), {
				args: ["check", "--quiet", "--config", "deno.json", "fixture.ts"],
				cwd: dir,
				env: { NO_COLOR: "1" },
			}).output();

			// Then: valid calls compile and every @ts-expect-error is used
			const decoder = new TextDecoder();
			assert(
				output.success,
				decoder.decode(output.stdout) + decoder.decode(output.stderr),
			);
		} finally {
			await Deno.remove(dir, { recursive: true });
		}
	},
});
