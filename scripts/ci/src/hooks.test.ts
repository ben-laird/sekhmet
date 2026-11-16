import { assert, assertEquals } from "@std/assert";
import {
	HOOK_NAMES,
	hookPlan,
	hooksPathPlan,
	hooksWarning,
	isShim,
	SHIM_MARKER,
	shimScript,
} from "./hooks.ts";

const CURRENT = {
	"pre-commit": shimScript("pre-commit"),
	"pre-merge-commit": shimScript("pre-merge-commit"),
};

Deno.test("shimScript execs the worktree's own .githooks hook with its arguments, and names no absolute path", () => {
	// Given: each gate hook
	for (const name of HOOK_NAMES) {
		// When: building its shim
		const script = shimScript(name);

		// Then: it resolves the worktree at run time, passes "$@" through,
		// falls back to exit 0, and carries the marker
		assert(script.startsWith("#!/bin/sh\n"));
		assert(
			script.includes(
				`hook="$(git rev-parse --show-toplevel)/.githooks/${name}"`,
			),
		);
		assert(script.includes('exec "$hook" "$@"'));
		assert(script.trimEnd().endsWith("exit 0"));
		assert(isShim(script));
		assert(!/\s\/Users\/|\s\/home\//.test(script));
	}
});

Deno.test("isShim recognizes the marker line only", () => {
	// Given: an old shim, a foreign hook, and one that only quotes the marker
	const old = `#!/bin/sh\n${SHIM_MARKER}\nexec true\n`;
	const foreign = "#!/bin/sh\nnpx lint-staged\n";
	const quoting = `#!/bin/sh\necho "${SHIM_MARKER}"\n`;

	// When: asking whether each is a shim
	// Then: only the marker line counts
	assertEquals(isShim(old), true);
	assertEquals(isShim(foreign), false);
	assertEquals(isShim(quoting), false);
});

Deno.test("hookPlan writes the shim where there is none or an old one, leaves a current one, and refuses a foreign hook", () => {
	// Given: an absent, an old-shim, a current-shim and a foreign hook
	const name = "pre-commit";

	// When: planning each
	const absent = hookPlan({ name, existing: undefined });
	const old = hookPlan({ name, existing: `#!/bin/sh\n${SHIM_MARKER}\n` });
	const current = hookPlan({ name, existing: shimScript(name) });
	const foreign = hookPlan({ name, existing: "#!/bin/sh\nmake lint\n" });

	// Then: write, write, current, refuse naming the hook
	assertEquals(absent, { kind: "write", name, script: shimScript(name) });
	assertEquals(old, { kind: "write", name, script: shimScript(name) });
	assertEquals(current, { kind: "current", name });
	assertEquals(foreign.kind, "refuse");
	assert(
		foreign.kind === "refuse" && foreign.reason.includes("hooks/pre-commit"),
	);
});

Deno.test("hooksPathPlan unsets the gate's old setting, relative or absolutized, keeps an unset one, and refuses any other", () => {
	// Given: the values core.hooksPath may hold
	// When: planning each
	// Then: only the gate's own setting is unset
	assertEquals(hooksPathPlan(undefined), { kind: "keep" });
	for (const path of [
		".githooks",
		"./.githooks",
		".githooks/",
		"/Users/someone/repo/.githooks",
	]) {
		assertEquals(hooksPathPlan(path), { kind: "unset" }, path);
	}
	for (const path of [".husky", "/dev/null", "hooks/.githooks", "x.githooks"]) {
		const plan = hooksPathPlan(path);
		assertEquals(plan.kind, "refuse", path);
		assert(plan.kind === "refuse" && plan.reason.includes(path));
	}
});

Deno.test("hooksWarning is silent only with current shims and no core.hooksPath", () => {
	// Given: current shims, a missing one, an old one, and a set hooksPath
	// When: asking for a warning
	const gated = hooksWarning({ hooksPath: undefined, hooks: CURRENT });
	const missing = hooksWarning({
		hooksPath: undefined,
		hooks: { ...CURRENT, "pre-merge-commit": undefined },
	});
	const old = hooksWarning({
		hooksPath: undefined,
		hooks: { ...CURRENT, "pre-commit": `#!/bin/sh\n${SHIM_MARKER}\n` },
	});
	const shadowed = hooksWarning({ hooksPath: ".githooks", hooks: CURRENT });

	// Then: only the first is silent; each warning names what is wrong
	assertEquals(gated, undefined);
	assert(missing?.includes("pre-merge-commit"));
	assert(old?.includes("pre-commit"));
	assert(shadowed?.includes("core.hooksPath is .githooks"));
});
