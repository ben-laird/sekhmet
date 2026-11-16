/**
 * The playground's discovery and loading logic: which workspace entrypoints
 * `deno task play` exposes, under which names, and how it reports them.
 *
 * @module
 */

export {
	type DecodedManifest,
	decodeManifest,
	discoverNamespaces,
	type Namespace,
	type PackageManifest,
} from "@/src/discover.ts";
export {
	formatTable,
	type Importer,
	type Loaded,
	loadNamespaces,
} from "@/src/load.ts";
export { type Manifests, readManifests } from "@/src/workspace.ts";
