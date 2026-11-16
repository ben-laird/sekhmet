import { assert, assertEquals } from "@std/assert";
import { fromFileUrl, join } from "@std/path";
import { git, greenMarkerPath, stagedTree } from "./src/git.ts";
import type { Result } from "./src/green-run.ts";

const COMMIT_GATE = fromFileUrl(new URL("./commit-gate.ts", import.meta.url));

function unwrap<T>(result: Result<T>): T {
	if (!result.ok) throw new Error(result.error);
	return result.value;
}

async function run(cwd: string, ...args: string[]): Promise<string> {
	return unwrap(await git({ args, cwd }));
}

/**
 * A repository with one commit whose hooks run the commit gate: the same
 * hooks as `.githooks/`, pointed at this checkout's `commit-gate.ts`.
 */
async function withGatedRepo(
	test: (dir: string) => Promise<void>,
): Promise<void> {
	const dir = await Deno.realPath(
		await Deno.makeTempDir({ prefix: "ci-commit-gate-test-" }),
	);
	try {
		await run(dir, "init", "--quiet", "--initial-branch=main");
		await run(dir, "config", "user.name", "Test");
		await run(dir, "config", "user.email", "test@example.com");
		await run(dir, "config", "commit.gpgsign", "false");
		await Deno.writeTextFile(join(dir, "a.ts"), "export const a = 1;\n");
		await run(dir, "add", ".");
		await run(dir, "commit", "--quiet", "--no-verify", "-m", "init");
		const hooks = join(dir, ".git", "test-hooks");
		await Deno.mkdir(hooks);
		const gate = `exec deno run --quiet --no-prompt --allow-run=git --allow-read "${COMMIT_GATE}"`;
		await Deno.writeTextFile(
			join(hooks, "pre-commit"),
			`#!/bin/sh\n${gate} "$@"\n`,
			{ mode: 0o755 },
		);
		await Deno.writeTextFile(
			join(hooks, "pre-merge-commit"),
			`#!/bin/sh\nexec "$(dirname "$0")/pre-commit" --merge\n`,
			{ mode: 0o755 },
		);
		await run(dir, "config", "core.hooksPath", hooks);
		await test(dir);
	} finally {
		await Deno.remove(dir, { recursive: true });
	}
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
