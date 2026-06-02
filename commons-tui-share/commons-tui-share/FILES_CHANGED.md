# Files Changed — Commons TUI / Theme

| File | Purpose | Risk | Notes |
| --- | --- | --- | --- |
| `packages/opencode/src/cli/cmd/tui/component/commons-bg.tsx` | New file. The entire animated background renderable — flow field, mode-driven opacity, top signal bar, FPS clamp. | **Low** | Additive; no upstream equivalent. Drop in as-is. |
| `packages/opencode/src/cli/cmd/tui/context/theme/commons.json` | New file. Theme definition for `commons` — defs block plus the standard `TuiThemeCurrent` slot mappings. | **Low** | Additive. Drop in as-is. |
| `packages/opencode/.opencode/tui.json` | New file. Project-local config that flips the experimental flag on. | **Low** | Additive, user-local, and gitignored by convention. Drop in as-is. |
| `packages/opencode/src/cli/cmd/tui/config/tui-schema.ts` | Adds the `commons_theme_experimental: boolean` field to `TuiInfo`. This is the single switch that gates the experiment. | **Medium** | New field on a heavily-evolving schema. Re-apply the field, not the hunk — upstream may have added other fields around it. |
| `packages/opencode/src/cli/cmd/tui/context/theme.tsx` | Registers the `commons` theme in `DEFAULT_THEMES` and imports the JSON. | **Medium** | `DEFAULT_THEMES` is a stable object but the import list and key order change often. Re-add the import and the `commons` key after each rebase. |
| `packages/opencode/src/cli/cmd/tui/app.tsx` | Mounts `<CommonsBg />`, swaps the terminal title to `Commons`, and auto-selects the `commons` theme when the flag is on. | **High** | The render root. Anything that touches provider ordering, title, or root-level effects collides. Re-derive the three Commons branches on top of fresh upstream; do not paste the old diff. |
| `packages/opencode/src/cli/cmd/tui/routes/home.tsx` | Replaces the OpenCode logo with a six-line ASCII Commons wordmark; removes the `<home_bottom>` slot and an extra spacer when the flag is on. | **High** | Large, busy route file. Search for `commons_theme_experimental` and re-apply just the branches. |
| `packages/opencode/src/cli/cmd/tui/routes/session/index.tsx` | Drops message `paddingBottom` and `gap` to 0, uses a translucent black panel, and tightens the user-message bottom padding. | **High** | One of the largest files in the TUI. Re-apply the three `commons_theme_experimental` ternaries on the box and message; expect the surrounding JSX to have moved. |
| `packages/opencode/src/cli/cmd/tui/routes/session/sidebar.tsx` | Uses the translucent panel, and replaces the "OpenCode" footer wordmark with "Commons" when the flag is on. | **Medium** | A few isolated ternaries. Search for `commons_theme_experimental` and re-apply. |
| `packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx` | Minor spacing tweaks under the flag. | **High** | The prompt input is touched by almost every TUI change upstream. Search for `commons_theme_experimental` and re-apply just that call site; the rest of the file moves constantly. |
| `packages/opencode/src/cli/cmd/tui/feature-plugins/system/session-v2.tsx` | Two cosmetic icon changes: `▣` → `ⓒ` in the agent indicator (debug-only v2 message plugin). | **Low** | Pure character swap. Safe to drop without affecting the visual experiment. |

## Risk legend

- **Low** — additive only (new file), or pure cosmetics. Drop in as-is or skip.
- **Medium** — modifies a stable file in a stable way. Re-apply after rebase by
  re-adding the small block on top of the new upstream.
- **High** — modifies a file that `dev` evolves aggressively. Always re-derive
  the Commons branches from the new upstream context; never paste the old diff
  blindly.

## What is *not* in the bundle

These were intentionally excluded — they are local to the dev environment
and not part of the Commons visual work:

- `packages/opencode/.opencode/node_modules/`
- `packages/opencode/.opencode/package.json`
- `packages/opencode/.opencode/package-lock.json`
- `packages/opencode/.opencode/bun.lock`
- `packages/opencode/.opencode/.gitignore`

The first four are dependency / lock state from the local bun install. The
last is a per-environment ignore file. None of them are read by opencode at
runtime and none of them affect the Commons experiment.
