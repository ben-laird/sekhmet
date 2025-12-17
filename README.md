# Sekhmet: The Toolchain of Powerful Safety

Sekhmet is a collection of frameworks aimed at giving developers the power to
express things safely.

## Features

1. **Environment-agnostic.** All frameworks here should run pretty much anywhere
   JS or TS is supported.
2. **Type-safe.** Instantly get errors and hints as you type.
3. **Generic & Composable.** Slot in your own behavior using generics and enjoy
   enterprise-grade expressive power with just a couple compositions.
4. **Dependency-free.** We don't use external dependencies from a package
   registry in our source code. If we depend on it, you can find it on MDN or in
   this codebase.
5. **Self-contained.** You can have as many copies of the exact same framework
   running as you'd like, and they'll never cross wires or share state unless
   you want them to.
6. **Primitive-driven development.** We start with very simple primitives that
   can be composed into complex systems, giving you the freedom to do the same
   and even come up with your own primitives.
7. **ESM-native.** Built in ESM, for ESM.
8. **Tree-shakable options.** Many Sekhmet frameworks come in a `mini` variant,
   allowing you to use exactly what you want to and nothing more.
9. **TS at its strictest.** We use the strictest options we can in our compiler
   options.
10. **Ready for `isolatedDeclarations`.** We use `isolatedDeclarations` for
    maximal compatibility with future TS enhancements (and JSR).
