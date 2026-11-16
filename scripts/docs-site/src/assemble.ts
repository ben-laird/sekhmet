/**
 * Plans the docs site's content from the repository's markdown: the root
 * README becomes the home page, and each package's README and `docs/*.md`
 * become that package's section, with a sidebar per package.
 *
 * Pure: the caller reads the sources and writes the pages.
 *
 * @module
 */

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
}

/** A page of the site, by its path under the content directory. */
export interface Page {
	/** The path relative to the content directory, e.g. `enum/index.md`. */
	readonly path: string;
	/** The markdown text. */
	readonly text: string;
}

/** A sidebar link. */
export interface SidebarItem {
	/** The link text. */
	readonly text: string;
	/** The site path, e.g. `/enum/getting-started`. */
	readonly link: string;
}

/** A sidebar group: one package's pages. */
export interface SidebarGroup {
	/** The group heading, the package name. */
	readonly text: string;
	/** The package's pages, overview first. */
	readonly items: readonly SidebarItem[];
}

/** The planned site: its pages and navigation. */
export interface Site {
	/** Every page to write. */
	readonly pages: readonly Page[];
	/** The sidebar per package section, keyed by its path prefix (`/enum/`). */
	readonly sidebar: Readonly<Record<string, readonly SidebarGroup[]>>;
	/** A top-nav entry per package. */
	readonly nav: readonly SidebarItem[];
}

/** Guide pages that lead a package's sidebar, in this order; the rest follow alphabetically. */
export const LEADING_PAGES: readonly string[] = [
	"getting-started",
	"concepts",
	"recipes",
];

/**
 * The text of a markdown document's first level-one heading.
 *
 * @param options.text - The markdown
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
 * point at the file in the repository.
 *
 * @param text - The root README markdown
 * @returns The home page markdown
 */
export function rootLinks(text: string): string {
	return rewriteLinks(text, (target) => {
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

/** Orders doc files: {@linkcode LEADING_PAGES} first, then by name. */
function byGuideOrder(a: DocFile, b: DocFile): number {
	const rank = (file: DocFile): number => {
		const index = LEADING_PAGES.indexOf(file.name.replace(/\.md$/, ""));
		return index < 0 ? LEADING_PAGES.length : index;
	};

	return rank(a) - rank(b) || a.name.localeCompare(b.name);
}

/**
 * Plans the site from the root README and every package's markdown.
 * Packages with neither a README nor docs are left out.
 *
 * @param options.rootReadme - The repository README, the home page
 * @param options.packages - Every package's markdown sources
 * @returns The pages to write and the navigation
 */
export function planSite({
	rootReadme,
	packages,
}: {
	rootReadme: string;
	packages: readonly PackageSource[];
}): Site {
	const pages: Page[] = [{ path: "index.md", text: rootLinks(rootReadme) }];
	const sidebar: Record<string, readonly SidebarGroup[]> = {};
	const nav: SidebarItem[] = [];

	const present = packages
		.filter((pkg) => pkg.readme !== undefined || pkg.docs.length > 0)
		.toSorted((a, b) => a.dir.localeCompare(b.dir));

	for (const pkg of present) {
		const base = `/${pkg.dir}/`;
		const name = `@sekhmet/${pkg.dir}`;
		const items: SidebarItem[] = [];

		pages.push({
			path: `${pkg.dir}/index.md`,
			text:
				pkg.readme === undefined
					? `# ${name}\n\nThis package has no README yet.\n`
					: readmeLinks(pkg.readme),
		});
		items.push({ text: "Overview", link: base });

		for (const doc of pkg.docs.toSorted(byGuideOrder)) {
			const slug = doc.name.replace(/\.md$/, "");
			pages.push({ path: `${pkg.dir}/${doc.name}`, text: docLinks(doc.text) });
			items.push({
				text: titleOf({ text: doc.text, fallback: slug }),
				link: `${base}${slug}`,
			});
		}

		sidebar[base] = [{ text: name, items }];
		nav.push({ text: pkg.dir, link: base });
	}

	return { pages, sidebar, nav };
}
