import { copy, ensureDir, walk } from "@std/fs";

export interface CreateWorkspaceOptions {
	template: string;
	destination: URL;
	templateBaseDir: URL;
}

export async function createWorkspace(
	options: CreateWorkspaceOptions,
): Promise<void> {
	const { template, destination, templateBaseDir } = options;

	// Resolve template path
	const templatePath = new URL(template, templateBaseDir);

	// Check if template exists
	let templateStat: Deno.FileInfo;
	try {
		templateStat = await Deno.stat(templatePath);
	} catch {
		throw new Error(`Template "${template}" not found at ${templatePath}`);
	}

	if (!templateStat.isDirectory) {
		throw new Error(`Template "${template}" is not a directory`);
	}

	// Ensure destination directory exists
	await ensureDir(destination);

	// Copy template contents to destination
	const templatePathStr = templatePath.pathname;
	for await (const entry of walk(templatePath, { includeDirs: false })) {
		// Calculate relative path from template directory
		const relativePath = entry.path.slice(templatePathStr.length);
		const destPath = new URL(
			relativePath.startsWith("/") ? `.${relativePath}` : relativePath,
			destination,
		);

		// Ensure parent directory exists
		await ensureDir(new URL(".", destPath));

		// Copy file
		await copy(entry.path, destPath, { overwrite: false });
	}
}
