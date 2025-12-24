import { assertEquals } from "@std/assert";
import { createAdapter } from "./adapter.ts";

Deno.test("createAdapter returns GitHubActionsAdapter when GITHUB_ACTIONS is true", () => {
	// Given: GITHUB_ACTIONS environment variable is set to "true"
	const original = Deno.env.get("GITHUB_ACTIONS");
	Deno.env.set("GITHUB_ACTIONS", "true");

	try {
		// When: creating an adapter
		const adapter = createAdapter();

		// Then: should return GitHub Actions adapter
		assertEquals(adapter.isGitHubActions, true);
	} finally {
		// Cleanup
		if (original === undefined) {
			Deno.env.delete("GITHUB_ACTIONS");
		} else {
			Deno.env.set("GITHUB_ACTIONS", original);
		}
	}
});

Deno.test("createAdapter returns ConsoleAdapter when GITHUB_ACTIONS is not set", () => {
	// Given: GITHUB_ACTIONS environment variable is not set
	const original = Deno.env.get("GITHUB_ACTIONS");
	Deno.env.delete("GITHUB_ACTIONS");

	try {
		// When: creating an adapter
		const adapter = createAdapter();

		// Then: should return console adapter
		assertEquals(adapter.isGitHubActions, false);
	} finally {
		// Cleanup
		if (original !== undefined) {
			Deno.env.set("GITHUB_ACTIONS", original);
		}
	}
});

Deno.test("createAdapter returns ConsoleAdapter when GITHUB_ACTIONS is false", () => {
	// Given: GITHUB_ACTIONS environment variable is set to "false"
	const original = Deno.env.get("GITHUB_ACTIONS");
	Deno.env.set("GITHUB_ACTIONS", "false");

	try {
		// When: creating an adapter
		const adapter = createAdapter();

		// Then: should return console adapter
		assertEquals(adapter.isGitHubActions, false);
	} finally {
		// Cleanup
		if (original === undefined) {
			Deno.env.delete("GITHUB_ACTIONS");
		} else {
			Deno.env.set("GITHUB_ACTIONS", original);
		}
	}
});

Deno.test("ConsoleAdapter.info logs to console", () => {
	// Given: a console adapter
	const original = Deno.env.get("GITHUB_ACTIONS");
	Deno.env.delete("GITHUB_ACTIONS");

	try {
		const adapter = createAdapter();

		// When: calling info
		// Then: should not throw (console.log is called)
		adapter.info("test message");
		assertEquals(adapter.isGitHubActions, false);
	} finally {
		// Cleanup
		if (original !== undefined) {
			Deno.env.set("GITHUB_ACTIONS", original);
		}
	}
});

Deno.test("ConsoleAdapter.group executes function and manages grouping", async () => {
	// Given: a console adapter and a test function
	const original = Deno.env.get("GITHUB_ACTIONS");
	Deno.env.delete("GITHUB_ACTIONS");

	try {
		const adapter = createAdapter();
		let executed = false;
		const testValue = 42;

		// When: using group with a function
		const result = await adapter.group("Test Group", () => {
			executed = true;
			return testValue;
		});

		// Then: function should be executed and return value preserved
		assertEquals(executed, true);
		assertEquals(result, testValue);
	} finally {
		// Cleanup
		if (original !== undefined) {
			Deno.env.set("GITHUB_ACTIONS", original);
		}
	}
});

Deno.test("ConsoleAdapter.group executes async function", async () => {
	// Given: a console adapter and an async test function
	const original = Deno.env.get("GITHUB_ACTIONS");
	Deno.env.delete("GITHUB_ACTIONS");

	try {
		const adapter = createAdapter();
		const testValue = "async result";

		// When: using group with an async function
		const result = await adapter.group("Async Test Group", async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
			return testValue;
		});

		// Then: async function should complete and return value
		assertEquals(result, testValue);
	} finally {
		// Cleanup
		if (original !== undefined) {
			Deno.env.set("GITHUB_ACTIONS", original);
		}
	}
});

Deno.test("ConsoleAdapter.debug logs when RUNNER_DEBUG is set", () => {
	// Given: RUNNER_DEBUG is set to "1"
	const originalGH = Deno.env.get("GITHUB_ACTIONS");
	const originalDebug = Deno.env.get("RUNNER_DEBUG");
	Deno.env.delete("GITHUB_ACTIONS");
	Deno.env.set("RUNNER_DEBUG", "1");

	try {
		const adapter = createAdapter();

		// When: calling debug
		// Then: should not throw (console.log is called in debug mode)
		adapter.debug("debug message");
		assertEquals(adapter.isGitHubActions, false);
	} finally {
		// Cleanup
		if (originalGH !== undefined) {
			Deno.env.set("GITHUB_ACTIONS", originalGH);
		}
		if (originalDebug === undefined) {
			Deno.env.delete("RUNNER_DEBUG");
		} else {
			Deno.env.set("RUNNER_DEBUG", originalDebug);
		}
	}
});

Deno.test("ConsoleAdapter.setOutput is no-op in normal mode", () => {
	// Given: a console adapter without RUNNER_DEBUG
	const originalGH = Deno.env.get("GITHUB_ACTIONS");
	const originalDebug = Deno.env.get("RUNNER_DEBUG");
	Deno.env.delete("GITHUB_ACTIONS");
	Deno.env.delete("RUNNER_DEBUG");

	try {
		const adapter = createAdapter();

		// When: calling setOutput
		// Then: should not throw (no-op)
		adapter.setOutput("test_output", "test_value");
		assertEquals(adapter.isGitHubActions, false);
	} finally {
		// Cleanup
		if (originalGH !== undefined) {
			Deno.env.set("GITHUB_ACTIONS", originalGH);
		}
		if (originalDebug !== undefined) {
			Deno.env.set("RUNNER_DEBUG", originalDebug);
		}
	}
});

Deno.test("GitHubActionsAdapter.group executes function", async () => {
	// Given: a GitHub Actions adapter
	const original = Deno.env.get("GITHUB_ACTIONS");
	Deno.env.set("GITHUB_ACTIONS", "true");

	try {
		const adapter = createAdapter();
		let executed = false;
		const testValue = 100;

		// When: using group with a function
		const result = await adapter.group("GH Test Group", () => {
			executed = true;
			return testValue;
		});

		// Then: function should be executed and return value preserved
		assertEquals(executed, true);
		assertEquals(result, testValue);
		assertEquals(adapter.isGitHubActions, true);
	} finally {
		// Cleanup
		if (original === undefined) {
			Deno.env.delete("GITHUB_ACTIONS");
		} else {
			Deno.env.set("GITHUB_ACTIONS", original);
		}
	}
});
