# Primordials

The Primordials library contains the constructs that make up the foundation of
Sekhmet.

## Features

1. **Simple.** Only a few fundamental constructs are needed.
2. **Tested.** Extensively tested, both here and throughout Sekhmet.

## Installation

Note that you will often not need to install Sekhmet Primordials, because
they're usually only used internally by other packages. This likely does not
apply if you're building a Sekhmet library of your own though.

Install with your favorite JSR-compatible or NPM-compatible package manager.

### NPM

```bash
npm install @sekhmet/primordials
```

### Yarn

```bash
yarn add @sekhmet/primordials
```

### PNPM

```bash
pnpm add @sekhmet/primordials
```

### Deno

```bash
deno add jsr:@sekhmet/primordials
```

Then simply import the module you'd like to use.

```ts
import { getStructParams, Struct } from "@sekhmet/primordials/struct";
import { Subtle, useSubtle } from "@sekhmet/primordials/subtle";
```

## Usage

See [`struct.test.ts`](./struct.test.ts) for an example of how to use the
`Struct` class, and [`subtle.test.ts`](./subtle.test.ts) for an example of how
to use the `Subtle` class. There are also many examples throughout Sekhmet of
how to use these two classes, feel free to take a look at those as well.
