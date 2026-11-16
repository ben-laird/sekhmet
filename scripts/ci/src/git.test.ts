import { assert, assertEquals, assertNotEquals } from "@std/assert";
import { join } from "@std/path";
import {
	git,
	greenMarkerPath,
	hooksPath,
	readGreenMarker,
	stagedPaths,
	stagedSnapshot,
	stagedTree,
	writeGreenMarker,
} from "./git.ts";
import { parseTreeId, type Result } from "./green-run.ts";

function unwrap<T>(result: Result<T>): T {
	if (!result.ok) throw new Error(result.error);
	return result.value;
}

/** Runs git in `cwd`, panicking on failure: test setup only. */
async function run(cwd: string, ...args: string[]): Promise<string> {
	return unwrap(await git({ args, cwd }));
}

/** A fresh repository with one commit of `a.ts`, and `ignored/` ignored. */
async function withRepo(test: (dir: string) => Promise<void>): Promise<void> {
	const dir = await Deno.realPath(
		await Deno.makeTempDir({ prefix: "ci-git-test-" }),
	);
	try {
		await run(dir, "init", "--quiet", "--initial-branch=main");
		await run(dir, "config", "user.name", "Test");
		await run(dir, "config", "user.email", "test@example.com");
		await run(dir, "config", "commit.gpgsign", "false");
		await Deno.writeTextFile(join(dir, "a.ts"), "export const a = 1;\n");
		await Deno.writeTextFile(join(dir, ".gitignore"), "ignored/\n");
		await run(dir, "add", ".");
		await run(dir, "commit", "--quiet", "--no-verify", "-m", "init");
		await test(dir);
	} finally {
		await Deno.remove(dir, { recursive: true });
	}
}

Deno.test("stagedSnapshot of a clean checkout is HEAD's tree with no drift", async () => {
	await withRepo(async (dir) => {
		// Given: a freshly committed repository
		const headTree = parseTreeId(await run(dir, "rev-parse", "HEAD^{tree}"));

		// When: taking a snapshot
		const snapshot = unwrap(await stagedSnapshot({ cwd: dir }));

		// Then: the staged tree is HEAD's, and nothing has drifted
		assertEquals<unknown>(snapshot, {
			tree: headTree,
			unstaged: [],
			untracked: [],
		});
	});
});

Deno.test("stagedSnapshot sees staged, unstaged, untracked and ignored files as git does", async () => {
	await withRepo(async (dir) => {
		// Given: a staged edit, then an unstaged edit on top, an untracked
		// file and an ignored one
		const headTree = unwrap(await stagedTree({ cwd: dir }));
		await Deno.writeTextFile(join(dir, "a.ts"), "export const a = 2;\n");
		await run(dir, "add", "a.ts");
		const stagedOnly = unwrap(await stagedSnapshot({ cwd: dir }));
		await Deno.writeTextFile(join(dir, "a.ts"), "export const a = 3;\n");
		await Deno.mkdir(join(dir, "new"));
		await Deno.writeTextFile(join(dir, "new", "b.ts"), "");
		await Deno.mkdir(join(dir, "ignored"));
		await Deno.writeTextFile(join(dir, "ignored", "c.ts"), "");

		// When: taking a snapshot
		const drifted = unwrap(await stagedSnapshot({ cwd: dir }));

		// Then: staging changes the tree without drift; the later edit and the
		// untracked file are drift; the ignored file is not
		assertNotEquals(stagedOnly.tree, headTree);
		assertEquals(stagedOnly.unstaged, []);
		assertEquals(stagedOnly.untracked, []);
		assertEquals(drifted, {
			tree: stagedOnly.tree,
			unstaged: ["a.ts"],
			untracked: ["new/b.ts"],
		});
	});
});

Deno.test("greenMarkerPath gives each linked worktree its own marker", async () => {
	await withRepo(async (dir) => {
		// Given: a linked worktree of the repository
		const linked = `${dir}-linked`;
		await run(dir, "worktree", "add", "--quiet", "-b", "side", linked);
		try {
			// When: resolving the marker path in each
			const main = unwrap(await greenMarkerPath({ cwd: dir }));
			const side = unwrap(await greenMarkerPath({ cwd: linked }));

			// Then: the main checkout's is in .git, the linked one's in its own
			// git dir
			assertEquals(main, join(dir, ".git", "ci-green"));
			assert(
				side.startsWith(join(dir, ".git", "worktrees")),
				`unexpected marker path ${side}`,
			);
			assertNotEquals(side, main);
		} finally {
			await run(dir, "worktree", "remove", "--force", linked);
		}
	});
});

Deno.test("the green marker round-trips a tree id, and reads as none when absent or malformed", async () => {
	await withRepo(async (dir) => {
		// Given: the repository's marker path and staged tree
		const path = unwrap(await greenMarkerPath({ cwd: dir }));
		const tree = unwrap(await stagedTree({ cwd: dir }));

		// When: reading before writing, writing, then reading again
		const absent = await readGreenMarker(path);
		const written = await writeGreenMarker({ path, tree });
		const read = await readGreenMarker(path);
		await Deno.writeTextFile(path, "garbage\n");
		const malformed = await readGreenMarker(path);

		// Then: only a written id reads back
		assertEquals(absent, undefined);
		assertEquals(written, { ok: true, value: undefined });
		assertEquals(read, tree);
		assertEquals(malformed, undefined);
	});
});

Deno.test("writeGreenMarker returns an error value when the marker cannot be written", async () => {
	await withRepo(async (dir) => {
		// Given: a marker path inside a directory that does not exist
		const tree = unwrap(await stagedTree({ cwd: dir }));
		const path = join(dir, "missing", "ci-green");

		// When: writing it
		const written = await writeGreenMarker({ path, tree });

		// Then: the failure is a value, not a throw
		assertEquals(written.ok, false);
	});
});

Deno.test("stagedPaths counts both sides of a staged rename, and every path on an unborn branch", async () => {
	await withRepo(async (dir) => {
		// Given: a.ts renamed to a.md and staged
		await run(dir, "mv", "a.ts", "a.md");

		// When: listing the staged paths
		const paths = unwrap(await stagedPaths({ cwd: dir }));

		// Then: the rename's source counts too, so it is not markdown-only
		assertEquals(paths.toSorted(), ["a.md", "a.ts"]);
	});

	const unborn = await Deno.makeTempDir({ prefix: "ci-git-test-unborn-" });
	try {
		// Given: a repository with no commit yet and one staged file
		await run(unborn, "init", "--quiet");
		await Deno.writeTextFile(join(unborn, "README.md"), "# x\n");
		await run(unborn, "add", "README.md");

		// When: listing the staged paths
		const paths = unwrap(await stagedPaths({ cwd: unborn }));

		// Then: the staged file is listed
		assertEquals(paths, ["README.md"]);
	} finally {
		await Deno.remove(unborn, { recursive: true });
	}
});

Deno.test("hooksPath reads core.hooksPath, and is undefined when it is unset", async () => {
	await withRepo(async (dir) => {
		// Given: a repository without, then with, a hooks path
		const unset = await hooksPath({ cwd: dir });
		await run(dir, "config", "core.hooksPath", ".githooks");

		// When: reading it again
		const set = await hooksPath({ cwd: dir });

		// Then: it is undefined, then the configured path
		assertEquals(unset, undefined);
		assertEquals(set, ".githooks");
	});
});

Deno.test("git returns an error value naming the command when git fails", async () => {
	// Given: a directory that is not a repository
	const dir = await Deno.makeTempDir({ prefix: "ci-git-test-norepo-" });
	try {
		// When: asking it for the staged tree
		const tree = await stagedTree({ cwd: dir });

		// Then: the failure is a value naming the command
		assertEquals(tree.ok, false);
		assert(!tree.ok && tree.error.startsWith("git write-tree: "));
	} finally {
		await Deno.remove(dir, { recursive: true });
	}
});
