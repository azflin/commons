/**
 * Browser-redirect auth flow shared by the `commons login` CLI command and
 * the forced-auth TUI route. Pure helpers — no CLI/Effect/Prompt imports.
 */
import { COMMONS_WEB_URL } from "../commons/const"

function successHtml(webUrl: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>commons — signed in</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap" rel="stylesheet">
  <style>
    :root { color-scheme: dark; }
    @font-face {
      font-family: "PP Neue Bit";
      src: url("${webUrl}/fonts/PPNeueBit-Bold.otf") format("opentype");
      font-weight: 700;
      font-display: swap;
    }
    html, body { margin: 0; height: 100%; }
    body {
      background: #061BFF;
      color: #F5F1E9;
      font-family: "Source Serif 4", Georgia, serif;
      display: grid;
      place-items: center;
    }
    main { width: 100%; max-width: 460px; padding: 32px; text-align: center; }
    h1 {
      font-family: "PP Neue Bit", "Source Serif 4", monospace;
      font-size: 72px;
      line-height: 0.9;
      letter-spacing: 0.01em;
      margin: 0 0 20px;
      color: #DBFD00;
    }
    p { font-size: 18px; line-height: 1.55; margin: 0; }
    .hint { margin-top: 16px; font-size: 14px; opacity: 0.7; }
  </style>
</head>
<body>
  <main>
    <h1>commons</h1>
    <p>Signed in.</p>
    <p class="hint">You can close this tab and return to the CLI.</p>
  </main>
</body>
</html>`
}

export interface CommonsAuthFlow {
  authUrl: string
  port: number
  awaitKey: Promise<string>
  cancel: () => void
}

export function startCommonsAuthFlow(): CommonsAuthFlow {
  const webUrl = COMMONS_WEB_URL
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
      return new Response(successHtml(webUrl), { headers: { "content-type": "text/html" } })
    },
  })

  const port: any = server.port
  const authUrl = `${webUrl}/cli-login?port=${port}&state=${encodeURIComponent(state)}`

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
