# @sekhmet/matrix

`matrix()` builds every combination of a set of values: the Cartesian product of
a record of arrays, as an array of records. Use it to drive parameterized tests.

## Install

The package is published on [JSR](https://jsr.io/@sekhmet/matrix).

```sh
deno add jsr:@sekhmet/matrix
```

For Node.js, Bun and other npm-compatible runtimes, install through JSR's npm
compatibility layer:

```sh
npx jsr add @sekhmet/matrix      # npm
pnpm dlx jsr add @sekhmet/matrix # pnpm
yarn dlx jsr add @sekhmet/matrix # yarn
bunx jsr add @sekhmet/matrix     # bun
```

## Example

```ts
import { assertEquals } from "@std/assert";
import { matrix } from "@sekhmet/matrix";

const cases = matrix({
	method: ["GET", "POST"],
	authenticated: [true, false],
});

assertEquals(cases, [
	{ method: "GET", authenticated: true },
	{ method: "GET", authenticated: false },
	{ method: "POST", authenticated: true },
	{ method: "POST", authenticated: false },
]);
```

The first key varies slowest and the last key fastest. The number of cases is
the product of the array lengths, so a key with an empty array produces no cases
at all.

In a test file, register one test per case:

```ts
import { assert } from "@std/assert";
import { matrix } from "@sekhmet/matrix";

for (const { a, b } of matrix({ a: [1, 2, 3], b: [10, 20] })) {
	Deno.test(`${a} + ${b} is greater than both`, () => {
		assert(a + b > a && a + b > b);
	});
}
```

`@sekhmet/matrix/mini` exports the same `matrix` function and its `Matrix` and
`MatrixCase` types.

## Learn more

- API reference: [jsr.io/@sekhmet/matrix](https://jsr.io/@sekhmet/matrix).
- [Docs site](https://ben-laird.github.io/sekhmet/matrix/).

## License

MIT. See
[LICENSE.md](https://github.com/ben-laird/sekhmet/blob/main/packages/matrix/LICENSE.md).
