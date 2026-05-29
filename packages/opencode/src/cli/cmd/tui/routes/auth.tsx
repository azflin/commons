import { createSignal, onCleanup, onMount, Switch, Match } from "solid-js"
import open from "open"
import { Logo } from "../component/logo"
import { BootWave } from "../component/boot-wave"
import { useTheme } from "@tui/context/theme"
import { useRoute } from "@tui/context/route"
import { useSync } from "@tui/context/sync"
import { useSDK } from "@tui/context/sdk"
import { useOpencodeKeymap } from "../keymap"
import { startCommonsAuthFlow } from "@/auth/commons-flow"

type Phase = "intro" | "opening" | "waiting" | "saving" | "success" | "error"

export function Auth() {
  const { theme } = useTheme()
  const route = useRoute()
  const sync = useSync()
  const sdk = useSDK()
  const keymap = useOpencodeKeymap()
  const [phase, setPhase] = createSignal<Phase>("intro")
  const [message, setMessage] = createSignal<string>("")
  const [authUrl, setAuthUrl] = createSignal<string>("")

  async function runFlow() {
    try {
      const flow = startCommonsAuthFlow()
      setAuthUrl(flow.authUrl)
      setPhase("opening")
      await open(flow.authUrl).catch(() => undefined)
      setPhase("waiting")
      const key = await flow.awaitKey
      setPhase("saving")
      await sdk.client.auth.set({ providerID: "commons", auth: { type: "api", key } as any }, { throwOnError: true })
      await sdk.client.provider.reset({}, { throwOnError: true })
      await sync.refreshProviders()
      setPhase("success")
      setTimeout(() => {
        route.navigate({ type: "home" })
      }, 800)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
      setPhase("error")
    }
  }

  onMount(() => {
    const off = keymap.intercept(
      "key",
      ({ event }) => {
        if (phase() !== "intro" && phase() !== "error") return
        if (event.name !== "return") return
        void runFlow()
      },
      { priority: 100 },
    )
    onCleanup(off)
  })

  return (
    <box flexGrow={1} flexDirection="column">
      <box position="absolute" top={0} left={0} right={0} bottom={0} zIndex={0}>
        <BootWave />
      </box>
      <box flexGrow={1} alignItems="center" paddingLeft={2} paddingRight={2} zIndex={1}>
      <box flexGrow={1} minHeight={0} />
      <box flexShrink={0}>
        <Logo />
      </box>
      <box height={2} minHeight={0} flexShrink={1} />
      <box flexDirection="column" alignItems="center" maxWidth={70} flexShrink={0}>
        <Switch>
          <Match when={phase() === "intro"}>
            <text fg={theme.text}>Sign in to commons to continue.</text>
            <box height={1} />
            <text fg={theme.textMuted}>Press Enter to open browser…</text>
          </Match>
          <Match when={phase() === "opening"}>
            <text fg={theme.text}>Opening browser…</text>
          </Match>
          <Match when={phase() === "waiting"}>
            <text fg={theme.text}>Waiting for browser authorization…</text>
            <box height={1} />
            <text fg={theme.textMuted}>{authUrl()}</text>
          </Match>
          <Match when={phase() === "saving"}>
            <text fg={theme.text}>Saving credentials…</text>
          </Match>
          <Match when={phase() === "success"}>
            <text fg={theme.text}>Signed in.</text>
          </Match>
          <Match when={phase() === "error"}>
            <text fg={theme.text}>Sign in failed.</text>
            <box height={1} />
            <text fg={theme.textMuted}>{message()}</text>
            <box height={1} />
            <text fg={theme.textMuted}>Press Enter to try again.</text>
          </Match>
        </Switch>
      </box>
      <box flexGrow={1} minHeight={0} />
      </box>
    </box>
  )
}
