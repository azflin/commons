import { createSignal, onMount, Switch, Match } from "solid-js"
import open from "open"
import nodeFs from "fs"
import nodePath from "path"
import { Global } from "@opencode-ai/core/global"
import { Logo } from "../component/logo"
import { useTheme } from "@tui/context/theme"
import { useExit } from "@tui/context/exit"
import { startCommonsAuthFlow } from "@/auth/commons-flow"

type Phase = "opening" | "waiting" | "writing" | "success" | "error"

export function Auth() {
  const { theme } = useTheme()
  const exit = useExit()
  const [phase, setPhase] = createSignal<Phase>("opening")
  const [message, setMessage] = createSignal<string>("")
  const [authUrl, setAuthUrl] = createSignal<string>("")

  onMount(async () => {
    try {
      const flow = startCommonsAuthFlow()
      setAuthUrl(flow.authUrl)
      setPhase("opening")
      await open(flow.authUrl).catch(() => undefined)
      setPhase("waiting")
      const key = await flow.awaitKey
      setPhase("writing")
      const file = nodePath.join(Global.Path.data, "auth.json")
      let data: Record<string, unknown> = {}
      try {
        data = JSON.parse(nodeFs.readFileSync(file, "utf8"))
      } catch {}
      data.commons = { type: "api", key }
      nodeFs.writeFileSync(file, JSON.stringify(data, null, 2), { mode: 0o600 })
      setPhase("success")
      setTimeout(() => {
        void exit()
      }, 1500)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
      setPhase("error")
    }
  })

  return (
    <box flexGrow={1} alignItems="center" paddingLeft={2} paddingRight={2}>
      <box flexGrow={1} minHeight={0} />
      <box flexShrink={0}>
        <Logo />
      </box>
      <box height={2} minHeight={0} flexShrink={1} />
      <box flexDirection="column" alignItems="center" maxWidth={70} flexShrink={0}>
        <Switch>
          <Match when={phase() === "opening"}>
            <text fg={theme.text}>Opening browser…</text>
          </Match>
          <Match when={phase() === "waiting"}>
            <text fg={theme.text}>Waiting for browser authorization…</text>
            <box height={1} />
            <text fg={theme.textMuted}>{authUrl()}</text>
          </Match>
          <Match when={phase() === "writing"}>
            <text fg={theme.text}>Saving credentials…</text>
          </Match>
          <Match when={phase() === "success"}>
            <text fg={theme.text}>Signed in.</text>
            <box height={1} />
            <text fg={theme.textMuted}>Restart commons to begin.</text>
          </Match>
          <Match when={phase() === "error"}>
            <text fg={theme.text}>Sign in failed.</text>
            <box height={1} />
            <text fg={theme.textMuted}>{message()}</text>
            <box height={1} />
            <text fg={theme.textMuted}>Press Ctrl+C and try again.</text>
          </Match>
        </Switch>
      </box>
      <box flexGrow={1} minHeight={0} />
    </box>
  )
}
