# Enum

A framework for representing a collection of possibilities a value could take
without using unions, making checking for variants much easier.

## Features

1. **Comprehensive.** Want to do something with your enum? We got a function for
   that.
2. **Flexible size.** Either use the whole kitchen sink, just the one function,
   or any variation in between. Only pay for what you need for your bundle with
   our `mini` framework flavor for each entrypoint.
3. **Composable & Covariant.** `Enum<A> | Enum<B> <-> Enum<A | B>`

## Installation

Note that you will often not need to install Sekhmet Primordials, because
they're usually only used internally by other packages. This likely does not
apply if you're building a Sekhmet library of your own though.

Install with your favorite JSR-compatible or NPM-compatible package manager.

### NPM

```bash
npm install @sekhmet/enum
```

### Yarn

```bash
yarn add @sekhmet/enum
```

### PNPM

```bash
pnpm add @sekhmet/enum
```

### Deno

```bash
deno add jsr:@sekhmet/enum
```

Then simply import the module you'd like to use.

```ts
import {} from "@sekhmet/framework/entrypoint";
```

## Usage
