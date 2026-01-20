import { assertEquals } from "@std/assert";
import { createAdapter } from "./adapter.ts";

Deno.test("createAdapter returns GitHubActionsAdapter when GITHUB_ACTIONS is true", () => {
	// Given: GITHUB_ACTIONS environment variable is set to "true" and CI_AI is not set
	const originalGH = Deno.env.get("GITHUB_ACTIONS");
	const originalAI = Deno.env.get("CI_AI");
	Deno.env.set("GITHUB_ACTIONS", "true");
	Deno.env.delete("CI_AI");

	try {
		// When: creating an adapter
		const adapter = createAdapter();

		// Then: should return GitHub Actions adapter
		assertEquals(adapter.isGitHubActions, true);
	} finally {
		// Cleanup
		if (originalGH === undefined) {
			Deno.env.delete("GITHUB_ACTIONS");
		} else {
			Deno.env.set("GITHUB_ACTIONS", originalGH);
		}
		if (originalAI !== undefined) {
			Deno.env.set("CI_AI", originalAI);
		}
	}
});

Deno.test("createAdapter returns ConsoleAdapter when GITHUB_ACTIONS is not set", () => {
	// Given: GITHUB_ACTIONS and CI_AI environment variables are not set
	const originalGH = Deno.env.get("GITHUB_ACTIONS");
	const originalAI = Deno.env.get("CI_AI");
	Deno.env.delete("GITHUB_ACTIONS");
	Deno.env.delete("CI_AI");

	try {
		// When: creating an adapter
		const adapter = createAdapter();

		// Then: should return console adapter
		assertEquals(adapter.isGitHubActions, false);
		assertEquals(adapter.isAI, false);
	} finally {
		// Cleanup
		if (originalGH !== undefined) {
			Deno.env.set("GITHUB_ACTIONS", originalGH);
		}
		if (originalAI !== undefined) {
			Deno.env.set("CI_AI", originalAI);
		}
	}
});

Deno.test("createAdapter returns ConsoleAdapter when GITHUB_ACTIONS is false", () => {
	// Given: GITHUB_ACTIONS is set to "false" and CI_AI is not set
	const originalGH = Deno.env.get("GITHUB_ACTIONS");
	const originalAI = Deno.env.get("CI_AI");
	Deno.env.set("GITHUB_ACTIONS", "false");
	Deno.env.delete("CI_AI");

	try {
		// When: creating an adapter
		const adapter = createAdapter();

		// Then: should return console adapter
		assertEquals(adapter.isGitHubActions, false);
		assertEquals(adapter.isAI, false);
	} finally {
		// Cleanup
		if (originalGH === undefined) {
			Deno.env.delete("GITHUB_ACTIONS");
		} else {
			Deno.env.set("GITHUB_ACTIONS", originalGH);
		}
		if (originalAI !== undefined) {
			Deno.env.set("CI_AI", originalAI);
		}
	}
});

Deno.test("ConsoleAdapter.info logs to console", () => {
	// Given: a console adapter
	const originalGH = Deno.env.get("GITHUB_ACTIONS");
	const originalAI = Deno.env.get("CI_AI");
	Deno.env.delete("GITHUB_ACTIONS");
	Deno.env.delete("CI_AI");

	try {
		const adapter = createAdapter();

		// When: calling info
		// Then: should not throw (console.log is called)
		adapter.info("test message");
		assertEquals(adapter.isGitHubActions, false);
	} finally {
		// Cleanup
		if (originalGH !== undefined) {
			Deno.env.set("GITHUB_ACTIONS", originalGH);
		}
		if (originalAI !== undefined) {
			Deno.env.set("CI_AI", originalAI);
		}
	}
});

Deno.test("ConsoleAdapter.group executes function and manages grouping", async () => {
	// Given: a console adapter and a test function
	const originalGH = Deno.env.get("GITHUB_ACTIONS");
	const originalAI = Deno.env.get("CI_AI");
	Deno.env.delete("GITHUB_ACTIONS");
	Deno.env.delete("CI_AI");

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
		if (originalGH !== undefined) {
			Deno.env.set("GITHUB_ACTIONS", originalGH);
		}
		if (originalAI !== undefined) {
			Deno.env.set("CI_AI", originalAI);
		}
	}
});

Deno.test("ConsoleAdapter.group executes async function", async () => {
	// Given: a console adapter and an async test function
	const originalGH = Deno.env.get("GITHUB_ACTIONS");
	const originalAI = Deno.env.get("CI_AI");
	Deno.env.delete("GITHUB_ACTIONS");
	Deno.env.delete("CI_AI");

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
		if (originalGH !== undefined) {
			Deno.env.set("GITHUB_ACTIONS", originalGH);
		}
		if (originalAI !== undefined) {
			Deno.env.set("CI_AI", originalAI);
		}
	}
});

Deno.test("ConsoleAdapter.debug logs when RUNNER_DEBUG is set", () => {
	// Given: RUNNER_DEBUG is set to "1"
	const originalGH = Deno.env.get("GITHUB_ACTIONS");
	const originalAI = Deno.env.get("CI_AI");
	const originalDebug = Deno.env.get("RUNNER_DEBUG");
	Deno.env.delete("GITHUB_ACTIONS");
	Deno.env.delete("CI_AI");
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
		if (originalAI !== undefined) {
			Deno.env.set("CI_AI", originalAI);
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
	const originalAI = Deno.env.get("CI_AI");
	const originalDebug = Deno.env.get("RUNNER_DEBUG");
	Deno.env.delete("GITHUB_ACTIONS");
	Deno.env.delete("CI_AI");
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
		if (originalAI !== undefined) {
			Deno.env.set("CI_AI", originalAI);
		}
		if (originalDebug !== undefined) {
			Deno.env.set("RUNNER_DEBUG", originalDebug);
		}
	}
});

Deno.test("GitHubActionsAdapter.group executes function", async () => {
	// Given: a GitHub Actions adapter
	const originalGH = Deno.env.get("GITHUB_ACTIONS");
	const originalAI = Deno.env.get("CI_AI");
	Deno.env.set("GITHUB_ACTIONS", "true");
	Deno.env.delete("CI_AI");

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
		if (originalGH === undefined) {
			Deno.env.delete("GITHUB_ACTIONS");
		} else {
			Deno.env.set("GITHUB_ACTIONS", originalGH);
		}
		if (originalAI !== undefined) {
			Deno.env.set("CI_AI", originalAI);
		}
	}
});

Deno.test("createAdapter returns AIAdapter when CI_AI is true", () => {
	// Given: CI_AI environment variable is set to "true"
	const originalAI = Deno.env.get("CI_AI");
	const originalGH = Deno.env.get("GITHUB_ACTIONS");
	Deno.env.set("CI_AI", "true");
	Deno.env.delete("GITHUB_ACTIONS");

	try {
		// When: creating an adapter
		const adapter = createAdapter();

		// Then: should return AI adapter
		assertEquals(adapter.isAI, true);
		assertEquals(adapter.isGitHubActions, false);
	} finally {
		// Cleanup
		if (originalAI === undefined) {
			Deno.env.delete("CI_AI");
		} else {
			Deno.env.set("CI_AI", originalAI);
		}
		if (originalGH === undefined) {
			Deno.env.delete("GITHUB_ACTIONS");
		} else {
			Deno.env.set("GITHUB_ACTIONS", originalGH);
		}
	}
});

Deno.test("createAdapter returns AIAdapter even when GITHUB_ACTIONS is also true", () => {
	// Given: both CI_AI and GITHUB_ACTIONS are set to "true"
	const originalAI = Deno.env.get("CI_AI");
	const originalGH = Deno.env.get("GITHUB_ACTIONS");
	Deno.env.set("CI_AI", "true");
	Deno.env.set("GITHUB_ACTIONS", "true");

	try {
		// When: creating an adapter
		const adapter = createAdapter();

		// Then: AI mode takes precedence
		assertEquals(adapter.isAI, true);
		assertEquals(adapter.isGitHubActions, false);
	} finally {
		// Cleanup
		if (originalAI === undefined) {
			Deno.env.delete("CI_AI");
		} else {
			Deno.env.set("CI_AI", originalAI);
		}
		if (originalGH === undefined) {
			Deno.env.delete("GITHUB_ACTIONS");
		} else {
			Deno.env.set("GITHUB_ACTIONS", originalGH);
		}
	}
});

Deno.test("AIAdapter.group executes function without grouping output", async () => {
	// Given: an AI adapter and a test function
	const originalAI = Deno.env.get("CI_AI");
	Deno.env.set("CI_AI", "true");

	try {
		const adapter = createAdapter();
		let executed = false;
		const testValue = "ai result";

		// When: using group with a function
		const result = await adapter.group("AI Test Group", () => {
			executed = true;
			return testValue;
		});

		// Then: function should be executed and return value preserved
		assertEquals(executed, true);
		assertEquals(result, testValue);
		assertEquals(adapter.isAI, true);
	} finally {
		// Cleanup
		if (originalAI === undefined) {
			Deno.env.delete("CI_AI");
		} else {
			Deno.env.set("CI_AI", originalAI);
		}
	}
});

Deno.test("ConsoleAdapter.isAI is false", () => {
	// Given: a console adapter
	const originalGH = Deno.env.get("GITHUB_ACTIONS");
	const originalAI = Deno.env.get("CI_AI");
	Deno.env.delete("GITHUB_ACTIONS");
	Deno.env.delete("CI_AI");

	try {
		// When: creating a console adapter
		const adapter = createAdapter();

		// Then: isAI should be false
		assertEquals(adapter.isAI, false);
	} finally {
		// Cleanup
		if (originalGH !== undefined) {
			Deno.env.set("GITHUB_ACTIONS", originalGH);
		}
		if (originalAI !== undefined) {
			Deno.env.set("CI_AI", originalAI);
		}
	}
});

Deno.test("GitHubActionsAdapter.isAI is false", () => {
	// Given: a GitHub Actions adapter
	const originalGH = Deno.env.get("GITHUB_ACTIONS");
	const originalAI = Deno.env.get("CI_AI");
	Deno.env.set("GITHUB_ACTIONS", "true");
	Deno.env.delete("CI_AI");

	try {
		// When: creating a GitHub Actions adapter
		const adapter = createAdapter();

		// Then: isAI should be false
		assertEquals(adapter.isAI, false);
		assertEquals(adapter.isGitHubActions, true);
	} finally {
		// Cleanup
		if (originalGH === undefined) {
			Deno.env.delete("GITHUB_ACTIONS");
		} else {
			Deno.env.set("GITHUB_ACTIONS", originalGH);
		}
		if (originalAI !== undefined) {
			Deno.env.set("CI_AI", originalAI);
		}
	}
});
