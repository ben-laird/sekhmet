import { copy, ensureDir, walk } from "@std/fs";

/**
 * Options for creating a new workspace from a template.
 */
export interface CreateWorkspaceOptions {
	/** Name of the template directory to use */
	template: string;
	/** Destination URL where the workspace will be created */
	destination: URL;
	/** Base directory URL containing all available templates */
	templateBaseDir: URL;
}

/**
 * Creates a new workspace by copying files from a template directory.
 * Recursively copies all files from the specified template to the destination,
 * preserving the directory structure.
 *
 * @param options - Configuration for workspace creation
 * @throws {Error} If the template is not found at the specified path
 * @throws {Error} If the template path is not a directory
 */
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
