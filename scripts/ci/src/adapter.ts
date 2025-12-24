import * as core from "@actions/core";
import { cyan, gray, red, yellow } from "@std/fmt/colors";

/**
 * Adapter interface for CI logging and workflow commands.
 * Automatically switches between GitHub Actions and console output based on environment.
 */
export interface CIAdapter {
	// Logging
	info(message: string): void;
	notice(message: string): void;
	warning(message: string): void;
	error(message: string): void;
	debug(message: string): void;

	// Grouping
	startGroup(name: string): void;
	endGroup(): void;
	group<T>(name: string, fn: () => T | Promise<T>): Promise<T>;

	// Workflow commands
	setOutput(name: string, value: string): void;
	setFailed(message: string): never;

	// Environment detection
	readonly isGitHubActions: boolean;
}

/**
 * Console-based adapter for local development.
 * Uses colored console output and provides no-op workflow commands.
 */
class ConsoleAdapter implements CIAdapter {
	readonly isGitHubActions = false;

	info(message: string): void {
		console.log(message);
	}

	notice(message: string): void {
		console.log(cyan(message));
	}

	warning(message: string): void {
		console.warn(yellow(`Warning: ${message}`));
	}

	error(message: string): void {
		console.error(red(`Error: ${message}`));
	}

	debug(message: string): void {
		if (Deno.env.get("RUNNER_DEBUG") === "1") {
			console.log(gray(`Debug: ${message}`));
		}
	}

	startGroup(name: string): void {
		console.group(name);
	}

	endGroup(): void {
		console.groupEnd();
	}

	async group<T>(name: string, fn: () => T | Promise<T>): Promise<T> {
		this.startGroup(name);
		try {
			return await fn();
		} finally {
			this.endGroup();
		}
	}

	setOutput(name: string, value: string): void {
		if (Deno.env.get("RUNNER_DEBUG") === "1") {
			console.log(gray(`Output: ${name}=${value}`));
		}
	}

	setFailed(message: string): never {
		console.error(red(`Failed: ${message}`));
		Deno.exit(1);
	}
}

/**
 * GitHub Actions adapter using @actions/core.
 * Provides CI annotations and workflow command integration.
 */
class GitHubActionsAdapter implements CIAdapter {
	readonly isGitHubActions = true;

	info(message: string): void {
		core.info(message);
	}

	notice(message: string): void {
		core.notice(message);
	}

	warning(message: string): void {
		core.warning(message);
	}

	error(message: string): void {
		core.error(message);
	}

	debug(message: string): void {
		core.debug(message);
	}

	startGroup(name: string): void {
		core.startGroup(name);
	}

	endGroup(): void {
		core.endGroup();
	}

	async group<T>(name: string, fn: () => T | Promise<T>): Promise<T> {
		return await core.group(name, async () => await fn());
	}

	setOutput(name: string, value: string): void {
		core.setOutput(name, value);
	}

	setFailed(message: string): never {
		core.setFailed(message);
		Deno.exit(1);
	}
}

/**
 * Creates an appropriate CI adapter based on the environment.
 * Detects GitHub Actions via the GITHUB_ACTIONS environment variable.
 *
 * @returns CIAdapter instance (GitHubActionsAdapter or ConsoleAdapter)
 */
export function createAdapter(): CIAdapter {
	const isGitHubActions = Deno.env.get("GITHUB_ACTIONS") === "true";
	return isGitHubActions ? new GitHubActionsAdapter() : new ConsoleAdapter();
}
