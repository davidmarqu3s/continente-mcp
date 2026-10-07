# Development

```bash
git clone https://github.com/davidmarqu3s/continente-mcp
cd continente-mcp
npm install
npm run setup
npm test
```

Tests run against isolated state and never touch a real account. They cannot prove that Continente's live pages still match the parsers, so after changing a parser, check the affected tool against the live site. Never place an order or pay while testing.

Before opening a PR:

```bash
npm test
npm audit --omit=dev
npm pack --dry-run
```

Use Conventional Commit PR titles (`fix:`, `feat:`, `docs:`, …). Release steps are in [releases.md](releases.md).
