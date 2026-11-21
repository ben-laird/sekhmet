/** The main Recovery, in method form. */

import { Result } from "@sekhmet/enum/result";
import { Ok } from "@sekhmet/enum/result/mini";
import { resolved, wait } from "@sekhmet/vow/mini";
import { assertEquals, assertInstanceOf } from "@std/assert";
import * as mini from "../mini/mod.ts";
import { fail, firstOf, Recovery, succeed } from "./mod.ts";

Deno.test("main Recovery is a mini one, and fromMini views a mini one", () => {
	// Given: a mini recovery and a main one
	const fromMini = Recovery.fromMini(mini.succeed<string, number>(1));
	const main = succeed<string, number>(1);

	// When: each is checked against both classes
	// Then: both are main and mini
	assertInstanceOf(fromMini, Recovery);
	assertInstanceOf(main, mini.Recovery);
});

Deno.test("methods chain, and run resolves with a main Result", async () => {
	// Given: a failing recovery, typed for the residue it stands in for
	const readBackup: Recovery<string, number, string> = fail("no backup");

	// When: composing it with methods and running it
	const recovery = readBackup
		.orElse(succeed(8080))
		.map((port) => ({ port }))
		.retry({ times: 1 });
	// {}
	const result = await wait(recovery.run("app.json"));

	// Then: the result is a main Result
	assertInstanceOf(result, Result);
	assertEquals(result.unwrap(), { port: 8080 });
});

Deno.test("new Recovery(fn) and firstOf build main recoveries", async () => {
	// Given: a recovery built with the main constructor
	const byLength = new Recovery((path: string) => {
		return resolved(Ok<number, string>(path.length));
	});

	// When: it is composed with firstOf and adapted
	const recovery = firstOf([fail<string, string>("no"), byLength]).mapInput(
		(file: { readonly path: string }) => file.path,
	);

	// Then: it is main, and runs
	assertInstanceOf(recovery, Recovery);
	assertEquals((await wait(recovery.run({ path: "app.json" }))).unwrap(), 8);
});
