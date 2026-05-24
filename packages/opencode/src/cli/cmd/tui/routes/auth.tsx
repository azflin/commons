import { Logo } from "../component/logo"
import { useTheme } from "@tui/context/theme"

export function Auth() {
  const { theme } = useTheme()

  return (
    <box flexGrow={1} alignItems="center" paddingLeft={2} paddingRight={2}>
      <box flexGrow={1} minHeight={0} />
      <box flexShrink={0}>
        <Logo />
      </box>
      <box height={2} minHeight={0} flexShrink={1} />
      <box flexDirection="column" alignItems="center" maxWidth={70} flexShrink={0}>
        <text fg={theme.text}>Sign in required</text>
        <box height={1} />
        <text fg={theme.textMuted}>Open a new terminal and run:</text>
        <box height={1} />
        <text fg={theme.text} attributes={1}>{"  commons login"}</text>
        <box height={1} />
        <text fg={theme.textMuted}>Then restart commons.</text>
        <box height={1} />
        <text fg={theme.textMuted}>Press Ctrl+C to quit.</text>
      </box>
      <box flexGrow={1} minHeight={0} />
    </box>
  )
}
