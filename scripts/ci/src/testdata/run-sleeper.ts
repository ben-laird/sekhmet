// A runner for process.test.ts: runs a sleeping command (with a sleeping
// grandchild) and prints both pids, then waits to be signalled.
import { runCommand } from "../process.ts";

const pidFile = await Deno.makeTempFile({ prefix: "ci-run-sleeper-" });
const running = runCommand({
	command: {
		program: "sh",
		args: ["-c", 'sleep 30 & echo "$$ $!" > "$0"; wait', pidFile],
	},
	timeoutMs: 60_000,
});

let pids = "";
for (let attempt = 0; attempt < 500 && pids === ""; attempt++) {
	await new Promise((resolve) => setTimeout(resolve, 10));
	pids = (await Deno.readTextFile(pidFile)).trim();
}
await Deno.remove(pidFile);
console.log(pids);
await running;
