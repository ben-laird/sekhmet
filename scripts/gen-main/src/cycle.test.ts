import { assertEquals } from "@std/assert";
import { moduleScopeValueUses } from "./cycle.ts";

Deno.test("moduleScopeValueUses allows wrap targets inside bodies and in types", () => {
	// Given: a module using Result only in an import, a type and a method body
	const source = [
		'import { Result } from "../../result/main/mod.ts";',
		"export class Option<T> extends mini.Option<T> {",
		"\tokOr<E>(err: E): Result<T, E> {",
		"\t\treturn Result.fromMini(mini.okOr(this, err));",
		"\t}",
		"}",
		"export function Some<T>(value: T): Option<T> {",
		"\treturn Option.fromMini(mini.Some(value));",
		"}",
	].join("\n");

	// When: scanning module scope for value uses of Result
	const uses = moduleScopeValueUses({ source, names: ["Result"] });

	// Then: there are none
	assertEquals(uses, []);
});

Deno.test("moduleScopeValueUses finds module-evaluation-time uses", () => {
	// Given: a module that uses Result while it evaluates
	const source = [
		'import { Result } from "../../result/main/mod.ts";',
		"// Result.fromMini(x) in a comment is fine",
		"const EMPTY = Result.fromMini(mini.Ok(1));",
		"export class Bad extends Result<number, never> {}",
		"const made = new Result(1);",
	].join("\n");

	// When: scanning module scope for value uses of Result
	const uses = moduleScopeValueUses({ source, names: ["Result"] });

	// Then: each top-level use is reported
	assertEquals(uses, ["Result.fromMini(", "extends Result", "new Result"]);
});
