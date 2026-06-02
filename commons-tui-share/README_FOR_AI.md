# Commons TUI / Theme — Share Bundle

This folder is a **read-only, in-place snapshot** of the work-in-progress
"Commons" TUI visual layer for [opencode](https://github.com/sst/opencode).
It contains the exact files as they exist in the working tree of the source
repo, copied with their original relative paths. Nothing in this folder is
meant to be modified — it is a reference bundle for inspection and for
re-applying the same changes to a fresh opencode fork.

The host repo is intentionally untouched. The originals still live in
`packages/opencode/...` in the source tree.

---

## Goal of the experiment

A separate internal product line (codenamed **Commons**) is exploring a
distinct visual identity for the opencode TUI. The goal is to:

1. Ship a custom **animated background layer** that breathes in/out based on
   the user's state (idle / typing / thinking / replying / welcome).
2. Ship a paired **"commons" theme** with a blue-void palette and brand
   typography.
3. Re-skin the home, session, sidebar, and prompt surfaces so the
   background and panels read correctly together (transparent panels,
   tighter padding, custom logo, "Commons" terminal title and footer word).
4. Keep every change behind a single experimental flag so the upstream
   opencode TUI remains the default.

The experiment is **not** an upstream product. It is a visual prototype that
will likely be maintained as a long-running fork of `dev` until/unless the
Commons product gets its own release channel.

---

## Core vs polish

The bundle contains three layers of files. Use this list when deciding what
to inspect, what to apply, and what to throw away if you only want the
spirit of the experiment.

### Core (defines the experiment — keep these)

- `packages/opencode/src/cli/cmd/tui/component/commons-bg.tsx`
  The entire animated background. `CommonsBgRenderable` extends
  `FrameBufferRenderable` from `@opentui/core`, paints a flow-field of
  donut/triangle/swirl characters in a hardcoded blue-void palette, and
  has a top signal bar that responds to typing/thinking/idle/welcome
  modes. Also dials the renderer to 20 FPS while mounted.

- `packages/opencode/src/cli/cmd/tui/context/theme/commons.json`
  The "commons" theme definition. Adds a `defs` block (void bg/deep/grid/
  muted/soft/dust/line/bright/bright2/panel/panelDim/white/bgBlue1..5) and
  maps the standard `TuiThemeCurrent` slots onto those defs.

- `packages/opencode/src/cli/cmd/tui/config/tui-schema.ts`
  Adds the `commons_theme_experimental: boolean` field to `TuiInfo`. This
  is the single switch that gates the whole experiment.

- `packages/opencode/src/cli/cmd/tui/context/theme.tsx`
  Registers the `commons` theme in `DEFAULT_THEMES` so it shows up in
  `theme.switch` and the theme list dialog.

- `packages/opencode/src/cli/cmd/tui/app.tsx`
  Wires the flag to behavior:
  - Mounts `<CommonsBg />` at the bottom of the app tree when the flag is on.
  - Sets the terminal title to `Commons` / `Commons | <session>`.
  - Auto-selects the `commons` theme when the flag is on.

- `packages/opencode/.opencode/tui.json`
  Project-local config that turns the flag on (`{ "commons_theme_experimental": true }`).
  This is the only file the user must create to opt in.

### Polish (re-skin surfaces to match the background — keep, but easier to revert)

- `packages/opencode/src/cli/cmd/tui/routes/home.tsx`
  Replaces the OpenCode `Logo` with a hand-drawn ASCII "Commons" wordmark
  when the flag is on, and removes the `<home_bottom>` slot and the extra
  spacer so the background reads as one composition.

- `packages/opencode/src/cli/cmd/tui/routes/session/index.tsx`
  Drops message `paddingBottom` and `gap` to 0, and uses a translucent
  `RGBA.fromInts(0, 0, 0, 160)` panel so the background bleeds through.
  Also tightens the user-message `paddingBottom`.

- `packages/opencode/src/cli/cmd/tui/routes/session/sidebar.tsx`
  Uses the same translucent panel, and replaces the "OpenCode" footer
  wordmark with "Commons" when the flag is on.

- `packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx`
  Tighter spacing under the flag (background-panel tweaks). Search the
  file for `commons_theme_experimental` to see the exact call sites.

- `packages/opencode/src/cli/cmd/tui/feature-plugins/system/session-v2.tsx`
  Two cosmetic icon changes (`▣` → `ⓒ`) in the internal v2 debug plugin so
  the agent-switch indicator reads as a Commons-style glyph. Not user
  facing unless you navigate to the `session.v2.messages` debug route.

### Config / opt-in (keep)

- `packages/opencode/.opencode/tui.json` is also listed under Core; it
  belongs in both buckets because it is both the feature gate and the
  thing the user actually touches.

---

## How the feature is enabled

The feature is entirely gated on a single boolean in the TUI config:

```jsonc
// packages/opencode/.opencode/tui.json  (project-local)
// or in ~/.config/opencode/tui.json     (global)
{
  "commons_theme_experimental": true
}
```

When that flag is true, `app.tsx` does three things in this order:

1. The `ThemeProvider` auto-switches the active theme to `"commons"`.
2. The terminal window title becomes `Commons` (or `Commons | <title>`).
3. `<CommonsBg />` is mounted as the last child of the root box, so it
   renders behind every other surface.

When the flag is false or absent, none of the polish code paths run — the
background is never mounted, the theme stays at the user's selection, the
title is `OpenCode`, the logo is the original, and the session/sidebar
panels use the opaque `theme.backgroundPanel` instead of the translucent
black.

The "commons" theme is **always** available in the theme list dialog
(`theme.switch`), even when the flag is off, because it is registered in
`DEFAULT_THEMES`. The flag is only the auto-select + background combo.

---

## Main visual changes

In order of impact on what the user sees:

1. **Animated background** — a flow field of blue tones with a "donut /
   triangle / swirl" character set, breathing between 0 and full opacity.
   Modes: `idle` (0), `welcome` (0.72 — the home screen), `typing` (1.0
   while a key is pressed), `thinking`/`replying` (1.0 while the agent is
   working). Top row is a wave / glint line with a `agent thinking` label
   during `thinking`/`replying`.
2. **Blue-void theme** — backgrounds are `#030712`-class voids, accents
   are the `#061BFF`-class electric blue, panels are transparent so the
   background shows through. Markdown / syntax colors re-derived from
   the defs block.
3. **Custom Commons logo** — six-line ASCII wordmark on the home screen,
   centered, electric-blue foreground, replacing the OpenCode logo.
4. **Transparent panels** — session view, sidebar, and prompt get a
   translucent `RGBA.fromInts(0, 0, 0, 160)` background, paddingBottom
   drops to 0 in the session view, and `gap` between messages drops to 0.
5. **Brand swap** — sidebar footer says "Commons" instead of "OpenCode";
   terminal title says "Commons" or "Commons | <session>".
6. **Renderer throttling** — when the background mounts, `targetFps` and
   `maxFps` are both clamped to 20 to keep the flow field cheap. They are
   restored on cleanup.
7. **Agent glyph swap (debug only)** — `▣` becomes `ⓒ` in the v2 message
   plugin's agent indicator.

---

## Fork / upstream risk concern

This is the most important section for the next maintainer.

Most of the changes are **modifications to files that opencode's `dev`
branch also evolves aggressively**: `app.tsx`, `theme.tsx`,
`tui-schema.ts`, `routes/session/index.tsx`, `routes/session/sidebar.tsx`,
`routes/home.tsx`, `component/prompt/index.tsx`, and
`feature-plugins/system/session-v2.tsx`. The Commons work is the kind of
work that **does not merge cleanly**. Expect every rebase against `dev`
to produce conflicts in these files, because:

- `app.tsx` is the render-root — anything touching provider ordering,
  terminal title, or the new background mount will collide.
- `theme.tsx` is the theme registry — adding a new default theme or
  evolving `DEFAULT_THEMES` shape will collide.
- `tui-schema.ts` is the config schema — new fields get added all the time.
- `routes/session/index.tsx` and `routes/home.tsx` are the heaviest
  call sites; both are large, busy files.
- `component/prompt/index.tsx` is the prompt input — it is one of the
  files that gets touched by almost every TUI change.

The **new** files (`commons-bg.tsx`, `commons.json`, `.opencode/tui.json`)
are additive and have effectively zero merge risk — they live in their own
namespaces and don't conflict with anything upstream.

**Recommendation for a long-lived fork:**

- Keep the additive files in `commons-tui-share` as the "always apply"
  patch.
- Re-derive the modifications to the shared files by reading the
  Commons-specific call sites (`grep commons_theme_experimental` in each
  file) and re-inserting the Commons branches on top of the fresh
  upstream code. Don't try to apply the diff hunks blindly.
- The two icon-character changes in `session-v2.tsx` are pure cosmetics
  and can be dropped without affecting the visual experiment.

---

## Inspecting the work without modifying it

You are reading the share bundle right now. That is the entire inspection
workflow. Concretely:

1. Read this README and `FILES_CHANGED.md` first.
2. Read the new files in this order: `commons-bg.tsx` → `commons.json` →
   `tui-schema.ts` → `theme.tsx` (the registry line) → `app.tsx` (the
   three effect blocks + the `Show` near the end) → `.opencode/tui.json`.
   That covers the full "what is the experiment" loop.
3. Read the polish files (`home.tsx`, `session/index.tsx`, `sidebar.tsx`,
   `prompt/index.tsx`, `session-v2.tsx`) only if you care how the surfaces
   were re-skinned.
4. To see the actual diffs against upstream, run `git diff` in the source
   tree — the working tree is unchanged. The diff will show the same
   hunks that produced the files in this folder.

**Do not** copy files out of `commons-tui-share/` back into the working
tree of the source repo. The whole point of the bundle is that the
working tree is the source of truth, and this folder is a frozen
snapshot.

**Do not** run `bun dev` from inside `commons-tui-share/`. It is not a
package — it has no `package.json`, no `node_modules`, and no entry
point. The actual entry point is the source repo's
`packages/opencode/`.

---

## Recreating the changes on a fresh opencode fork

The "apply" order matters. Do it in this order, run `bun typecheck`
between groups, and stop at the first error.

### 1. Bootstrap a fresh opencode

```sh
git clone https://github.com/sst/opencode.git
cd opencode
bun install
```

### 2. Drop in the additive files (zero risk, no conflicts)

Copy these three files from `commons-tui-share/packages/opencode/` into
the corresponding path in your fresh tree:

- `src/cli/cmd/tui/component/commons-bg.tsx`
- `src/cli/cmd/tui/context/theme/commons.json`
- `.opencode/tui.json`

The third one is the opt-in. Edit it to set
`"commons_theme_experimental": true` if you want the background to
auto-mount. Set it to `false` if you only want the theme available
without the animation.

### 3. Register the theme and the flag

Edit `packages/opencode/src/cli/cmd/tui/context/theme.tsx`:

- Add `import commons from "./theme/commons.json" with { type: "json" }`
  next to the other theme imports.
- Add `commons` to the `DEFAULT_THEMES` object.

Edit `packages/opencode/src/cli/cmd/tui/config/tui-schema.ts`:

- Add `commons_theme_experimental: Schema.optional(Schema.Boolean).annotate({...})`
  to the `TuiInfo` struct. The annotation description is up to you.

Edit `packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx`
**only if you also want the prompt polish** — add the
`commons_theme_experimental` branch around the spacing. Otherwise skip.

### 4. Wire the flag to behavior in `app.tsx`

In `packages/opencode/src/cli/cmd/tui/app.tsx`:

- Add `import { CommonsBg } from "@tui/component/commons-bg"`.
- In the terminal-title `createEffect`, swap `tuiConfig.commons_theme_experimental ? "Commons" : "OpenCode"` for both the brand and brandShort strings.
- Add a `createEffect` that, when `commons_theme_experimental` is on and `themeState.selected !== "commons"`, calls `themeState.set("commons")`.
- Near the end of the root JSX, add a `<Show when={tuiConfig.commons_theme_experimental}><CommonsBg /></Show>` after the main content but inside the root box.

### 5. Apply the polish (optional, but recommended)

For each of the polish files, find the existing
`tuiConfig.commons_theme_experimental` branches in the share copy and
port them onto the fresh upstream code. The branches are small,
isolated `?: ... : ...` swaps on padding, backgroundColor, and
`<Logo />` / `<text>` children. Don't paste the whole file — paste the
branches.

If the upstream version of `home.tsx` or `session/index.tsx` has moved
or renamed the elements you are wrapping, search the file for the
closest equivalent and adapt.

### 6. Build, run, and verify

```sh
cd packages/opencode
bun typecheck
bun dev
```

You should see the Commons background fade in on the home screen, the
"Commons" wordmark replace the OpenCode logo, and a translucent
session view when you create or open a session. Press the
`theme.switch` command in the command palette to confirm the `commons`
theme is in the list.

### 7. Maintenance

- Rebase against `dev` regularly. Expect conflicts in the eight
  modified files listed in `FILES_CHANGED.md`; resolve by
  re-applying the `commons_theme_experimental` branch from the new
  upstream context, not by force-applying the old diff.
- If a file in the additive set changes upstream (e.g. the renderer
  API moves), update the additive file in the share bundle and re-copy
  it into your fork.
- Keep `.opencode/tui.json` out of source control (it is
  user-local). The share bundle keeps a copy for reference.
