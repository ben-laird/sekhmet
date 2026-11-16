# @sekhmet/primordials

The small building blocks the other Sekhmet packages are made of:

- `@sekhmet/primordials/struct`: `Struct`, a base class that keeps its data
  behind a symbol, and `getStructParams` to read it.
- `@sekhmet/primordials/subtle`: `Subtle`, which hides a creator function
  behind `useSubtle`.
- `@sekhmet/primordials/scoping`: `block` and `define`, two expression
  helpers.

You rarely need this package directly unless you build your own Sekhmet-style
types; the other packages depend on it for you.

## Install

The package is published on [JSR](https://jsr.io/@sekhmet/primordials).

```sh
deno add jsr:@sekhmet/primordials
```

For Node.js, Bun and other npm-compatible runtimes, install through JSR's npm
compatibility layer:

```sh
npx jsr add @sekhmet/primordials      # npm
pnpm dlx jsr add @sekhmet/primordials # pnpm
yarn dlx jsr add @sekhmet/primordials # yarn
bunx jsr add @sekhmet/primordials     # bun
```

The package has no root export: import `struct`, `subtle` or `scoping`.

## Struct

```ts
import { assertEquals } from "@std/assert";
import { getStructParams, Struct } from "@sekhmet/primordials/struct";

class Counter extends Struct<{ count: number }> {
	increment(): number {
		return ++getStructParams(this).count;
	}
}

const counter = new Counter({ count: 0 });
counter.increment();

assertEquals(getStructParams(counter).count, 1);
```

## Subtle

```ts
import { assertEquals } from "@std/assert";
import { Subtle, useSubtle } from "@sekhmet/primordials/subtle";

const connect = new Subtle({ create: (url: string) => ({ url, open: true }) });

assertEquals(useSubtle(connect, "wss://example.test"), { url: "wss://example.test", open: true });
```

## Scoping

```ts
import { assertEquals } from "@std/assert";
import { block, define } from "@sekhmet/primordials/scoping";

// block: a statement block used as an expression
const label = block(() => {
	const hour = 14;
	return hour < 12 ? "morning" : "afternoon";
});

// define: an inline value checked against a type
interface Config {
	port: number;
}
const config = define<Config>({ port: 8080 });

assertEquals([label, config.port], ["afternoon", 8080]);
```

## Learn more

- Guide: [concepts](docs/concepts.md), also on the
  [docs site](https://ben-laird.github.io/sekhmet/primordials/).
- API reference: [jsr.io/@sekhmet/primordials](https://jsr.io/@sekhmet/primordials).

## License

MIT. See [LICENSE.md](https://github.com/ben-laird/sekhmet/blob/main/packages/primordials/LICENSE.md).
