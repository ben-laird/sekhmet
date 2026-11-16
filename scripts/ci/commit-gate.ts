// deno-coverage-ignore-file
/**
 * The commit gate's hook entry point, run by `.githooks/pre-commit` and
 * `.githooks/pre-merge-commit`: refuses a commit whose staged tree has no
 * green `deno task ci` run (see `src/green-run.ts`). `pre-merge-commit`
 * passes `--merge`.
 *
 * @module
 */
import {
	greenMarkerPath,
	readGreenMarker,
	stagedPaths,
	stagedTree,
} from "./src/git.ts";
import {
	type CommitVerdict,
	commitVerdict,
	type Result,
} from "./src/green-run.ts";

/**
 * Decides on the commit git is making, and prints why when it is refused.
 *
 * @param args - The hook's arguments: `--merge` for a merge commit
 * @returns The hook's exit code: 0 lets the commit through
 */
export async function main(args: readonly string[]): Promise<number> {
	const verdict = await decide({ merge: args.includes("--merge") });
	if (!verdict.ok) {
		console.error(`commit gate: ${verdict.error}`);
		return 1;
	}
	if (verdict.value.kind === "refuse") {
		console.error(verdict.value.message);
		console.error(
			'(markdown-only commits are exempt; see "Commit gate" in CONTRIBUTING.md)',
		);
		return 1;
	}
	return 0;
}

async function decide({
	merge,
}: {
	merge: boolean;
}): Promise<Result<CommitVerdict>> {
	const [staged, paths, markerPath] = await Promise.all([
		stagedTree(),
		stagedPaths(),
		greenMarkerPath(),
	]);
	if (!staged.ok) return staged;
	if (!paths.ok) return paths;
	if (!markerPath.ok) return markerPath;
	return {
		ok: true,
		value: commitVerdict({
			staged: staged.value,
			green: await readGreenMarker(markerPath.value),
			stagedPaths: paths.value,
			kind: merge ? "merge" : "commit",
		}),
	};
}

if (import.meta.main) {
	Deno.exit(await main(Deno.args));
}
