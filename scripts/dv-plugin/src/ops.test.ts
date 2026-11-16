import { Err, Ok } from "@sekhmet/enum/result/mini";
import { assertEquals, assertStringIncludes } from "@std/assert";
import { type Io, runOp } from "./ops.ts";

function fakeIo({
	env,
	files,
	stdin = "null",
}: {
	env: Record<string, string>;
	files: Map<string, string>;
	stdin?: string;
}): Io {
	return {
		env,
		readStdin: () => Promise.resolve(stdin),
		log: () => {},
		readTextFile: (path) => {
			const text = files.get(path);
			return Promise.resolve(text === undefined ? Err("not found") : Ok(text));
		},
		writeTextFile: ({ path, text }) => {
			files.set(path, text);
			return Promise.resolve(Ok(undefined));
		},
		run: () => Promise.resolve(Err("no subprocesses in tests")),
		findFiles: ({ root }) =>
			Promise.resolve(
				[...files.keys()].filter((path) => path.startsWith(`${root}/`)),
			),
	};
}

Deno.test("discover skips publish:false members", async () => {
	// Given: a published package and a publish:false script under the glob
	const files = new Map([
		["/repo/packages/enum/deno.json", `{ "name": "@sekhmet/enum" }`],
		[
			"/repo/packages/tool/deno.json",
			`{ "name": "@sekhmet/tool", "publish": false }`,
		],
	]);
	const io = fakeIo({
		env: { DV_REPO_ROOT: "/repo", DV_DISCOVER_GLOB: "packages/*" },
		files,
	});

	// When: discovering
	const outcome = await runOp({ op: "discover", io });

	// Then: only the publishing package is reported
	assertEquals(outcome, {
		exitCode: 0,
		response: {
			packages: [{ name: "@sekhmet/enum", path: "packages/enum" }],
		},
	});
});

Deno.test("write-version resolves a relative package path against the repo root", async () => {
	// Given: dv passes a repo-relative package path
	const files = new Map([
		["/repo/packages/enum/deno.json", `{\n\t"version": "0.1.0"\n}\n`],
	]);
	const io = fakeIo({
		env: {
			DV_REPO_ROOT: "/repo",
			DV_PACKAGE_NAME: "@sekhmet/enum",
			DV_PACKAGE_PATH: "packages/enum",
			DV_NEW_VERSION: "0.2.0",
		},
		files,
	});

	// When: writing the version
	const outcome = await runOp({ op: "write-version", io });

	// Then: the manifest under the root is edited in place
	assertEquals(outcome, { exitCode: 0, response: { ok: true } });
	assertEquals(
		files.get("/repo/packages/enum/deno.json"),
		`{\n\t"version": "0.2.0"\n}\n`,
	);
});

Deno.test("an op with a missing environment fails with a structured error", async () => {
	// Given: no DV_* variables
	const io = fakeIo({ env: {}, files: new Map() });

	// When: reading a version
	const outcome = await runOp({ op: "read-version", io });

	// Then: dv gets ok:false and a non-zero exit
	assertEquals(outcome.exitCode, 1);
	assertEquals(outcome.response.ok, false);
	assertStringIncludes(String(outcome.response.error), "invalid environment");
});

Deno.test("release reports a spawn failure as data with exit 0", async () => {
	// Given: a release where deno cannot be spawned
	const io = fakeIo({
		env: {
			DV_REPO_ROOT: "/repo",
			DV_PACKAGE_NAME: "@sekhmet/enum",
			DV_PACKAGE_PATH: "packages/enum",
			DV_NEW_VERSION: "0.1.0",
		},
		files: new Map(),
	});

	// When: releasing
	const outcome = await runOp({ op: "release", io });

	// Then: the failure is a release outcome, not a plugin error
	assertEquals(outcome.exitCode, 0);
	assertEquals(outcome.response.ok, false);
	assertEquals(outcome.response.published, false);
});
