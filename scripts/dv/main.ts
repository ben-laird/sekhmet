/**
 * The repo's pinned dv CLI: `deno task dv <args>`.
 *
 * `jsr:@dv-cli/dv` is pinned exactly in this member's `deno.json`, and the
 * workspace `deno.lock` pins its dependency tree; run with `--frozen` so
 * neither can drift. `deno install jsr:@dv-cli/dv` cannot be used instead:
 * the package's entry point only re-exports `main`, so the installed binary
 * runs nothing.
 *
 * @module
 */

import { main } from "@dv-cli/dv";

if (import.meta.main) {
	Deno.exit(await main(Deno.args));
}
