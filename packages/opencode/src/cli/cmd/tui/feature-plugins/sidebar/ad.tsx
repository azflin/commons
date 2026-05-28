import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { InternalTuiPlugin } from "../../plugin/internal"
import { createSignal, Show } from "solid-js"
import open from "open"
import { COMMONS_GATEWAY_URL } from "../../../../../commons/const"

// Sidebar ad. The creative is DB-backed on the gateway (change with a SQL
// UPDATE — no binary change). Mouse-driven (sidebar can't take keyboard focus):
// click opens the URL. Renders nothing when there's no active ad.
const id = "internal:sidebar-ad"
const REFRESH_MS = 5 * 60_000

type Ad = { label: string; headline: string; body: string | null; url: string | null }

// ONE poller for the whole process, decoupled from component lifecycle. The
// sidebar mounts the View multiple times (inline + overlay, per session) and
// re-renders during streaming — fetching *inside* the component would spam the
// API. Instead we poll once at module level into a signal everyone reads.
const [currentAd, setCurrentAd] = createSignal<Ad | null>(null)
let pollingStarted = false

async function loadAd() {
  try {
    const res = await fetch(`${COMMONS_GATEWAY_URL}/ads/current`)
    if (!res.ok) return
    const json = (await res.json()) as { ad: Ad | null }
    setCurrentAd(json.ad ?? null)
  } catch {
    // Network blip — keep the last value; the ad just won't update this cycle.
  }
}

function startPolling() {
  if (pollingStarted) return
  pollingStarted = true
  void loadAd()
  setInterval(() => void loadAd(), REFRESH_MS)
}

function View(props: { api: TuiPluginApi }) {
  const theme = () => props.api.theme.current
  return (
    <Show when={currentAd()}>
      {(a) => (
        <box
          onMouseDown={() => {
            const url = a().url
            if (url) void open(url).catch(() => {})
          }}
        >
          <text fg={theme().textMuted}>{a().label}</text>
          <text fg={theme().text}>
            <b>{a().headline}</b>
          </text>
          <Show when={a().body}>
            <text fg={theme().textMuted}>{a().body}</text>
          </Show>
          <Show when={a().url}>
            <text fg={theme().text}>↗ open</text>
          </Show>
        </box>
      )}
    </Show>
  )
}

const tui: TuiPlugin = async (api) => {
  startPolling()
  api.slots.register({
    order: 800,
    slots: {
      sidebar_content(_ctx, _props) {
        return <View api={api} />
      },
    },
  })
}

const plugin: InternalTuiPlugin = {
  id,
  tui,
}

export default plugin
