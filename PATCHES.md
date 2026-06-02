# Commons fork patches

This fork (Commons) modifies upstream opencode. Most customization lives in **new files** (safe — merges can't touch them). The danger is the handful of **in-place edits to upstream "hot" files**: when upstream heavily refactors one of these, the merge gets resolved as *"take theirs + re-apply ours,"* and it's easy to **silently miss one of our pieces**. A clean auto-merge does **not** mean our edits survived.

> **After every `anomalyco/dev` merge, run the checklist at the bottom.** This already bit us once: the forced-auth `<Match>` in `app.tsx` was dropped during the `tui`→`mountTui` refactor merge (`69a88f9ed`) and went unnoticed for weeks because we always had creds and never hit the forced-auth screen.

## In-place edits to upstream files (HIGH merge risk — verify these)

### `packages/opencode/src/cli/cmd/tui/app.tsx` — forced auth (4 pieces, all required)
1. `import { Auth } from "@tui/routes/auth"`
2. imports for `Global` (`@opencode-ai/core/global`), `nodeFs` (`node:fs`), `nodePath` (`node:path`)
3. the `hasCommonsCreds()` helper function
4. `initialRoute={... : hasCommonsCreds() ? undefined : { type: "auth" }}` inside `mountTui`'s `<RouteProvider>`
5. **`<Match when={route.data.type === "auth"}><Auth /></Match>`** in the render `<Switch>` ← the one that got dropped; without it the route is set to "auth" but renders **blank/black**.

### `packages/opencode/src/cli/cmd/tui/plugin/api.tsx`
- `if (route.data.type === "auth") return { name: "auth" }` in `routeCurrent`.

### `packages/opencode/src/config/config.ts` — seed (in `loadGlobal`)
- Seeds the global config: `model: "commons/deepseek/deepseek-v4-flash"`, `theme: "commons"`, `autoupdate: false`, `enabled_providers`, and the `commons` provider block (baseURL `${COMMONS_GATEWAY_URL}/v1`, models flash + pro). Seed only writes on first run (`!existsSync`); `theme` is a default users/project configs can override.

### `packages/opencode/src/cli/cmd/tui/context/theme.tsx` — register + default the Commons theme
- (a) import `commons` from `./theme/commons.json` + add `commons,` to `DEFAULT_THEMES`.
- (b) the default-theme fallback (`config.theme ?? kv.get("theme", "commons")` + the `: "commons"` guard) — was `"opencode"`. This makes Commons the default for anyone who hasn't explicitly picked another theme (fresh OR existing), not just fresh installs the seed reaches. The palette lives in the new `theme/commons.json` (safe); these are the in-place parts.

### `packages/opencode/src/cli/cmd/tui/component/dialog-model.tsx`
- Sort puts `commons` first; "Free" tag for `commons`/`opencode` providers.

### `packages/opencode/src/cli/cmd/tui/plugin/internal.ts`
- Registers `SidebarAd` (the ad plugin) in `internalTuiPlugins()`.

### `packages/opencode/script/build.ts`
- `const PRODUCT = "commons"` (binary name, targets, smoke-test path).

### `packages/opencode/src/cli/cmd/tui/routes/home.tsx` — boot-screen gate (HIGHEST merge risk of the branding edits)
- Imports `BootScreen` + `useOpencodeKeymap`; adds a `bootDismissed` signal (initialized `!!args.prompt` so `--prompt` skips the gate and auto-submit still works). On mount, intercepts `return` key at priority 100 to set `bootDismissed`. The render is wrapped in `<Show when={bootDismissed()} fallback={<BootScreen status="Press enter to continue"/>}>` — full-screen boot animation until the user presses Enter, then the existing home content (Logo + Prompt + slots) renders. **There is no longer a BootWave layer behind the prompt** — boot-screen is its own state, prompt view is clean. If upstream restructures home render, this is the bit that conflicts/drops — re-apply by hand, same as the auth `<Match>` lesson. (Idle CPU lever: `renderer.targetFps` in `boot-screen.tsx`, currently 30.)

### `packages/opencode/src/cli/cmd/tui/routes/auth.tsx` — boot-screen replaces the entire render
- The Auth route is now **just `<BootScreen status={statusFor(phase())}/>`** in an absolute full-screen box. The phase-specific status text ("Press enter to open browser" / "Opening browser" / "Waiting for browser authorization" / "Saving credentials" / "Signed in" / "Sign in failed — press enter to try again") plumbs into the painter's spinner+status line. The Switch/Match render is gone; the painter owns all visible text. Keymap is unchanged — Enter on `intro`/`error` triggers `runFlow()`. The auth URL is no longer displayed (relies on `open()` opening the browser).

### `packages/opencode/src/cli/logo.ts` — COMMONS logo art
- Replaced upstream's `logo` shape with the chafa-derived COMMONS wordmark (5 rows). Upstream edits this occasionally; on conflict, keep ours. (`go` + `marks` unchanged.)

### `packages/opencode/src/index.ts` — CLI `-h` branding
- `.scriptName("commons")` (was "opencode") → usage header + command examples in `-h` say "commons".
- `show()` helper's prefix check `text.startsWith("commons ")` (was "opencode ") — MUST move with scriptName, else help output gets a stray logo banner. NOTE: internal `OPENCODE_*` env vars, `opencode.json` config discovery, `@opencode-ai/*` imports are intentionally LEFT as-is (invisible to users, merge-critical).

### Cosmetic CLI string branding (low-priority — a merge reverting these is harmless, not in the must-pass checklist)
User-visible `opencode`→`commons` swaps in help/output strings only: `cli/error.ts` (MCP-auth note + `commons models` hint), `cli/cmd/pr.ts:10` (describe), `cli/cmd/uninstall.ts:27` (describe), `cli/cmd/mcp.ts` (outro hint + placeholder). Deliberately NOT touched (functional/infra): all of `github.ts`, `account.ts`/`agent.ts` URLs+dirs, `network.ts` mDNS `opencode.local`, `error.ts:68` `opencode.json` filename, and `pr.ts` spawning the `opencode` binary (a real fork bug, deferred).

### `packages/opencode/src/provider/provider.ts` — `reset` on Provider Interface (NEW: hot file as of 2026-06-02 merge)
- Upstream added `reset` to the `Provider.Interface`, then dropped it during a `ProviderID → ProviderV2.ID` refactor. **We rely on it**: `routes/auth.tsx:48` calls `sdk.client.provider.reset({}, ...)` immediately after `auth.set()` so the in-process provider list sees the new Commons key without a TUI restart. The impl (`const reset = Effect.fn("Provider.reset")(...)`, ~line 1865), the `Service.of({..., reset})` registration, the route handler in `httpapi/handlers/provider.ts`, the route registration in `httpapi/groups/provider.ts`, the SDK gen `/provider/reset`, and `openapi.json` are all upstream-preserved — only the public interface line keeps disappearing on refactors. Keep `readonly reset: () => Effect.Effect<void>` at the end of the Interface block. Comment in-file explains why on conflict.

### typecheck shims (Provider interface gained `reset`)
- `packages/opencode/test/fake/provider.ts` — `reset:` stub.

## New files (no merge risk — upstream doesn't have them)
- `src/commons/const.ts` — `COMMONS_GATEWAY_URL`, `COMMONS_WEB_URL`
- `src/auth/commons-flow.ts` — browser auth flow
- `src/cli/cmd/commons.ts` — `commons login`
- `src/cli/cmd/tui/routes/auth.tsx` — the forced-auth screen component (`Auth`)
- `src/cli/cmd/tui/feature-plugins/sidebar/ad.tsx` — sidebar ad plugin
- `.github/workflows/commons-release.yml` — CI release
- `feature-plugins/sidebar/game.tsx` — Mole Tap (only on `game-test` branch)
- `src/cli/cmd/tui/context/theme/commons.json` — Commons brand theme palette
- `src/cli/cmd/tui/component/boot-wave.tsx` + `boot-wave-render.ts` — **PARKED.** Was the half-block radial wave shipped before; superseded by `boot-screen` (below). Kept on disk as a fallback in case we want to revert. Not imported by any route anymore. Delete when we're confident boot-screen is the keeper.
- `src/cli/cmd/tui/component/boot-screen.tsx` + `boot-screen-render.ts` — full-screen animated boot panel (density-ASCII wobble field + decorative figlet COMMONS logo + reactive edge glyphs + spinner/status line). Faithful port of Slayed's `commons-terminal-ascii-flow-v44-animated-status.js`. Drives both routes via a single `<BootScreen status={...} />` component; the painter owns the entire surface (no separate Logo/text components). Color knob: `BRAND_BLUE` hardcoded in `boot-screen.tsx` (intentionally NOT `theme.primary` — Slayed wants blue, dark-mode theme.primary resolves to yellow). Same opentui API caveat as boot-wave: re-sync after big `@opentui/*` bumps.

## Post-merge checklist
Run from repo root after `git merge anomalyco/dev` (a clean auto-merge is NOT enough):
```bash
F=packages/opencode/src/cli/cmd/tui/app.tsx
grep -c 'type === "auth"' "$F"            # expect 1 (the render <Match>; uses ===)
grep -c 'type: "auth"' "$F"               # expect 1 (the initialRoute forced-auth; uses : not ===)
grep -c 'hasCommonsCreds' "$F"            # expect 2
grep -c 'routes/auth' "$F"                # expect 1 (the Auth import)
grep -c 'deepseek-v4-flash' packages/opencode/src/config/config.ts   # expect >=1
grep -c 'SidebarAd' packages/opencode/src/cli/cmd/tui/plugin/internal.ts  # expect 2
grep -c '=== "auth"' packages/opencode/src/cli/cmd/tui/plugin/api.tsx     # expect 1
grep -c 'scriptName("commons")' packages/opencode/src/index.ts           # expect 1 (-h branding)
grep -c 'BootScreen' packages/opencode/src/cli/cmd/tui/routes/home.tsx   # expect 2 (import + mount in <Show> fallback)
grep -c 'bootDismissed' packages/opencode/src/cli/cmd/tui/routes/home.tsx # expect >=3 (signal + intercept guard + Show when)
grep -c 'BootScreen' packages/opencode/src/cli/cmd/tui/routes/auth.tsx   # expect 2 (import + mount)
grep -c 'statusFor' packages/opencode/src/cli/cmd/tui/routes/auth.tsx    # expect 2 (decl + call)
grep -cF '▄█████▄' packages/opencode/src/cli/logo.ts                     # expect >=3 — our COMMONS half-block wordmark uses this glyph cluster; if 0, upstream's logo overwrote ours
grep -cF 'reset: () => Effect.Effect<void>' packages/opencode/src/provider/provider.ts # expect 1 — our reset Interface line; auto-merge keeps dropping it on ProviderV2.ID refactors
grep -c 'commons' packages/opencode/src/cli/cmd/tui/context/theme.tsx    # import + map entry + default fallback (kv.get + guard)
grep -c '"commons"' packages/opencode/src/config/config.ts               # theme + model + provider refs
```
Then **actually boot it with no creds** (`rm ~/.local/share/commons/auth.json` → `bun dev <repo>`) to confirm the forced-auth screen renders — typecheck passing does not catch a missing `<Match>`.

**Also: always `bun install` after a big upstream pull** — merges bump deps (esp. `@opentui/*`), and stale `node_modules` = blank/black TUI.
