# Farcaster Test Harness

A standalone host emulator for testing [Farcaster Mini Apps](https://docs.farcaster.xyz/developers/mini-apps) with [Playwright](https://playwright.dev). Loads your mini app in an iframe and speaks the `@farcaster/miniapp-sdk` postMessage protocol (powered by [comlink](https://github.com/GoogleChromeLabs/comlink)), so you can write end-to-end tests without needing the real Farcaster client.

## How it works

`host.html` acts as a Farcaster client stand-in:

1. Loads your mini app in an `<iframe>`
2. Listens for comlink `GET` and `APPLY` messages from the SDK
3. Responds with fixture data using comlink's wire format (`{ id, type: 'RAW', value }`)
4. Tracks the app lifecycle — status goes from `WAITING` to `READY` when `sdk.actions.ready()` is called

### Supported SDK methods

| Method | Type | Response |
|---|---|---|
| `sdk.context` | GET | Returns the selected fixture's context object |
| `sdk.actions.ready()` | APPLY | Acknowledged, sets host status to READY |
| `sdk.actions.addMiniApp()` | APPLY | Returns `{ added: true }` |
| `sdk.actions.signIn()` | APPLY | Returns mock SIWF message + signature |

Any unhandled `APPLY` calls are acknowledged with `null`.

## Fixtures

Three built-in context fixtures are available via the `?fixture=` query parameter:

| Fixture | Description |
|---|---|
| `launcher` (default) | User FID 3621, launcher location |
| `cast_embed` | Cast embed location with cast metadata |
| `notification` | Notification location, `added: true`, notification details |

## Quick start

```bash
pnpm install
npx playwright install  # install browsers if needed
```

### Run against your mini app

Start your mini app dev server (e.g. on `http://localhost:3000`), then open:

```
http://localhost:4000/host.html?url=http://localhost:3000&fixture=launcher
```

### Run the tests

```bash
pnpm test
```

This starts a local server on port 4000 automatically (via Playwright's `webServer` config) and runs all tests.

### Run tests headed (visible browser)

```bash
npx playwright test --headed
```

## Query parameters

| Param | Default | Description |
|---|---|---|
| `url` | `http://localhost:3000` | URL of the mini app to load in the iframe |
| `fixture` | `launcher` | Which context fixture to use |

## Claude Code skill

This repo includes a [Claude Code](https://claude.ai/claude-code) skill that teaches an agent how to use the test harness — the comlink wire protocol, fixture schemas, Playwright test patterns, and Ralph PRD integration.

### Install the skill into your mini app project

From your mini app project directory:

```bash
bash ../farcaster-test-harness/install-skill.sh
```

This copies `SKILL.md` into your project's `.claude/skills/farcaster-test-harness/` directory. Once installed, Claude Code will automatically use the skill when working on Farcaster Mini App testing tasks.

### What the skill provides

- The comlink wire protocol details (critical — not documented in the SDK)
- Context fixture schemas with all required fields
- Playwright test patterns for asserting SDK handshake and iframe content
- App-side SDK integration patterns (correct `ready()` / `context` call order)
- Ralph PRD story templates for automated Mini App builds

## Project structure

```
host.html              # Host emulator page
tests/host.spec.ts     # Playwright tests
playwright.config.ts   # Playwright configuration
SKILL.md               # Claude Code skill (install into your project)
install-skill.sh       # Skill installer script
```

## License

MIT
