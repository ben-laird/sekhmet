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
	SidebarGroup,
	SidebarItem,
	Site,
} from "./src/assemble.ts";
export {
	docLinks,
	LEADING_PAGES,
	planSite,
	readmeLinks,
	rootLinks,
	titleOf,
} from "./src/assemble.ts";
