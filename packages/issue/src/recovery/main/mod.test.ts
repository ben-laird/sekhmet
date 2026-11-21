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

interface Config {
	readonly port: number;
}

Deno.test("or takes the wider residue in either direction", async () => {
	// Given: a fail (residue never) and a recovery yielding a Config
	const useDefault = succeed<string, Config>({ port: 8080 });

	// When: they are chained either way, with no annotation
	const backupFirst = fail("no backup").or(useDefault);
	const defaultFirst = useDefault.or(fail("no backup"));

	// Then: both are main Config recoveries
	const asConfig: Recovery<string, Config, never> = backupFirst;
	const asConfigToo: Recovery<string, Config, string> = defaultFirst;
	assertInstanceOf(backupFirst, Recovery);
	assertEquals((await wait(asConfig.run("app.json"))).unwrap(), {
		port: 8080,
	});
	assertEquals((await wait(asConfigToo.run("app.json"))).unwrap(), {
		port: 8080,
	});
});

Deno.test("or rejects an unrelated residue", () => {
	// Given: recoveries yielding a number and a Config
	const asNumber = succeed<string, number>(8080);
	const asConfig = succeed<string, Config>({ port: 8080 });

	// When: chaining them is written (never run)
	const misuse = (): void => {
		// @ts-expect-error: number and Config have no wider residue but a union
		asNumber.or(asConfig);
	};

	// Then: it doesn't type-check
	assertEquals(typeof misuse, "function");
});

Deno.test("orElse builds the next from the error, widening either way", async () => {
	// Given: a fail with a status code, and a recovery yielding a Config
	const useDefault = succeed<string, Config>({ port: 8080 });

	// When: chained either way, the builder reading the error
	const backupFirst = fail(503).orElse((status) => {
		return succeed({ port: status === 503 ? 8080 : 80 });
	});
	const defaultFirst = useDefault.orElse(() => fail("no backup"));

	// Then: both are main Config recoveries, with no annotation
	const asConfig: Recovery<string, Config, never> = backupFirst;
	const asConfigToo: Recovery<string, Config, string> = defaultFirst;
	assertInstanceOf(backupFirst, Recovery);
	assertEquals((await wait(asConfig.run("app.json"))).unwrap(), {
		port: 8080,
	});
	assertEquals((await wait(asConfigToo.run("app.json"))).unwrap(), {
		port: 8080,
	});
});

Deno.test("orElse rejects an unrelated residue", () => {
	// Given: recoveries yielding a number and a Config
	const asNumber = succeed<string, number>(8080);
	const asConfig = succeed<string, Config>({ port: 8080 });

	// When: chaining them is written (never run)
	const misuse = (): void => {
		// @ts-expect-error: number and Config have no wider residue but a union
		asNumber.orElse(() => asConfig);
	};

	// Then: it doesn't type-check
	assertEquals(typeof misuse, "function");
});

Deno.test("methods chain, and run resolves with a main Result", async () => {
	// Given: a failing recovery
	const readBackup = fail<string, string>("no backup");

	// When: composing it with methods and running it
	const recovery = readBackup
		.or(succeed(8080))
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
