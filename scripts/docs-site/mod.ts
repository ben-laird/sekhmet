/**
 * Assembles the Sekhmet docs site from the repository's markdown; see
 * `main.ts` for the CLI and `.vitepress/config.mts` for the site.
 *
 * @module
 */

export type {
	DocFile,
	PackageSource,
	Page,
	PageError,
	SidebarEntry,
	SidebarGroup,
	SidebarLink,
	Site,
} from "./src/assemble.ts";
export {
	apiReferenceLink,
	describePageError,
	docLinks,
	LEADING_SLUG,
	planSite,
	prototypeBanner,
	REPOSITORY_BLOB,
	readmeLinks,
	rootLinks,
	titleOf,
} from "./src/assemble.ts";
export type { DocKind, UnknownDocKind } from "./src/doc-kind.ts";
export {
	DOC_KIND_HEADINGS,
	DOC_KINDS,
	describeUnknownDocKind,
	parseDocKind,
} from "./src/doc-kind.ts";
export type { Frontmatter, FrontmatterError } from "./src/frontmatter.ts";
export {
	describeFrontmatterError,
	splitFrontmatter,
} from "./src/frontmatter.ts";
export type { Result } from "./src/result.ts";
export { err, ok } from "./src/result.ts";
