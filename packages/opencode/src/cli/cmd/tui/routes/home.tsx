import { Prompt, type PromptRef } from "@tui/component/prompt"
import { createEffect, createMemo, createSignal, onMount, Show } from "solid-js"
import { Logo } from "../component/logo"
import { useSync } from "../context/sync"
import { Toast } from "../ui/toast"
import { useArgs } from "../context/args"
import { useRouteData } from "@tui/context/route"
import { usePromptRef } from "../context/prompt"
import { useLocal } from "../context/local"
import { TuiPluginRuntime } from "@/cli/cmd/tui/plugin/runtime"
import { useEditorContext } from "@tui/context/editor"
import { useTerminalDimensions } from "@opentui/solid"
import { useTuiConfig } from "../context/tui-config"
import { useTheme } from "@tui/context/theme"
import { useCommandShortcut } from "../keymap"
import { Locale } from "@/util/locale"

let once = false
const placeholder = {
  normal: ["What is the tech stack of this project?", "What is the tech stack of this project?", "What is the tech stack of this project?"],
  shell: ["ls -la", "git status", "pwd"],
}

export function Home() {
  const sync = useSync()
  const route = useRouteData("home")
  const promptRef = usePromptRef()
  const [ref, setRef] = createSignal<PromptRef | undefined>()
  const args = useArgs()
  const local = useLocal()
  const editor = useEditorContext()
  const dimensions = useTerminalDimensions()
  const tuiConfig = useTuiConfig()
  const { theme } = useTheme()
  const agentShortcut = useCommandShortcut("agent.cycle")
  const paletteShortcut = useCommandShortcut("command.palette.show")
  const promptMaxWidth = createMemo(() => {
    const configured = tuiConfig.prompt?.max_width
    if (configured === "auto") return Math.max(75, Math.floor(dimensions().width * 0.7))
    return configured ?? 75
  })
  let sent = false

  onMount(() => {
    editor.clearSelection()
  })

  const bind = (r: PromptRef | undefined) => {
    setRef(r)
    promptRef.set(r)
    if (once || !r) return
    if (route.prompt) {
      r.set(route.prompt)
      once = true
      return
    }
    if (!args.prompt) return
    r.set({ input: args.prompt, parts: [] })
    once = true
  }

  // Wait for sync and model store to be ready before auto-submitting --prompt
  createEffect(() => {
    const r = ref()
    if (sent) return
    if (!r) return
    if (!sync.ready || !local.model.ready) return
    if (!args.prompt) return
    if (r.current.input !== args.prompt) return
    sent = true
    r.submit()
  })

  return (
    <>
      <box flexGrow={1} alignItems="center" paddingLeft={2} paddingRight={2}>
        <box flexGrow={1} minHeight={0} />
        {tuiConfig.commons_theme_experimental ? (
          <>
            <box height={2} minHeight={2} flexShrink={0} />
            <box height={10} minHeight={10} flexShrink={0} alignItems="center" />
            <box height={0} minHeight={0} flexShrink={1} />
            <box width="100%" maxWidth={promptMaxWidth()} zIndex={1000} flexShrink={0}>
              <TuiPluginRuntime.Slot name="home_prompt" mode="replace" ref={bind}>
                <Prompt ref={bind} right={<TuiPluginRuntime.Slot name="home_prompt_right" />} placeholders={placeholder} hideFooter contentPaddingLeft={4} />
              </TuiPluginRuntime.Slot>
            </box>
          </>
        ) : (
          <>
            <box height={4} minHeight={0} flexShrink={1} />
            <box flexShrink={0}>
              <TuiPluginRuntime.Slot name="home_logo" mode="replace">
                <Logo />
              </TuiPluginRuntime.Slot>
            </box>
            <box height={1} minHeight={0} flexShrink={1} />
            <box width="100%" maxWidth={promptMaxWidth()} zIndex={1000} paddingTop={1} flexShrink={0}>
              <TuiPluginRuntime.Slot name="home_prompt" mode="replace" ref={bind}>
                <Prompt ref={bind} right={<TuiPluginRuntime.Slot name="home_prompt_right" />} placeholders={placeholder} />
              </TuiPluginRuntime.Slot>
            </box>
            <TuiPluginRuntime.Slot name="home_bottom" />
          </>
        )}
        <box flexGrow={1} minHeight={0} />
        <Toast />
      </box>
      {tuiConfig.commons_theme_experimental ? (
        <box
          position="absolute"
          bottom={0}
          left={0}
          width="100%"
          flexDirection="row"
          justifyContent="space-between"
          paddingLeft={2}
          paddingRight={2}
          paddingBottom={1}
        >
          <box flexShrink={0} flexDirection="row" gap={1}>
            <Show when={local.agent.current()}>
              {(agent) => (
                <text>
                  <span style={{ fg: theme.text }}>
                    {Locale.titlecase(agent().name)}
                  </span>
                  <Show when={local.model.parsed().model}>
                    <span style={{ fg: theme.textMuted }}> · </span>
                    <span style={{ fg: theme.textMuted }}>
                      {local.model.parsed().model}
                    </span>
                  </Show>
                </text>
              )}
            </Show>
          </box>
          <box gap={2} flexDirection="row" flexShrink={0}>
            <text fg={theme.text}>
              {agentShortcut()} <span style={{ fg: theme.textMuted }}>agents</span>
            </text>
            <text fg={theme.text}>
              {paletteShortcut()} <span style={{ fg: theme.textMuted }}>commands</span>
            </text>
          </box>
        </box>
      ) : null}
    </>
  )
}
