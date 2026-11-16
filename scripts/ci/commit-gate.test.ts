import { assert, assertEquals } from "@std/assert";
import { fromFileUrl, join } from "@std/path";
import { installHooks } from "./hooks.ts";
import {
	git,
	greenMarkerPath,
	hooksPath,
	readGateHooks,
	sharedHooksDir,
	stagedTree,
} from "./src/git.ts";
import type { Result } from "./src/green-run.ts";
import { shimScript } from "./src/hooks.ts";

const COMMIT_GATE = fromFileUrl(new URL("./commit-gate.ts", import.meta.url));

function unwrap<T>(result: Result<T>): T {
	if (!result.ok) throw new Error(result.error);
	return result.value;
}

async function run(cwd: string, ...args: string[]): Promise<string> {
	return unwrap(await git({ args, cwd }));
}

const PRE_MERGE_COMMIT = fromFileUrl(
	new URL("../../.githooks/pre-merge-commit", import.meta.url),
);

/**
 * A repository with one commit that carries the commit gate's `.githooks/`
 * (its `pre-commit` pointed at this checkout's `commit-gate.ts`), turned on
 * by {@linkcode installHooks} as `deno task hooks` does. `before` runs
 * first, e.g. to set an old `core.hooksPath`. The repository is `repo/` in
 * a temp dir whose other entries are free for linked worktrees.
 */
async function withGatedRepo(
	test: (dir: string) => Promise<void>,
	before: (dir: string) => Promise<void> = async () => {},
): Promise<void> {
	const parent = await Deno.realPath(
		await Deno.makeTempDir({ prefix: "ci-commit-gate-test-" }),
	);
	const dir = join(parent, "repo");
	try {
		await Deno.mkdir(dir);
		await run(dir, "init", "--quiet", "--initial-branch=main");
		await run(dir, "config", "user.name", "Test");
		await run(dir, "config", "user.email", "test@example.com");
		await run(dir, "config", "commit.gpgsign", "false");
		await Deno.writeTextFile(join(dir, "a.ts"), "export const a = 1;\n");
		const hooks = join(dir, ".githooks");
		await Deno.mkdir(hooks);
		const gate = `exec deno run --quiet --no-prompt --allow-run=git --allow-read "${COMMIT_GATE}"`;
		await Deno.writeTextFile(
			join(hooks, "pre-commit"),
			`#!/bin/sh\n${gate} "$@"\n`,
			{ mode: 0o755 },
		);
		await Deno.copyFile(PRE_MERGE_COMMIT, join(hooks, "pre-merge-commit"));
		await Deno.chmod(join(hooks, "pre-merge-commit"), 0o755);
		await run(dir, "add", ".");
		await run(dir, "commit", "--quiet", "--no-verify", "-m", "init");
		await before(dir);
		unwrap(await installHooks({ cwd: dir }));
		await test(dir);
	} finally {
		await Deno.remove(parent, { recursive: true });
	}
}

/** Adds a linked worktree beside the repository, on a new branch. */
async function addWorktree({
	dir,
	name,
	from,
}: {
	dir: string;
	name: string;
	from: string;
}): Promise<string> {
	const worktree = join(dir, "..", name);
	await run(dir, "worktree", "add", "--quiet", "-b", name, worktree, from);
	return worktree;
}

/** Commits a branch off main that drops `.githooks/`: an ungated branch. */
async function ungatedBranch(dir: string): Promise<void> {
	await run(dir, "switch", "--quiet", "-c", "ungated");
	await run(dir, "rm", "--quiet", "-r", ".githooks");
	await run(dir, "commit", "--quiet", "--no-verify", "-m", "drop hooks");
	await run(dir, "switch", "--quiet", "main");
}

/** Stages a code change to `a.ts` in a worktree. */
async function stageCodeChange(worktree: string): Promise<void> {
	await Deno.writeTextFile(join(worktree, "a.ts"), "export const a = 9;\n");
	await run(worktree, "add", "a.ts");
}

/** Records a green run for the staged tree, as a passing gate would. */
async function markGreen(dir: string): Promise<void> {
	const path = unwrap(await greenMarkerPath({ cwd: dir }));
	const tree = unwrap(await stagedTree({ cwd: dir }));
	await Deno.writeTextFile(path, `${tree}\n`);
}

async function head(dir: string): Promise<string> {
	return (await run(dir, "rev-parse", "HEAD")).trim();
}

Deno.test("the pre-commit hook refuses a code commit with no green run, and lets it through once the staged tree is green", async () => {
	await withGatedRepo(async (dir) => {
		// Given: a staged code change, with a green run for an older tree
		await markGreen(dir);
		await Deno.writeTextFile(join(dir, "a.ts"), "export const a = 2;\n");
		await run(dir, "add", "a.ts");
		const before = await head(dir);

		// When: committing it, then committing again after a green run
		const refused = await git({ args: ["commit", "-m", "x"], cwd: dir });
		const afterRefusal = await head(dir);
		await markGreen(dir);
		const accepted = await git({ args: ["commit", "-m", "x"], cwd: dir });

		// Then: the first is refused, naming the staged tree; the second lands
		assertEquals(refused.ok, false);
		assert(
			!refused.ok && refused.error.includes("has no green `deno task ci` run"),
		);
		assertEquals(afterRefusal, before);
		assertEquals(accepted.ok, true);
		assert((await head(dir)) !== before);
	});
});

Deno.test("the pre-commit hook lets a markdown-only commit through without a green run", async () => {
	await withGatedRepo(async (dir) => {
		// Given: only a markdown file staged, and no green run
		await Deno.writeTextFile(join(dir, "README.md"), "# Notes\n");
		await run(dir, "add", "README.md");

		// When: committing it
		const committed = await git({ args: ["commit", "-m", "docs"], cwd: dir });

		// Then: it lands
		assertEquals(committed.ok, true);
	});
});

Deno.test("the pre-commit hook refuses a markdown-only commit that edits a runnable code block, and lets prose edits around it through", async () => {
	await withGatedRepo(async (dir) => {
		// Given: a committed doc with prose and a ts block
		const fence = "```";
		const doc = (prose: string, code: string) =>
			`# Guide\n\n${prose}\n\n${fence}ts\n${code}\n${fence}\n`;
		const path = join(dir, "guide.md");
		await Deno.writeTextFile(path, doc("Old prose.", "const a = 1;"));
		await run(dir, "add", "guide.md");
		await run(dir, "commit", "--quiet", "--no-verify", "-m", "guide");

		// When: committing a prose edit, then an edit inside the ts block
		await Deno.writeTextFile(path, doc("New prose.", "const a = 1;"));
		await run(dir, "add", "guide.md");
		const prose = await git({ args: ["commit", "-m", "prose"], cwd: dir });
		await Deno.writeTextFile(path, doc("New prose.", "const a = 2;"));
		await run(dir, "add", "guide.md");
		const code = await git({ args: ["commit", "-m", "code"], cwd: dir });

		// Then: the prose edit lands; the code edit is refused, saying why
		assertEquals(prose.ok, true);
		assertEquals(code.ok, false);
		assert(
			!code.ok &&
				code.error.includes(
					"the change to guide.md touches code blocks that `deno test --doc` runs",
				),
		);
	});
});

Deno.test("the hook judges the index git commits, so `git commit -a` needs a green run for the tree it stages", async () => {
	await withGatedRepo(async (dir) => {
		// Given: a green run for the staged tree, then an unstaged edit
		await markGreen(dir);
		await Deno.writeTextFile(join(dir, "a.ts"), "export const a = 3;\n");

		// When: committing everything with -a
		const committed = await git({ args: ["commit", "-am", "x"], cwd: dir });

		// Then: it is refused: the tree -a commits never had a green run
		assertEquals(committed.ok, false);
	});
});

Deno.test("the pre-merge-commit hook refuses an ungated merge, leaving it staged to gate and commit", async () => {
	await withGatedRepo(async (dir) => {
		// Given: a side branch with a code change, merged with --no-ff
		await run(dir, "switch", "--quiet", "-c", "side");
		await Deno.writeTextFile(join(dir, "b.ts"), "export const b = 1;\n");
		await run(dir, "add", "b.ts");
		await run(dir, "commit", "--quiet", "--no-verify", "-m", "side");
		await run(dir, "switch", "--quiet", "main");
		const before = await head(dir);

		// When: merging with no green run, then gating the staged merge and
		// committing it
		const merged = await git({
			args: ["merge", "--no-ff", "-m", "merge side", "side"],
			cwd: dir,
		});
		const afterRefusal = await head(dir);
		await markGreen(dir);
		const committed = await git({ args: ["commit", "--no-edit"], cwd: dir });

		// Then: the merge commit is refused with merge guidance; once the
		// staged merge is green, `git commit` makes the merge commit
		assertEquals(merged.ok, false);
		assert(!merged.ok && merged.error.includes("the merge is staged"));
		assertEquals(afterRefusal, before);
		assertEquals(committed.ok, true);
		const parents = (await run(dir, "rev-list", "--parents", "-n1", "HEAD"))
			.trim()
			.split(" ");
		assertEquals(parents.length, 3);
	});
});

Deno.test("a linked worktree on a branch with .githooks/ runs its own gate", async () => {
	await withGatedRepo(async (dir) => {
		// Given: a linked worktree on a gated branch, with a code change staged
		const worktree = await addWorktree({ dir, name: "feat", from: "main" });
		await stageCodeChange(worktree);

		// When: committing it with no green run, then after one
		const refused = await git({ args: ["commit", "-m", "x"], cwd: worktree });
		await markGreen(worktree);
		const accepted = await git({ args: ["commit", "-m", "x"], cwd: worktree });

		// Then: the gate refuses, then lets it through
		assertEquals(refused.ok, false);
		assert(
			!refused.ok && refused.error.includes("has no green `deno task ci` run"),
		);
		assertEquals(accepted.ok, true);
	});
});

Deno.test("a linked worktree on a branch without .githooks/ is not gated", async () => {
	await withGatedRepo(async (dir) => {
		// Given: a linked worktree on a branch that has no .githooks/
		await ungatedBranch(dir);
		const worktree = await addWorktree({ dir, name: "wt", from: "ungated" });
		await stageCodeChange(worktree);

		// When: committing a code change with no green run
		const committed = await git({
			args: ["commit", "-m", "x"],
			cwd: worktree,
		});

		// Then: it lands
		assertEquals(committed.ok, true);
	});
});

Deno.test("deno task hooks unsets an absolutized core.hooksPath, so a worktree runs its own gate whatever the main checkout has out", async () => {
	await withGatedRepo(
		async (dir) => {
			// Given: the main checkout on an ungated branch (whose hooks the old
			// setup ran everywhere), and a worktree on a gated branch
			await ungatedBranch(dir);
			await run(dir, "switch", "--quiet", "ungated");
			const worktree = await addWorktree({ dir, name: "feat", from: "main" });
			await stageCodeChange(worktree);

			// When: committing in the worktree with no green run
			const refused = await git({
				args: ["commit", "-m", "x"],
				cwd: worktree,
			});

			// Then: core.hooksPath is gone and the worktree's gate refuses
			assertEquals(await hooksPath({ cwd: dir }), undefined);
			assertEquals(refused.ok, false);
		},
		async (dir) => {
			// Given (before `deno task hooks`): the absolutized old setting
			await run(dir, "config", "core.hooksPath", join(dir, ".githooks"));
		},
	);
});

Deno.test("deno task hooks is idempotent, and refuses to replace a hook it did not install or a foreign core.hooksPath", async () => {
	await withGatedRepo(async (dir) => {
		// Given: a gated repository whose shims are installed
		const hooksDir = unwrap(await sharedHooksDir({ cwd: dir }));

		// When: rerunning, then with a foreign pre-merge-commit, then with a
		// foreign core.hooksPath
		const again = await installHooks({ cwd: dir });
		await Deno.writeTextFile(
			join(hooksDir, "pre-merge-commit"),
			"#!/bin/sh\nmine\n",
		);
		const foreignHook = await installHooks({ cwd: dir });
		const foreignHookText = await Deno.readTextFile(
			join(hooksDir, "pre-merge-commit"),
		);
		await Deno.writeTextFile(
			join(hooksDir, "pre-merge-commit"),
			shimScript("pre-merge-commit"),
		);
		await run(dir, "config", "core.hooksPath", ".husky");
		const foreignPath = await installHooks({ cwd: dir });

		// Then: the rerun changes nothing; each refusal names its cause and
		// leaves the owner's hook and setting alone
		assertEquals(again.ok, true);
		assert(again.ok && again.value.every((line) => line.endsWith("current")));
		assert(!foreignHook.ok && foreignHook.error.includes("pre-merge-commit"));
		assertEquals(foreignHookText, "#!/bin/sh\nmine\n");
		assert(!foreignPath.ok && foreignPath.error.includes(".husky"));
		assertEquals(await hooksPath({ cwd: dir }), ".husky");
		const hooks = unwrap(await readGateHooks(hooksDir));
		assertEquals(hooks["pre-commit"], shimScript("pre-commit"));
	});
});
