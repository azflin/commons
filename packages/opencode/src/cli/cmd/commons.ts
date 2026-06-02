import { Effect } from "effect"
import open from "open"
import { Auth } from "../../auth"
import { startCommonsAuthFlow } from "../../auth/commons-flow"
import { cmd } from "./cmd"
import { effectCmd, fail } from "../effect-cmd"
import { UI } from "../ui"
import * as Prompt from "../effect/prompt"

const PROVIDER_ID = "commons"

const LoginCommand = effectCmd({
  command: "login",
  describe: "sign in to Commons via browser",
  builder: (yargs) => yargs,
  handler: Effect.fn("Cli.commons.login")(function* (_args) {
    const authSvc = yield* Auth.Service

    UI.empty()
    yield* Prompt.intro("Sign in to Commons")

    const flow = startCommonsAuthFlow()

    yield* Prompt.log.info("Opening browser…")
    yield* Prompt.log.info(flow.authUrl)
    yield* Effect.promise(() => open(flow.authUrl).catch(() => undefined))

    const spinner = Prompt.spinner()
    yield* spinner.start("Waiting for browser authorization…")

    const key = yield* Effect.tryPromise({
      try: () => flow.awaitKey,
      catch: (e) => new Error(e instanceof Error ? e.message : String(e)),
    }).pipe(
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
  async handler() {},
})
