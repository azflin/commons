/**
 * BootScreen — full-screen animated boot panel for home + auth routes.
 *
 * Wraps `BootScreenPainter` in an opentui `FrameBufferRenderable`. The painter
 * draws the entire surface (wobble field + COMMONS logo + status line), so
 * this component is meant to be the *only* thing in its zIndex layer — there's
 * no content composition like the older BootWave + Logo split.
 *
 * Props:
 *   status — the line that follows the spinner under the logo. Used by:
 *     home: "Press enter to continue"
 *     auth(intro): "Press enter to open browser"
 *     auth(opening/waiting/saving/success/error): phase-appropriate text
 */
import {
  FrameBufferRenderable,
  RGBA,
  type OptimizedBuffer,
  type RenderContext,
  type RenderableOptions,
} from "@opentui/core"
import { extend, useRenderer } from "@opentui/solid"
import { createEffect, onCleanup, onMount } from "solid-js"
import { useTheme } from "@tui/context/theme"
import { BootScreenPainter } from "./boot-screen-render"

type BootScreenOptions = RenderableOptions<FrameBufferRenderable> & {
  backgroundPanel?: RGBA
  primary?: RGBA
  status?: string
}

class BootScreenRenderable extends FrameBufferRenderable {
  private painter = new BootScreenPainter()

  constructor(ctx: RenderContext, options: BootScreenOptions = {}) {
    const width = typeof options.width === "number" ? options.width : 1
    const height = typeof options.height === "number" ? options.height : 1
    super(ctx, {
      ...options,
      width,
      height,
      live: options.live ?? true,
      respectAlpha: false,
    })
    if (options.width !== undefined && typeof options.width !== "number") this.width = options.width
    if (options.height !== undefined && typeof options.height !== "number") this.height = options.height
    this.painter.setPanel(options.backgroundPanel)
    this.painter.setPrimary(options.primary)
    if (options.status !== undefined) this.painter.setStatusText(options.status)
  }

  set backgroundPanel(value: RGBA | undefined) {
    if (this.painter.setPanel(value)) this.requestRender()
  }

  set primary(value: RGBA | undefined) {
    if (this.painter.setPrimary(value)) this.requestRender()
  }

  set status(value: string | undefined) {
    if (this.painter.setStatusText(value ?? "")) this.requestRender()
  }

  protected override renderSelf(buffer: OptimizedBuffer, deltaTime = 0): void {
    if (!this.visible || this.isDestroyed) return
    this.painter.render(this.frameBuffer, {
      deltaTime,
      rgb: this._ctx.capabilities?.rgb === true,
    })
    super.renderSelf(buffer)
  }
}

declare module "@opentui/solid" {
  interface OpenTUIComponents {
    boot_screen: typeof BootScreenRenderable
  }
}

extend({ boot_screen: BootScreenRenderable })

export function BootScreen(props: { status: string }) {
  const { theme } = useTheme()
  const renderer = useRenderer()
  let targetFps = renderer.targetFps
  let maxFps = renderer.maxFps

  onMount(() => {
    targetFps = renderer.targetFps
    maxFps = renderer.maxFps
    // v44 was 24fps (42ms frames); we hold at 30 to stay consistent with the
    // older BootWave and to give the wobble math a smoother sample rate.
    renderer.targetFps = 30
    renderer.maxFps = 30
  })

  onCleanup(() => {
    renderer.targetFps = targetFps
    renderer.maxFps = maxFps
  })

  // Reactive status updates pass through to the renderable via the setter.
  // `primary` is intentionally NOT theme.primary — Slayed's vision is brand
  // blue, and in dark mode theme.primary resolves to yellow. If we ever want
  // theme-coherent colors, swap to `theme.primary` here (one-line change).
  const BRAND_BLUE = RGBA.fromHex("#061BFF")

  return (
    <boot_screen
      width="100%"
      height="100%"
      backgroundPanel={theme.background}
      primary={BRAND_BLUE}
      status={props.status}
      live
    />
  )
}
