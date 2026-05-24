import { Effect } from "effect"
import open from "open"
import { Auth } from "../../auth"
import { cmd } from "./cmd"
import { effectCmd, fail } from "../effect-cmd"
import { UI } from "../ui"
import * as Prompt from "../effect/prompt"

const GATEWAY_URL = process.env.COMMONS_GATEWAY_URL ?? "http://localhost:8787"
const PROVIDER_ID = "commons"
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

const LoginCommand = effectCmd({
  command: "login",
  describe: "sign in to Commons via browser",
  builder: (yargs) => yargs,
  handler: Effect.fn("Cli.commons.login")(function* (_args) {
    const authSvc = yield* Auth.Service

    UI.empty()
    yield* Prompt.intro("Sign in to Commons")

    const state = crypto.randomUUID()

    let resolveKey!: (k: string) => void
    let rejectKey!: (e: Error) => void
    const keyPromise = new Promise<string>((res, rej) => {
      resolveKey = res
      rejectKey = rej
    })

    const server = Bun.serve({
      port: 0,
      fetch(req) {
        const url = new URL(req.url)
        if (url.pathname !== "/callback") {
          return new Response("Not found", { status: 404 })
        }
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

    const port = server.port
    const authUrl = `${GATEWAY_URL}/cli-login?port=${port}&state=${encodeURIComponent(state)}`

    yield* Prompt.log.info("Opening browser…")
    yield* Prompt.log.info(authUrl)
    yield* Effect.promise(() => open(authUrl).catch(() => undefined))

    const spinner = Prompt.spinner()
    yield* spinner.start("Waiting for browser authorization…")

    const key = yield* Effect.tryPromise({
      try: () => keyPromise,
      catch: (e) => new Error(e instanceof Error ? e.message : String(e)),
    }).pipe(
      Effect.ensuring(Effect.sync(() => server.stop())),
      Effect.catch((e) =>
        Effect.gen(function* () {
          yield* spinner.stop("Authorization failed")
          return yield* fail(e instanceof Error ? e.message : String(e))
        }),
      ),
    )

    yield* spinner.stop("Got key")
    yield* Effect.orDie(authSvc.set(PROVIDER_ID, { type: "api", key }))
    yield* Prompt.log.success("Signed in to Commons. Key stored in auth.json.")
    yield* Prompt.outro("Done")
  }),
})

export const CommonsCommand = cmd({
  command: "commons",
  describe: "Commons account commands",
  builder: (yargs) => yargs.command(LoginCommand).demandCommand(),
})
