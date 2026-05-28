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
- Seeds `~/.config/commons/opencode.jsonc`: `model: "commons/deepseek/deepseek-v4-flash"`, `autoupdate: false`, `enabled_providers`, and the `commons` provider block (baseURL `${COMMONS_GATEWAY_URL}/v1`, models flash + pro).

### `packages/opencode/src/cli/cmd/tui/component/dialog-model.tsx`
- Sort puts `commons` first; "Free" tag for `commons`/`opencode` providers.

### `packages/opencode/src/cli/cmd/tui/plugin/internal.ts`
- Registers `SidebarAd` (the ad plugin) in `internalTuiPlugins()`.

### `packages/opencode/script/build.ts`
- `const PRODUCT = "commons"` (binary name, targets, smoke-test path).

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

## Post-merge checklist
Run from repo root after `git merge anomalyco/dev` (a clean auto-merge is NOT enough):
```bash
F=packages/opencode/src/cli/cmd/tui/app.tsx
grep -c 'type === "auth"' "$F"            # expect 2 (initialRoute + Match)
grep -c 'hasCommonsCreds' "$F"            # expect 2
grep -c 'routes/auth' "$F"                # expect 1 (the Auth import)
grep -c 'deepseek-v4-flash' packages/opencode/src/config/config.ts   # expect >=1
grep -c 'SidebarAd' packages/opencode/src/cli/cmd/tui/plugin/internal.ts  # expect 2
grep -c '=== "auth"' packages/opencode/src/cli/cmd/tui/plugin/api.tsx     # expect 1
```
Then **actually boot it with no creds** (`rm ~/.local/share/commons/auth.json` → `bun dev <repo>`) to confirm the forced-auth screen renders — typecheck passing does not catch a missing `<Match>`.

**Also: always `bun install` after a big upstream pull** — merges bump deps (esp. `@opentui/*`), and stale `node_modules` = blank/black TUI.
