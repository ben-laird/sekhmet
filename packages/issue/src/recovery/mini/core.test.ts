import { Some } from "@sekhmet/enum/option/mini";
import {
	type Result,
	Err as ResultErr,
	Ok as ResultOk,
} from "@sekhmet/enum/result/mini";
import { Err, Ok, type Outcome } from "@sekhmet/panic/outcome/mini";
import { Struct } from "@sekhmet/primordials/struct";
import {
	isPending,
	resolved,
	value,
	vowWithResolver,
	wait,
} from "@sekhmet/vow/mini";
import { assert, assertEquals, assertInstanceOf } from "@std/assert";
import { fail, Recovery, run, succeed, sync } from "./core.ts";

Deno.test("new Recovery(fn) wraps a repair, and run() calls it with the value", () => {
	// Given: a recovery that records the value it repairs
	const seen: string[] = [];
	const recovery = new Recovery((path: string) => {
		seen.push(path);
		return resolved(Ok<number, never>(path.length));
	});

	// When: it is run
	const result = run(recovery, "app.json");

	// Then: it is a Struct, it saw the value, and its vow already holds Ok
	assertInstanceOf(recovery, Struct);
	assertEquals(seen, ["app.json"]);
	assertEquals(value(result), Some(Ok(8)));
});

Deno.test("run() of an async recovery stays pending until it settles", async () => {
	// Given: a recovery waiting on a resolver
	const { vow, resolve } = vowWithResolver<Outcome<number, string>>();
	const recovery = new Recovery((_: string) => vow);

	// When: it is run, then settled
	const result = run(recovery, "app.json");
	const before = isPending(result);
	resolve(Err("offline"));

	// Then: it was pending, and resolves with the result
	assert(before);
	assertEquals(await wait(result), Err("offline"));
});

Deno.test("succeed() always yields its residue, synchronously", () => {
	// Given: a recovery that succeeds with a config
	const useDefault = succeed<string, { port: number }>({ port: 8080 });

	// When: it is run on different values
	const results = ["a", "b"].map((path) => value(run(useDefault, path)));

	// Then: each is already Ok with the same residue
	assertEquals(results, [Some(Ok({ port: 8080 })), Some(Ok({ port: 8080 }))]);
});

Deno.test("fail() always fails with its error, synchronously", () => {
	// Given: a recovery that fails
	const readOnly = fail<string, string>("read-only");

	// When: it is run
	const result = value(run(readOnly, "app.json"));

	// Then: it is already Err
	assertEquals(result, Some(Err("read-only")));
});

Deno.test("sync() wraps a Result-returning repair in a resolved vow", () => {
	// Given: a synchronous parser
	const parsePort = sync((text: string): Result<number, string> => {
		const port = Number(text);
		if (Number.isInteger(port)) {
			return ResultOk(port);
		}
		return ResultErr(`not a port: ${text}`);
	});

	// When: it is run on good and bad input
	const good = value(run(parsePort, "8080"));
	const bad = value(run(parsePort, "eighty"));

	// Then: both are already resolved with the parser's results
	assertEquals(good, Some(Ok(8080)));
	assertEquals(bad, Some(Err("not a port: eighty")));
});

Deno.test("Recovery is contravariant in its value: a wider one fits a narrower use", () => {
	// Given: a recovery that accepts any value
	const anything: Recovery<unknown, number, never> = succeed(1);

	// When: it is used where a recovery of strings is expected
	const ofStrings: Recovery<string, number, never> = anything;

	// Then: it is the same recovery
	assertEquals(value(run(ofStrings, "x")), Some(Ok(1)));
});
