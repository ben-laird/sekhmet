import { assert, assertEquals } from "@std/assert";
import { fromFileUrl } from "@std/path";
import { runCommand } from "./process.ts";

const decoder = new TextDecoder();

/** Whether a process is still alive (a zombie awaiting its reaper counts as gone). */
function isAlive(pid: number): boolean {
	const { stdout } = new Deno.Command("ps", {
		args: ["-o", "stat=", "-p", String(pid)],
	}).outputSync();
	const stat = decoder.decode(stdout).trim();
	return stat !== "" && !stat.startsWith("Z");
}

Deno.test("runCommand reports a command that exits before its timeout as exited", async () => {
	// Given: a quick command with a generous timeout
	const command = { program: "sh", args: ["-c", "printf done"] };

	// When: running it
	const run = await runCommand({ command, timeoutMs: 10_000 });

	// Then: it exited normally with its output
	assertEquals(run.kind, "exited");
	assertEquals(run.output.success, true);
	assertEquals(decoder.decode(run.output.stdout), "done");
});

Deno.test("runCommand kills a command that outlives its timeout, keeping its output so far", async () => {
	// Given: a command that prints, then sleeps far past a tiny timeout
	const command = { program: "sh", args: ["-c", "echo started; sleep 30"] };
	const started = performance.now();

	// When: running it with a 200 ms timeout
	const run = await runCommand({ command, timeoutMs: 200 });

	// Then: it timed out promptly, was killed, and its partial output survives
	assertEquals(run.kind, "timed-out");
	assert(performance.now() - started < 10_000);
	assertEquals(run.kind === "timed-out" ? run.afterMs : undefined, 200);
	assertEquals(run.output.success, false);
	assertEquals(run.output.signal, "SIGKILL");
	assertEquals(decoder.decode(run.output.stdout), "started\n");
});

Deno.test("runCommand kills a timed-out command's whole process tree, leaving no orphans", async () => {
	// Given: a command whose background grandchild would outlive it and hold its stdout open
	const command = {
		program: "sh",
		args: ["-c", "sleep 30 & echo $!; sleep 30"],
	};

	// When: running it with a 200 ms timeout
	const run = await runCommand({ command, timeoutMs: 200 });

	// Then: the step returned, and the grandchild is gone too
	assertEquals(run.kind, "timed-out");
	const grandchild = Number(decoder.decode(run.output.stdout).trim());
	assert(grandchild > 0);
	assertEquals(isAlive(grandchild), false);
});

Deno.test("runCommand closes the command's stdin so it can never wait on the terminal", async () => {
	// Given: a command that reads stdin to its end
	const command = { program: "sh", args: ["-c", "cat; printf eof"] };

	// When: running it
	const run = await runCommand({ command, timeoutMs: 10_000 });

	// Then: it saw end-of-input at once instead of blocking
	assertEquals(run.kind, "exited");
	assertEquals(decoder.decode(run.output.stdout), "eof");
});

Deno.test("a runner stopped by a signal takes its running commands' process trees with it", async () => {
	// Given: a runner process whose command (and its grandchild) sleeps
	const runner = new Deno.Command(Deno.execPath(), {
		args: [
			"run",
			"--no-prompt",
			"--allow-run",
			"--allow-read",
			"--allow-write",
			fromFileUrl(new URL("./testdata/run-sleeper.ts", import.meta.url)),
		],
		stdout: "piped",
		stderr: "piped",
	}).spawn();
	const reader = runner.stdout.pipeThrough(new TextDecoderStream()).getReader();
	let printed = "";
	while (!printed.includes("\n")) {
		const { value, done } = await reader.read();
		if (done) break;
		printed += value;
	}
	const pids = printed.trim().split(" ").map(Number);

	// When: the runner is sent SIGTERM, as a cancelled CI job or Ctrl-C would
	runner.kill("SIGTERM");
	const status = await runner.status;
	await reader.cancel();
	await runner.stderr.cancel();

	// Then: it exits with 128 + SIGTERM, and every process it started is gone
	assertEquals(status.code, 143);
	assertEquals(pids.length, 2);
	for (const pid of pids) assertEquals(isAlive(pid), false);
});
