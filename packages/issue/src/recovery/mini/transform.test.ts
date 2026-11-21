import { Some } from "@sekhmet/enum/option/mini";
import { Err, Ok, type Outcome, Panicked } from "@sekhmet/panic/outcome/mini";
import {
	resolved,
	type Vow,
	value,
	vowWithResolver,
	wait,
} from "@sekhmet/vow/mini";
import { assertEquals } from "@std/assert";
import { fail, Recovery, run, succeed } from "./core.ts";
import {
	andThen,
	inspect,
	inspectErr,
	map,
	mapErr,
	mapInput,
} from "./transform.ts";

const ok: Recovery<string, number, string> = succeed(80);
const failing: Recovery<string, number, string> = fail("offline");

Deno.test("map() maps the residue and passes a failure through", () => {
	// Given: a succeeding and a failing recovery
	// When: mapping each one's residue
	const mapped = [ok, failing].map((recovery) => {
		return value(
			run(
				map(recovery, (port) => ({ port })),
				"app.json",
			),
		);
	});

	// Then: only the residue changed
	assertEquals(mapped, [Some(Ok({ port: 80 })), Some(Err("offline"))]);
});

Deno.test("mapErr() maps the error and passes a success through", () => {
	// Given: a succeeding and a failing recovery
	// When: mapping each one's error
	const mapped = [ok, failing].map((recovery) => {
		return value(
			run(
				mapErr(recovery, (e) => e.length),
				"app.json",
			),
		);
	});

	// Then: only the error changed
	assertEquals(mapped, [Some(Ok(80)), Some(Err(7))]);
});

Deno.test("andThen() runs the next step on the residue, and skips it on failure", () => {
	// Given: a step that rejects privileged ports, and a log of its runs
	const seen: number[] = [];
	const checked = (recovery: Recovery<string, number, string>) => {
		return andThen(recovery, (port) => {
			seen.push(port);
			return resolved<Outcome<string, string>>(
				port > 1024 ? Ok(`:${port}`) : Err("privileged port"),
			);
		});
	};

	// When: it follows a success, a high port, and a failure
	const low = value(run(checked(ok), "app.json"));
	const high = value(run(checked(succeed(8080)), "app.json"));
	const failed = value(run(checked(failing), "app.json"));

	// Then: the step decided the first two, and never ran for the failure
	assertEquals(low, Some(Err("privileged port")));
	assertEquals(high, Some(Ok(":8080")));
	assertEquals(failed, Some(Err("offline")));
	assertEquals(seen, [80, 8080]);
});

Deno.test("andThen() waits for an async next step", async () => {
	// Given: a next step that settles later
	const { vow, resolve } = vowWithResolver<Outcome<number, string>>();
	const chained = andThen(ok, () => vow);

	// When: it is run, then the step settles
	const result = run(chained, "app.json");
	resolve(Ok(1));

	// Then: the step's result is the composite's
	assertEquals(await wait(result), Ok(1));
});

Deno.test("mapInput() adapts the recovery to another value type", () => {
	// Given: a recovery of paths, and the values it should repair
	const seen: string[] = [];
	const byPath = new Recovery((path: string) => {
		seen.push(path);
		return resolved(Ok<number, never>(path.length));
	});
	const byFile = mapInput(
		byPath,
		(file: { readonly path: string }) => file.path,
	);

	// When: the adapted recovery runs on a file
	const result = value(run(byFile, { path: "app.json" }));

	// Then: the original saw the adapted value
	assertEquals(result, Some(Ok(8)));
	assertEquals(seen, ["app.json"]);
});

Deno.test("inspect() sees each residue and passes the result on", () => {
	// Given: a log
	const seen: number[] = [];

	// When: a succeeding and a failing recovery are inspected and run
	const results = [ok, failing].map((recovery) => {
		return value(
			run(
				inspect(recovery, (port) => seen.push(port)),
				"app.json",
			),
		);
	});

	// Then: it saw the one residue, and both results are unchanged
	assertEquals(seen, [80]);
	assertEquals(results, [Some(Ok(80)), Some(Err("offline"))]);
});

Deno.test("inspectErr() sees each error and passes the result on", () => {
	// Given: a log
	const seen: string[] = [];

	// When: a succeeding and a failing recovery are inspected and run
	const results = [ok, failing].map((recovery) => {
		return value(
			run(
				inspectErr(recovery, (e) => seen.push(e)),
				"app.json",
			),
		);
	});

	// Then: it saw the one error, and both results are unchanged
	assertEquals(seen, ["offline"]);
	assertEquals(results, [Some(Ok(80)), Some(Err("offline"))]);
});

Deno.test("map(), mapErr(), andThen() and the inspectors pass a Panicked outcome through", () => {
	// Given: a recovery whose outcome is Panicked, and counting steps
	const bug = new Error("bad cache");
	const broken = new Recovery((_: string) => {
		return resolved(Panicked<number, string, unknown>(bug));
	});
	let calls = 0;
	const count = (): void => {
		calls += 1;
	};

	// When: each transform is run on it
	const vows: Vow<Outcome<number, unknown, unknown>>[] = [
		run(
			map(broken, (port) => port + 1),
			"app.json",
		),
		run(
			mapErr(broken, (error) => error.length),
			"app.json",
		),
		run(
			andThen(broken, (port) => {
				count();
				return resolved(Ok<number, string, unknown>(port));
			}),
			"app.json",
		),
		run(inspect(broken, count), "app.json"),
		run(inspectErr(broken, count), "app.json"),
	];
	const results = vows.map((vow) => value(vow));

	// Then: each is the same Panicked outcome, and no step ran
	assertEquals(results, Array(5).fill(Some(Panicked(bug))));
	assertEquals(calls, 0);
});
