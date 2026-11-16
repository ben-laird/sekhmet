// deno-coverage-ignore-file
/**
 * `deno task play:notebook`: copies the starter notebook to
 * `playground/start.ipynb` (never overwriting one that is there), then says
 * how to open it with the Deno Jupyter kernel.
 *
 * @module
 */

const ROOT = new URL("../../", import.meta.url);
const STARTER = new URL("./start.ipynb", import.meta.url);
const TARGET = "playground/start.ipynb";

/**
 * Copies the starter notebook into the playground unless it is already there.
 *
 * @returns Whether the notebook was created (`false`: it already existed)
 */
export async function copyStarter(): Promise<boolean> {
	await Deno.mkdir(new URL("playground/", ROOT), { recursive: true });
	try {
		await Deno.writeTextFile(
			new URL(TARGET, ROOT),
			await Deno.readTextFile(STARTER),
			{ createNew: true },
		);
		return true;
	} catch (error: unknown) {
		if (error instanceof Deno.errors.AlreadyExists) return false;
		throw error;
	}
}

if (import.meta.main) {
	const created = await copyStarter();
	console.log(
		[
			created
				? `Created ${TARGET}.`
				: `${TARGET} already exists; left it as is.`,
			"",
			"Open it in VS Code (Jupyter extension) and pick the Deno kernel.",
			"If the Deno kernel is not listed, install it once with:",
			"",
			"  deno jupyter --install",
		].join("\n"),
	);
}
