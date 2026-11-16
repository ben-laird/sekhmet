import type { StepCommand } from "./types.ts";

/**
 * How a step's command ended:
 * - `exited`: it exited (or died) on its own; `output` says how
 * - `timed-out`: it outlived its timeout, so its process tree was killed;
 *   `output` holds what it printed until then
 */
export type CommandRun =
	| { kind: "exited"; output: Deno.CommandOutput }
	| { kind: "timed-out"; afterMs: number; output: Deno.CommandOutput };

/**
 * Builds the `Deno.Command` for a {@linkcode StepCommand}. `env` is added to
 * the spawned process only; the runner's own env is never touched.
 *
 * The process gets no stdin, so it can never block on the terminal, and
 * leads its own process group (`detached`), so its whole tree can be killed
 * at once (see {@linkcode runCommand}).
 *
 * @param options.command - The command to build
 * @param options.env - Extra env vars for the process (default: none)
 * @returns The command, ready to spawn
 */
export function spawnCommand({
	command,
	env = {},
}: {
	command: StepCommand;
	env?: Record<string, string>;
}): Deno.Command {
	return new Deno.Command(command.program, {
		args: [...(command.args ?? [])],
		env,
		stdin: "null",
		stdout: "piped",
		stderr: "piped",
		detached: true,
		...(command.cwd === undefined ? {} : { cwd: command.cwd }),
	});
}

/**
 * Runs a {@linkcode StepCommand} to completion, or until `timeoutMs` passes.
 *
 * On timeout it SIGKILLs the command's process group: the command and every
 * process it started that stayed in its group (POSIX only). If the runner
 * itself is stopped by SIGINT or SIGTERM while commands run, it forwards the
 * signal to their groups before exiting, so no step outlives the runner.
 *
 * @param options.command - The command to run
 * @param options.env - Extra env vars for the process (default: none)
 * @param options.timeoutMs - How long it may run (default: no limit)
 * @returns How the command ended, with its output
 */
export async function runCommand({
	command,
	env = {},
	timeoutMs,
}: {
	command: StepCommand;
	env?: Record<string, string>;
	timeoutMs?: number | undefined;
}): Promise<CommandRun> {
	const child = spawnCommand({ command, env }).spawn();
	const untrack = trackGroup(child.pid);
	try {
		const output = child.output();
		if (timeoutMs === undefined) {
			return { kind: "exited", output: await output };
		}

		let timer: ReturnType<typeof setTimeout> | undefined;
		const deadline = new Promise<"timed-out">((resolve) => {
			timer = setTimeout(() => resolve("timed-out"), timeoutMs);
		});
		const first = await Promise.race([
			output.then(() => "exited" as const),
			deadline,
		]);
		clearTimeout(timer);

		if (first === "exited") return { kind: "exited", output: await output };
		killGroup({ pgid: child.pid, signal: "SIGKILL" });
		return { kind: "timed-out", afterMs: timeoutMs, output: await output };
	} finally {
		untrack();
	}
}

/** The signals the runner forwards, with their numbers for the exit code. */
const FORWARDED_SIGNALS: ReadonlyArray<readonly [Deno.Signal, number]> = [
	["SIGINT", 2],
	["SIGTERM", 15],
];

/** Process groups of the commands running now. */
const runningGroups = new Set<number>();

/** One listener per forwarded signal, installed while any command runs. */
const forwarders = new Map<Deno.Signal, () => void>();

/**
 * Records a running command's process group, and returns the function that
 * forgets it once the command ends.
 */
function trackGroup(pgid: number): () => void {
	runningGroups.add(pgid);
	if (runningGroups.size === 1) installForwarders();
	return () => {
		runningGroups.delete(pgid);
		if (runningGroups.size === 0) removeForwarders();
	};
}

function installForwarders(): void {
	for (const [signal, number] of FORWARDED_SIGNALS) {
		const forward = (): void => {
			for (const pgid of runningGroups) killGroup({ pgid, signal });
			Deno.exit(128 + number);
		};
		forwarders.set(signal, forward);
		Deno.addSignalListener(signal, forward);
	}
}

function removeForwarders(): void {
	for (const [signal, forward] of forwarders) {
		Deno.removeSignalListener(signal, forward);
	}
	forwarders.clear();
}

/**
 * Signals every process in a group. A group whose processes have all exited
 * is already gone, which is the goal, so that is not an error.
 */
function killGroup({
	pgid,
	signal,
}: {
	pgid: number;
	signal: Deno.Signal;
}): void {
	try {
		Deno.kill(-pgid, signal);
	} catch (error) {
		if (!(error instanceof Deno.errors.NotFound)) throw error;
	}
}
