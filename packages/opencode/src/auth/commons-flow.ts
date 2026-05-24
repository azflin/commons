/**
 * Browser-redirect auth flow shared by the `commons login` CLI command and
 * the forced-auth TUI route. Pure helpers — no CLI/Effect/Prompt imports.
 */

const DEFAULT_GATEWAY_URL = "http://localhost:8787"

const SUCCESS_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>commons — signed in</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    :root { color-scheme: dark; }
    html, body { margin: 0; height: 100%; }
    body {
      background: #0a0a0a;
      color: #e8e8e8;
      font: 14px ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
      display: grid;
      place-items: center;
    }
    main { width: 100%; max-width: 420px; padding: 32px; }
    h1 { font-size: 28px; letter-spacing: 0.02em; margin: 0 0 24px; }
    p  { line-height: 1.55; color: #b0b0b0; }
  </style>
</head>
<body>
  <main>
    <h1>commons</h1>
    <p>Signed in. You can close this tab and return to the CLI.</p>
  </main>
</body>
</html>`

export interface CommonsAuthFlow {
  authUrl: string
  port: number
  awaitKey: Promise<string>
  cancel: () => void
}

export function startCommonsAuthFlow(): CommonsAuthFlow {
  const gatewayUrl = process.env.COMMONS_GATEWAY_URL ?? DEFAULT_GATEWAY_URL
  const state = crypto.randomUUID()

  let resolveKey!: (k: string) => void
  let rejectKey!: (e: Error) => void
  const awaitKey = new Promise<string>((res, rej) => {
    resolveKey = res
    rejectKey = rej
  })

  const server = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url)
      if (url.pathname !== "/callback") return new Response("Not found", { status: 404 })
      const key = url.searchParams.get("key")
      const got = url.searchParams.get("state")
      if (!key) {
        rejectKey(new Error("Missing key in callback"))
        return new Response("Missing key", { status: 400 })
      }
      if (got !== state) {
        rejectKey(new Error("State mismatch in callback"))
        return new Response("State mismatch", { status: 400 })
      }
      resolveKey(key)
      return new Response(SUCCESS_HTML, { headers: { "content-type": "text/html" } })
    },
  })

  const port: any = server.port
  const authUrl = `${gatewayUrl}/cli-login?port=${port}&state=${encodeURIComponent(state)}`

  return {
    authUrl,
    port,
    awaitKey: awaitKey.finally(() => server.stop()),
    cancel: () => {
      try {
        server.stop()
      } catch {}
      rejectKey(new Error("Cancelled"))
    },
  }
}
