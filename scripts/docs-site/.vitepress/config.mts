import { readFileSync } from "node:fs";
import type { DefaultTheme, UserConfig } from "vitepress";

/** The navigation `main.ts` writes next to the assembled pages. */
interface SiteNavigation {
	sidebar: DefaultTheme.SidebarMulti;
	nav: DefaultTheme.NavItemWithLink[];
}

const navigation: SiteNavigation = JSON.parse(
	readFileSync(new URL("../content/site.json", import.meta.url), "utf8"),
);

/** The VitePress site over the content `main.ts` assembles. */
const config: UserConfig<DefaultTheme.Config> = {
	title: "Sekhmet",
	description:
		"Type-safe TypeScript primitives: enums, Option and Result, effects and more.",
	base: "/sekhmet/",
	srcDir: "./content",
	cleanUrls: true,
	lastUpdated: false,
	themeConfig: {
		nav: [
			{ text: "Packages", items: navigation.nav },
			{ text: "API (JSR)", link: "https://jsr.io/@sekhmet" },
		],
		sidebar: navigation.sidebar,
		socialLinks: [
			{ icon: "github", link: "https://github.com/ben-laird/sekhmet" },
		],
		search: { provider: "local" },
		outline: "deep",
	},
};

export default config;
