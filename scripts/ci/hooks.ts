// deno-coverage-ignore-file
/**
 * `deno task hooks`: turns the commit gate on for this clone and every
 * worktree of it, by installing shims into the shared hooks directory and
 * unsetting the gate's old `core.hooksPath` (see `src/hooks.ts`). Rerunning
 * it is harmless.
 *
 * @module
 */
import {
	hooksPath,
	readGateHooks,
	sharedHooksDir,
	unsetHooksPath,
	writeHook,
} from "./src/git.ts";
import type { Result } from "./src/green-run.ts";
import { HOOK_NAMES, hookPlan, hooksPathPlan } from "./src/hooks.ts";

export type { Result };

/**
 * Installs the commit gate's shims and unsets the gate's old
 * `core.hooksPath`. Plans everything first, so a refusal changes nothing.
 *
 * @param options.cwd - A directory in the repository (default: the cwd)
 * @returns What it did, one line each, or why it refused
 */
export async function installHooks({
	cwd,
}: {
	cwd?: string;
} = {}): Promise<Result<string[]>> {
	const at = cwd === undefined ? {} : { cwd };
	const pathPlan = hooksPathPlan(await hooksPath(at));
	const dir = await sharedHooksDir(at);
	if (!dir.ok) return dir;
	const existing = await readGateHooks(dir.value);
	if (!existing.ok) return existing;
	const plans = HOOK_NAMES.map((name) =>
		hookPlan({ name, existing: existing.value[name] }),
	);
	const refusals = [
		...(pathPlan.kind === "refuse" ? [pathPlan.reason] : []),
		...plans.flatMap((plan) => (plan.kind === "refuse" ? [plan.reason] : [])),
	];
	if (refusals.length > 0) return { ok: false, error: refusals.join("\n") };

	const done: string[] = [];
	for (const plan of plans) {
		if (plan.kind !== "write") {
			done.push(`${dir.value}/${plan.name}: already current`);
			continue;
		}
		const written = await writeHook({
			dir: dir.value,
			name: plan.name,
			script: plan.script,
		});
		if (!written.ok) return written;
		done.push(`${dir.value}/${plan.name}: installed`);
	}
	if (pathPlan.kind === "unset") {
		const unset = await unsetHooksPath(at);
		if (!unset.ok) return unset;
		done.push("core.hooksPath: unset");
	}
	return { ok: true, value: done };
}

if (import.meta.main) {
	const result = await installHooks();
	if (!result.ok) {
		console.error(`deno task hooks: ${result.error}`);
		Deno.exit(1);
	}
	for (const line of result.value) console.log(line);
	console.log("commit gate on: each worktree runs its branch's .githooks/");
}
