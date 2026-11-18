/**
 * Plans the docs site's content from the repository's markdown: the root
 * README becomes the home page, and each package's README and `docs/*.md`
 * become that package's section, with a sidebar per package that groups its
 * pages by their Diátaxis kind (see `doc-kind.ts`).
 *
 * Pure: the caller reads the sources and writes the pages.
 *
 * @module
 */

import {
	DOC_KIND_HEADINGS,
	DOC_KINDS,
	type DocKind,
	describeUnknownDocKind,
	parseDocKind,
	type UnknownDocKind,
} from "./doc-kind.ts";
import {
	describeFrontmatterError,
	type FrontmatterError,
	splitFrontmatter,
} from "./frontmatter.ts";
import { err, ok, type Result } from "./result.ts";

/** One markdown file of a package's `docs/` folder. */
export interface DocFile {
	/** The file name, e.g. `getting-started.md`. */
	readonly name: string;
	/** The markdown text. */
	readonly text: string;
}

/** A package's markdown sources. */
export interface PackageSource {
	/** The package directory name under `packages/`, e.g. `enum`. */
	readonly dir: string;
	/** The package's `README.md`, if it has one. */
	readonly readme: string | undefined;
	/** The package's `docs/*.md` files. */
	readonly docs: readonly DocFile[];
	/**
	 * Whether the package is released to JSR: `false` when its `deno.json`
	 * sets `"publish": false` (a prototype), as dv and compat-smoke read it.
	 */
	readonly published: boolean;
}

/** A page of the site, by its path under the content directory. */
export interface Page {
	/** The path relative to the content directory, e.g. `enum/index.md`. */
	readonly path: string;
	/** The markdown text. */
	readonly text: string;
}

/** A sidebar link to a page, on the site or off it. */
export interface SidebarLink {
	/** The link text. */
	readonly text: string;
	/** The site path (`/enum/getting-started`) or an external URL. */
	readonly link: string;
}

/** A titled sidebar group of links and nested groups. */
export interface SidebarGroup {
	/** The group heading. */
	readonly text: string;
	/** The group's entries, in reading order. */
	readonly items: readonly SidebarEntry[];
}

/** One entry of a sidebar: a link or a nested group. */
export type SidebarEntry = SidebarLink | SidebarGroup;

/** The planned site: its pages and navigation. */
export interface Site {
	/** Every page to write. */
	readonly pages: readonly Page[];
	/** The sidebar per package section, keyed by its path prefix (`/enum/`). */
	readonly sidebar: Readonly<Record<string, readonly SidebarGroup[]>>;
	/** A top-nav entry per package. */
	readonly nav: readonly SidebarLink[];
}

/** Why a docs page cannot go on the site. */
export type PageError =
	| {
			readonly kind: "frontmatter";
			/** The page's repository path, e.g. `packages/enum/docs/recipes.md`. */
			readonly file: string;
			/** What is wrong with its frontmatter. */
			readonly error: FrontmatterError;
	  }
	| {
			readonly kind: "unknown-kind";
			/** The page's repository path, e.g. `packages/enum/docs/recipes.md`. */
			readonly file: string;
			/** The `kind` value it declares. */
			readonly error: UnknownDocKind;
	  };

/**
 * Describes a page error for a build log.
 *
 * @param error - The error
 * @returns The page's path and what is wrong with it
 */
export function describePageError(error: PageError): string {
	switch (error.kind) {
		case "frontmatter": {
			return `${error.file}: ${describeFrontmatterError(error.error)}`;
		}
		case "unknown-kind": {
			return `${error.file}: ${describeUnknownDocKind(error.error)}`;
		}
	}
}

/** The slug of the page that leads whichever group it lands in. */
export const LEADING_SLUG = "getting-started";

/**
 * The link to a package's API reference on JSR, which JSR generates from the
 * package's TSDoc.
 *
 * @param dir - The package directory name, e.g. `enum`
 * @returns The link to `https://jsr.io/@sekhmet/<dir>/doc`
 */
export function apiReferenceLink(dir: string): SidebarLink {
	return { text: "API on JSR", link: `https://jsr.io/@sekhmet/${dir}/doc` };
}

/**
 * The text of a markdown document's first level-one heading.
 *
 * @param options.text - The markdown, without frontmatter
 * @param options.fallback - The title when there is no heading
 * @returns The title
 */
export function titleOf({
	text,
	fallback,
}: {
	text: string;
	fallback: string;
}): string {
	return /^#\s+(.+?)\s*$/m.exec(text)?.[1] ?? fallback;
}

/** Rewrites every markdown link target in `text` through `rewrite`. */
function rewriteLinks(
	text: string,
	rewrite: (target: string) => string,
): string {
	return text.replace(
		/(\]\()([^)\s]+)(\))/g,
		(_link, open: string, target: string, close: string) =>
			`${open}${rewrite(target)}${close}`,
	);
}

/**
 * Rewrites a package README's links for the site: `docs/x.md` (a sibling
 * page there) becomes `./x.md`.
 *
 * @param text - The README markdown
 * @returns The page markdown
 */
export function readmeLinks(text: string): string {
	return rewriteLinks(text, (target) =>
		target.replace(/^(?:\.\/)?docs\//, "./"),
	);
}

/**
 * Rewrites a `docs/*.md` page's links for the site: `../README.md` (the
 * package overview) becomes `./index.md`.
 *
 * @param text - The page markdown
 * @returns The page markdown
 */
export function docLinks(text: string): string {
	return rewriteLinks(text, (target) =>
		target.replace(/^\.\.\/README\.md/, "./index.md"),
	);
}

/** Where repository files are browsed, for links to files the site has no page for. */
export const REPOSITORY_BLOB =
	"https://github.com/ben-laird/sekhmet/blob/main/";

/**
 * Rewrites the root README's links for the site: links into
 * `packages/<dir>/README.md` or `packages/<dir>/docs/<page>.md` become that
 * package's site pages, and other relative links (such as `LICENSE.md`)
 * point at the file in the repository. So do links into an unpublished
 * package, which has no pages on the site.
 *
 * @param options.text - The root README markdown
 * @param options.unpublished - The directory names of unpublished packages
 * @returns The home page markdown
 */
export function rootLinks({
	text,
	unpublished,
}: {
	text: string;
	unpublished: ReadonlySet<string>;
}): string {
	return rewriteLinks(text, (target) => {
		const dir = /^(?:\.\/)?packages\/([\w-]+)(?:\/|$)/.exec(target)?.[1];
		if (dir !== undefined && unpublished.has(dir)) {
			return `${REPOSITORY_BLOB}${target.replace(/^\.\//, "")}`;
		}
		const packagePage = target
			.replace(/^(?:\.\/)?packages\/([\w-]+)\/README\.md/, "/$1/")
			.replace(/^(?:\.\/)?packages\/([\w-]+)\/docs\/([\w-]+)\.md/, "/$1/$2")
			.replace(/^(?:\.\/)?packages\/([\w-]+)\/?$/, "/$1/");
		if (packagePage !== target) return packagePage;

		const isRelative = !/^(?:[a-z]+:|\/|#)/i.test(target);
		return isRelative
			? `${REPOSITORY_BLOB}${target.replace(/^\.\//, "")}`
			: target;
	});
}

/** A docs page read for the sidebar: where it lives, what it is called, and its kind. */
interface DocPage {
	readonly slug: string;
	readonly title: string;
	readonly kind: DocKind | undefined;
}

/** Reads a doc file's slug, title and kind, or why its frontmatter is invalid. */
function readDocPage({
	dir,
	doc,
}: {
	dir: string;
	doc: DocFile;
}): Result<DocPage, PageError> {
	const file = `packages/${dir}/docs/${doc.name}`;
	const slug = doc.name.replace(/\.md$/, "");

	const frontmatter = splitFrontmatter(doc.text);
	if (!frontmatter.ok) {
		return err({ kind: "frontmatter", file, error: frontmatter.error });
	}
	const { fields, body } = frontmatter.value;

	const kind = parseDocKind(fields.kind);
	if (!kind.ok) {
		return err({ kind: "unknown-kind", file, error: kind.error });
	}

	return ok({
		slug,
		title: titleOf({ text: body, fallback: slug }),
		kind: kind.value,
	});
}

/** Reading order within a group: {@linkcode LEADING_SLUG} first, then by title. */
function byReadingOrder(a: DocPage, b: DocPage): number {
	const leads = (page: DocPage): number => {
		return page.slug === LEADING_SLUG ? 0 : 1;
	};
	return leads(a) - leads(b) || a.title.localeCompare(b.title);
}

/**
 * Plans one package's sidebar group: its overview, then its untagged pages,
 * then a sub-group per Diátaxis kind that has pages. Reference always has
 * pages, since it leads with the package's API on JSR.
 */
function packageSidebar({
	dir,
	pages,
}: {
	dir: string;
	pages: readonly DocPage[];
}): SidebarGroup {
	const base = `/${dir}/`;
	const linksTo = (kind: DocKind | undefined): SidebarLink[] => {
		return pages
			.filter((page) => page.kind === kind)
			.toSorted(byReadingOrder)
			.map((page) => ({ text: page.title, link: `${base}${page.slug}` }));
		// {}
	};

	const groups: SidebarGroup[] = [];
	for (const kind of DOC_KINDS) {
		const items = linksTo(kind);
		if (kind === "reference") items.unshift(apiReferenceLink(dir));
		if (items.length > 0) groups.push({ text: DOC_KIND_HEADINGS[kind], items });
	}

	return {
		text: `@sekhmet/${dir}`,
		items: [{ text: "Overview", link: base }, ...linksTo(undefined), ...groups],
	};
}

/** A package's overview page: its README, or a placeholder without one. */
function overviewOf(pkg: PackageSource): string {
	if (pkg.readme === undefined) {
		return `# @sekhmet/${pkg.dir}\n\nThis package has no README yet.\n`;
	}
	return readmeLinks(pkg.readme);
}

/**
 * Plans the site from the root README and every package's markdown.
 * Unpublished packages, which have no JSR page to link, and packages with
 * neither a README nor docs are left out.
 *
 * @param options.rootReadme - The repository README, the home page
 * @param options.packages - Every package's markdown sources
 * @returns The pages to write and the navigation, or every page whose
 *   frontmatter is invalid or names an unknown kind
 */
export function planSite({
	rootReadme,
	packages,
}: {
	rootReadme: string;
	packages: readonly PackageSource[];
}): Result<Site, readonly PageError[]> {
	const unpublished = new Set(
		packages.filter((pkg) => !pkg.published).map((pkg) => pkg.dir),
	);
	const pages: Page[] = [
		{ path: "index.md", text: rootLinks({ text: rootReadme, unpublished }) },
	];
	const sidebar: Record<string, readonly SidebarGroup[]> = {};
	const nav: SidebarLink[] = [];
	const errors: PageError[] = [];

	const present = packages
		.filter((pkg) => {
			return pkg.published && (pkg.readme !== undefined || pkg.docs.length > 0);
		})
		.toSorted((a, b) => a.dir.localeCompare(b.dir));
	// {}

	for (const pkg of present) {
		const base = `/${pkg.dir}/`;
		const docs = pkg.docs.toSorted((a, b) => a.name.localeCompare(b.name));
		const docPages: DocPage[] = [];

		pages.push({ path: `${pkg.dir}/index.md`, text: overviewOf(pkg) });

		for (const doc of docs) {
			const docPage = readDocPage({ dir: pkg.dir, doc });
			if (!docPage.ok) {
				errors.push(docPage.error);
				continue;
			}
			docPages.push(docPage.value);
			pages.push({ path: `${pkg.dir}/${doc.name}`, text: docLinks(doc.text) });
		}

		sidebar[base] = [packageSidebar({ dir: pkg.dir, pages: docPages })];
		nav.push({ text: pkg.dir, link: base });
	}

	return errors.length > 0 ? err(errors) : ok({ pages, sidebar, nav });
}
