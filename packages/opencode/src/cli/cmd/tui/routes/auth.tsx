import { createSignal, onCleanup, onMount } from "solid-js"
import open from "open"
import { BootScreen } from "../component/boot-screen"
import { useRoute } from "@tui/context/route"
import { useSync } from "@tui/context/sync"
import { useSDK } from "@tui/context/sdk"
import { useOpencodeKeymap } from "../keymap"
import { startCommonsAuthFlow } from "@/auth/commons-flow"

type Phase = "intro" | "opening" | "waiting" | "saving" | "success" | "error"

// Status line shown beneath the COMMONS logo. Phase-specific so the user can
// see exactly where the auth flow is — no separate dialog component, the
// painter owns this text.
function statusFor(phase: Phase): string {
  switch (phase) {
    case "intro":
      return "Press enter to open browser"
    case "opening":
      return "Opening browser"
    case "waiting":
      return "Waiting for browser authorization"
    case "saving":
      return "Saving credentials"
    case "success":
      return "Signed in"
    case "error":
      return "Sign in failed — press enter to try again"
  }
}

export function Auth() {
  const route = useRoute()
  const sync = useSync()
  const sdk = useSDK()
  const keymap = useOpencodeKeymap()
  const [phase, setPhase] = createSignal<Phase>("intro")

  async function runFlow() {
    try {
      const flow = startCommonsAuthFlow()
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
    } catch {
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
        <BootScreen status={statusFor(phase())} />
      </box>
    </box>
  )
}
