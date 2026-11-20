# @sekhmet/lifetime

RAII for TypeScript, in any JavaScript runtime. A `Lifetime` holds a value
from birth and guarantees its teardown: cleanups and adopted children share
one stack, released in reverse acquisition order, once, with a typed cause.

## Install

The package is published on [JSR](https://jsr.io/@sekhmet/lifetime).

```sh
deno add jsr:@sekhmet/lifetime
```

For Node.js, Bun and other npm-compatible runtimes, install through JSR's npm
compatibility layer:

```sh
npx jsr add @sekhmet/lifetime      # npm
pnpm dlx jsr add @sekhmet/lifetime # pnpm
yarn dlx jsr add @sekhmet/lifetime # yarn
bunx jsr add @sekhmet/lifetime     # bun
```

## Example

```ts
import { definePanicRuntime } from "@sekhmet/panic";
import { Lifetime } from "@sekhmet/lifetime";
import { assertEquals } from "@std/assert";

type Cause = "done" | "shutdown";

const order: string[] = [];
{
	await using app = new Lifetime<undefined, Cause>({
		value: undefined,
		panics: definePanicRuntime(),
		disposeCause: "shutdown",
	});
	app.defer(() => void order.push("close logs"));
	const db = app.child({ value: "db" });
	db.defer(async (cause) => {
		await Promise.resolve();
		order.push(`close db: ${cause}`);
	});
}
assertEquals(order, ["close db: shutdown", "close logs"]);
```

## License

MIT. See
[LICENSE.md](https://github.com/ben-laird/sekhmet/blob/main/packages/lifetime/LICENSE.md).
