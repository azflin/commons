import {
  FrameBufferRenderable,
  RGBA,
  type OptimizedBuffer,
  type RenderContext,
  type RenderableOptions,
} from "@opentui/core"
import { extend, useRenderer, useTerminalDimensions } from "@opentui/solid"
import { createEffect, createSignal, onCleanup, onMount } from "solid-js"
import { useSync } from "@tui/context/sync"
import { useRoute } from "@tui/context/route"
import { usePromptRef } from "@tui/context/prompt"

// Hardcoded blue-void palette. Swap values here to map to useTheme() later.
const PALETTE = {
  bg:       RGBA.fromInts(3, 7, 18),
  deep:     RGBA.fromInts(2, 8, 72),
  grid:     RGBA.fromInts(4, 15, 128),
  muted:    RGBA.fromInts(6, 27, 255),
  soft:     RGBA.fromInts(28, 47, 255),
  dust:     RGBA.fromInts(9, 25, 170),
  line:     RGBA.fromInts(6, 27, 255),
  bright:   RGBA.fromInts(6, 27, 255),
  bright2:  RGBA.fromInts(64, 82, 255),
  text:     RGBA.fromInts(6, 27, 255),
  block:    RGBA.fromInts(6, 27, 255),
  panel:    RGBA.fromInts(40, 58, 255),
  panelDim: RGBA.fromInts(5, 18, 110),
  userWhite: RGBA.fromInts(245, 247, 255),
  thinkBlue: RGBA.fromInts(6, 27, 255),
  bgBlue1:  RGBA.fromInts(1, 4, 22),
  bgBlue2:  RGBA.fromInts(2, 8, 44),
  bgBlue3:  RGBA.fromInts(3, 12, 76),
  bgBlue4:  RGBA.fromInts(5, 18, 118),
  bgBlue5:  RGBA.fromInts(9, 25, 170),
}

const FLOW_DENSITY = " .:-=+*#%@"
const SPACE = " ".codePointAt(0)!
const FULL_BLOCK = "█".codePointAt(0)!

const COMMONS_LOGO = [
  "   /###      /###   ### /### /###   ### /### /###     /###   ###  /###      /###    ",
  "  / ###  /  / ###  / ##/ ###/ /##  / ##/ ###/ /##  / / ###  / ###/ #### /  / #### / ",
  " /   ###/  /   ###/   ##  ###/ ###/   ##  ###/ ###/ /   ###/   ##   ###/  ##  ###/  ",
  "##        ##    ##    ##   ##   ##    ##   ##   ## ##    ##    ##    ##  ####       ",
  "##        ##    ##    ##   ##   ##    ##   ##   ## ##    ##    ##    ##    ###      ",
  "##        ##    ##    ##   ##   ##    ##   ##   ## ##    ##    ##    ##      ###    ",
  "##        ##    ##    ##   ##   ##    ##   ##   ## ##    ##    ##    ##        ###  ",
  "###     / ##    ##    ##   ##   ##    ##   ##   ## ##    ##    ##    ##   /###  ##  ",
  " ######/   ######     ###  ###  ###   ###  ###  ### ######     ###   ### / #### /   ",
  "  #####     ####       ###  ###  ###   ###  ###  ### ####       ###   ###   ###/     ",
]

// Original JS file uses tick-based timing: tick increments by 1 every 80ms.
// deltaTime from renderer is in milliseconds, so we convert to tick units.
const TICK_MS = 80
function elapsedToTick(elapsedMs: number) {
  return elapsedMs / TICK_MS
}

function hash(x: number, y: number, seed = 0) {
  let n = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0
  n = (n ^ (n >>> 13)) * 1274126177
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function isLogoEdge(line: string, y: number, x: number): boolean {
  if (line[x] === " ") return false
  const up = COMMONS_LOGO[y - 1]?.[x] ?? " "
  const down = COMMONS_LOGO[y + 1]?.[x] ?? " "
  const left = line[x - 1] ?? " "
  const right = line[x + 1] ?? " "
  return up === " " || down === " " || left === " " || right === " "
}

function neighborhoodActivity(
  charBuffer: Uint32Array,
  gx: number,
  gy: number,
  cols: number,
  rows: number,
): number {
  let score = 0
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      if (ox === 0 && oy === 0) continue
      const nx = gx + ox
      const ny = gy + oy
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue
      if (charBuffer[ny * cols + nx] !== 0) score += 0.7
    }
  }
  return score
}

function reactiveGlyph(baseChar: string, gx: number, gy: number, activity: number, time: number): string {
  const phase =
    Math.sin(gx * 0.28 + gy * 0.51 - time * 0.21) + Math.cos(gx * 0.16 - gy * 0.27 + time * 0.13)
  if (activity > 4.8 && phase > 1.35) {
    const accent = [".", ":", "-", "="]
    return accent[Math.abs(Math.floor(gx * 2 + gy + time / 3)) % accent.length]
  }
  return baseChar
}

function rgbaToUint16(color: RGBA): [number, number, number, number] {
  const [r, g, b] = color.toInts()
  return [r, g, b, 255]
}

type CommonsMode = "idle" | "typing" | "thinking" | "replying" | "welcome"

type CommonsBgRenderOptions = {
  deltaTime?: number
  rgb?: boolean
}

class CommonsBgPainter {
  private elapsed = 0
  private mode: CommonsMode = "idle"
  private opacity = 0.95
  private keyPulse = 0
  private keySeed = 0
  private geometryWidth = 0
  private geometryHeight = 0

  setMode(mode: CommonsMode) {
    this.mode = mode
  }

  setOpacity(opacity: number) {
    this.opacity = opacity
  }

  setKeyPulse(pulse: number) {
    this.keyPulse = pulse
  }

  setKeySeed(seed: number) {
    this.keySeed = seed
  }

  render(frameBuffer: OptimizedBuffer, options: CommonsBgRenderOptions = {}) {
    this.elapsed += options.deltaTime ?? 0
    const width = frameBuffer.width
    const height = frameBuffer.height
    if (width === 0 || height === 0) return

    if (width !== this.geometryWidth || height !== this.geometryHeight) {
      this.geometryWidth = width
      this.geometryHeight = height
    }

    this.drawBackground(frameBuffer, width, height)
    this.drawFlowField(frameBuffer, width, height)
    if (this.mode === "welcome") this.drawLogo(frameBuffer, width, height)
    this.drawTopSignal(frameBuffer, width)
  }

  private drawBackground(frameBuffer: OptimizedBuffer, width: number, height: number) {
    const buffers = frameBuffer.buffers
    buffers.fg.fill(0)
    buffers.bg.fill(0)
    buffers.char.fill(0)
    buffers.attributes.fill(0)
  }

  private drawFlowField(frameBuffer: OptimizedBuffer, cols: number, rows: number) {
    if (this.opacity <= 0.01) return
    const buffers = frameBuffer.buffers
    const fg = buffers.fg
    const tick = elapsedToTick(this.elapsed)
    const t = tick * 0.048
    const minDim = Math.min(cols, rows)
    const aspect = 2.1
    // Vignette center follows the logo on the home screen so the
    // darkening hugs the wordmark instead of the whole screen center.
    const logoW = Math.max(...COMMONS_LOGO.map((line) => line.length))
    const logoH = COMMONS_LOGO.length
    const logoCx =
      Math.floor((cols - logoW) / 2) + logoW / 2
    const logoCy =
      Math.floor((rows - logoH - 5) / 2) + 2 + logoH / 2
    const cx = this.mode === "welcome" ? logoCx : cols / 2
    const cy = this.mode === "welcome" ? logoCy : rows / 2
    const quietRadiusX = this.mode === "welcome" ? Math.max(20, logoW * 0.65) : Math.max(24, cols * 0.32)
    const quietRadiusY = this.mode === "welcome" ? Math.max(5, logoH * 1.6) : Math.max(6, rows * 0.26)
    const thinkingLift = this.mode === "thinking" || this.mode === "replying" ? 0.08 : 0
    const visibleOpacity = Math.max(0, Math.min(1, this.opacity))

    const bgBlue1 = rgbaToUint16(PALETTE.bgBlue1)
    const bgBlue2 = rgbaToUint16(PALETTE.bgBlue2)
    const bgBlue3 = rgbaToUint16(PALETTE.bgBlue3)
    const bgBlue4 = rgbaToUint16(PALETTE.bgBlue4)
    const bgBlue5 = rgbaToUint16(PALETTE.bgBlue5)
    const soft = rgbaToUint16(PALETTE.soft)
    const dust = rgbaToUint16(PALETTE.dust)
    const bright = rgbaToUint16(PALETTE.bright)
    const bright2 = rgbaToUint16(PALETTE.bright2)

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        let nx = (x - cols / 2) / minDim
        let ny = ((y - rows / 2) * aspect) / minDim

        const wobbleX = Math.sin(ny * 7.5 + t * 1.7) * 0.06 + Math.cos(ny * 2.8 - t * 0.9) * 0.03
        const wobbleY = Math.cos(nx * 8.3 - t * 1.5) * 0.06 + Math.sin(nx * 3.4 + t * 1.05) * 0.03
        nx += wobbleX
        ny += wobbleY

        const a = Math.atan2(ny, nx)
        const r = Math.sqrt(nx * nx + ny * ny) + 1e-6
        const zoom = 1.0 + 0.16 * Math.sin(t * 0.95) + 0.05 * Math.sin(t * 1.7 + r * 8.0)
        const rz = r * zoom

        const donut1 = 1.0 - Math.abs(Math.sin(rz * 30.0 - t * 2.8 + 1.8 * Math.sin(a * 2.0 + t * 0.65)))
        const donut2 = 1.0 - Math.abs(Math.sin(rz * 18.0 - t * 1.9 + 0.9 * Math.cos(a * 4.0 - t * 0.45)))
        const donut = Math.max(donut1 * 0.95, donut2 * 0.72)

        const triCore = 1.0 - Math.abs(Math.cos(a * 3.0 + rz * 20.0 - t * 2.4))
        const triSpiral = 1.0 - Math.abs(Math.cos(a * 3.0 - rz * 13.0 + t * 1.85 + Math.sin(rz * 6.0 - t) * 0.7))
        const triangle = Math.max(triCore * 0.85, triSpiral * 0.92)
        const swirl = 1.0 - Math.abs(Math.sin((nx - ny) * 10.0 + rz * 10.0 - t * 1.55))

        let field = Math.max(donut, triangle * 0.96, swirl * 0.55) + thinkingLift

        const ex = (x - cx) / quietRadiusX
        const ey = (y - cy) / quietRadiusY
        const zoneDist = Math.sqrt(ex * ex + ey * ey)
        if (this.mode === "welcome") {
          const deadness = 1 - smoothstep(0.0, 1.35, zoneDist)
          field -= deadness * 0.52
        }

        if (field < 0.17) continue

        const fadeGate = hash(x, y, Math.floor(tick / 10) + 404)
        const keepChance = Math.pow(visibleOpacity, 0.72) * 0.95
        if (fadeGate > keepChance) continue

        const q = Math.max(0, Math.min(1, (field - 0.17) / 0.83))
        const idx = Math.max(1, Math.min(FLOW_DENSITY.length - 1, Math.floor(q * FLOW_DENSITY.length)))
        const ch = FLOW_DENSITY[idx]
        if (ch === " ") continue

        const contour = 0.5 + 0.5 * Math.sin(rz * 22.0 - t * 1.1 + a * 1.3)
        let color: [number, number, number, number]
        if (visibleOpacity > 0.76) {
          if (q > 0.90) color = bright2
          else if (q > 0.78) color = contour > 0.52 ? bright : bgBlue5
          else if (q > 0.64) color = contour > 0.5 ? soft : bgBlue4
          else if (q > 0.50) color = contour > 0.48 ? dust : bgBlue3
          else if (q > 0.34) color = contour > 0.45 ? bgBlue3 : bgBlue2
          else color = bgBlue1
        } else if (visibleOpacity > 0.42) {
          if (q > 0.86) color = bright
          else if (q > 0.68) color = contour > 0.5 ? bgBlue5 : bgBlue4
          else if (q > 0.48) color = contour > 0.48 ? dust : bgBlue3
          else color = contour > 0.44 ? bgBlue2 : bgBlue1
        } else {
          if (q > 0.72) color = bgBlue4
          else if (q > 0.50) color = contour > 0.5 ? bgBlue3 : bgBlue2
          else color = bgBlue1
        }

        const index = y * cols + x
        const offset = index * 4
        fg[offset] = color[0]
        fg[offset + 1] = color[1]
        fg[offset + 2] = color[2]
        fg[offset + 3] = 255
        buffers.char[index] = ch.codePointAt(0) ?? SPACE
      }
    }
  }

  private drawLogo(frameBuffer: OptimizedBuffer, cols: number, rows: number) {
    const buffers = frameBuffer.buffers
    const fg = buffers.fg

    const logoW = Math.max(...COMMONS_LOGO.map((line) => line.length))
    const logoH = COMMONS_LOGO.length
    const x0 = Math.floor((cols - logoW) / 2)
    // Match home.tsx layout: 6-row logo spacer + 2-row gap + ~3-row prompt
    // centered in the available rows, so the logo sits where the spacer is.
    const y0 = Math.floor((rows - logoH - 5) / 2) + 2

    const main = rgbaToUint16(PALETTE.text)

    for (let y = 0; y < COMMONS_LOGO.length; y++) {
      const line = COMMONS_LOGO[y].padEnd(logoW, " ")
      for (let x = 0; x < line.length; x++) {
        const ch = line[x]
        if (ch === " ") continue
        const gx = x0 + x
        const gy = y0 + y
        if (gx < 0 || gx >= cols || gy < 0 || gy >= rows) continue

        const index = gy * cols + gx
        const offset = index * 4
        fg[offset] = main[0]
        fg[offset + 1] = main[1]
        fg[offset + 2] = main[2]
        fg[offset + 3] = 255
        buffers.char[index] = ch.codePointAt(0) ?? SPACE
      }
    }
  }

  private drawTopSignal(frameBuffer: OptimizedBuffer, cols: number) {
    // On the home/welcome screen let the flow field fill the top row;
    // only paint a signal bar for active session modes.
    if (this.mode === "welcome") return
    const buffers = frameBuffer.buffers
    const fg = buffers.fg
    const tick = elapsedToTick(this.elapsed)
    const isWorking = this.mode === "thinking" || this.mode === "replying"
    const [panelDimR, panelDimG, panelDimB] = rgbaToUint16(PALETTE.panelDim)
    const [lineR, lineG, lineB] = rgbaToUint16(PALETTE.line)
    const [bright2R, bright2G, bright2B] = rgbaToUint16(PALETTE.bright2)

    for (let i = 0; i < cols; i++) {
      const index = 0 * cols + i
      const offset = index * 4

      if (isWorking) {
        const wave = Math.sin((i / Math.max(1, cols)) * Math.PI * 2.8 - tick / 7)
        let ch: string
        if (wave > 0.72) ch = "█"
        else if (wave > 0.36) ch = "▓"
        else if (wave > -0.08) ch = "▒"
        else ch = "░"

        fg[offset] = lineR
        fg[offset + 1] = lineG
        fg[offset + 2] = lineB
        fg[offset + 3] = 255
        buffers.char[index] = ch.codePointAt(0) ?? FULL_BLOCK

        const glint = ((tick * 2) % Math.max(1, cols + 18)) - 9
        const d = Math.abs(i - glint)
        if (d <= 2) {
          fg[offset] = bright2R
          fg[offset + 1] = bright2G
          fg[offset + 2] = bright2B
        }
      } else if (this.keyPulse > 0) {
        const pulseCenter = this.keySeed % Math.max(1, cols)
        const dist = Math.min(Math.abs(i - pulseCenter), cols - Math.abs(i - pulseCenter))
        if (dist <= 5) {
          const n = hash(i, this.keySeed, Math.floor(tick / 3))
          fg[offset] = lineR
          fg[offset + 1] = lineG
          fg[offset + 2] = lineB
          fg[offset + 3] = 255
          buffers.char[index] = (n > 0.72 ? "▓" : "▒").codePointAt(0) ?? FULL_BLOCK
        } else {
          fg[offset] = panelDimR
          fg[offset + 1] = panelDimG
          fg[offset + 2] = panelDimB
          fg[offset + 3] = 255
          buffers.char[index] = "▒".codePointAt(0) ?? FULL_BLOCK
        }
      } else {
        fg[offset] = panelDimR
        fg[offset + 1] = panelDimG
        fg[offset + 2] = panelDimB
        fg[offset + 3] = 255
        buffers.char[index] = "▒".codePointAt(0) ?? FULL_BLOCK
      }
    }

    if (isWorking) {
      const label = " agent thinking "
      const x = Math.max(2, Math.floor((cols - label.length) / 2))
      const thinkBlue = rgbaToUint16(PALETTE.thinkBlue)
      for (let i = 0; i < label.length; i++) {
        const index = x + i
        const offset = index * 4
        fg[offset] = thinkBlue[0]
        fg[offset + 1] = thinkBlue[1]
        fg[offset + 2] = thinkBlue[2]
        fg[offset + 3] = 255
        buffers.char[index] = label[i].codePointAt(0) ?? SPACE
      }
    }
  }
}

type CommonsBgRenderableOptions = RenderableOptions<FrameBufferRenderable>

class CommonsBgRenderable extends FrameBufferRenderable {
  private painter = new CommonsBgPainter()

  constructor(ctx: RenderContext, options: CommonsBgRenderableOptions = {}) {
    const width = typeof options.width === "number" ? options.width : 1
    const height = typeof options.height === "number" ? options.height : 1
    super(ctx, {
      ...options,
      width,
      height,
      live: options.live ?? true,
      respectAlpha: true,
    })
    if (options.width !== undefined && typeof options.width !== "number") this.width = options.width
    if (options.height !== undefined && typeof options.height !== "number") this.height = options.height
  }

  set mode(value: CommonsMode) {
    this.painter.setMode(value)
    this.requestRender()
  }

  set bgOpacity(value: number) {
    this.painter.setOpacity(value)
    this.requestRender()
  }

  set keyPulse(value: number) {
    this.painter.setKeyPulse(value)
    this.requestRender()
  }

  set keySeed(value: number) {
    this.painter.setKeySeed(value)
    this.requestRender()
  }

  protected override renderSelf(buffer: OptimizedBuffer, deltaTime = 0): void {
    if (!this.visible || this.isDestroyed) return
    this.painter.render(this.frameBuffer, { deltaTime })
    super.renderSelf(buffer)
  }
}

declare module "@opentui/solid" {
  interface OpenTUIComponents {
    commons_bg: typeof CommonsBgRenderable
  }
}

extend({ commons_bg: CommonsBgRenderable })

export function CommonsBg() {
  const renderer = useRenderer()
  const sync = useSync()
  const route = useRoute()
  const promptRef = usePromptRef()
  const dimensions = useTerminalDimensions()

  const [mode, setMode] = createSignal<CommonsMode>("idle")
  const [opacity, setOpacity] = createSignal(0.95)
  const [keyPulse, setKeyPulse] = createSignal(0)
  const [keySeed, setKeySeed] = createSignal(0)

  let renderableRef: CommonsBgRenderable | undefined
  let targetFps = renderer.targetFps
  let maxFps = renderer.maxFps
  let lastActivity = Date.now()
  let bgTarget = 0.95
  let currentOpacity = 0.95

  onMount(() => {
    targetFps = renderer.targetFps
    maxFps = renderer.maxFps
    renderer.targetFps = 30
    renderer.maxFps = 30
  })

  onCleanup(() => {
    renderer.targetFps = targetFps
    renderer.maxFps = maxFps
  })

  // Derive mode from sync state + prompt input
  createEffect(() => {
    const isHome = route.data.type === "home"
    const sessionID =
      route.data.type === "session" ? route.data.sessionID : undefined
    const status = sessionID ? sync.session.status(sessionID) : "idle"
    const promptInfo = promptRef.current?.current
    const inputLen = promptInfo?.input?.length ?? 0
    const now = Date.now()

    if (status === "working") {
      const messages = sessionID ? sync.data.message[sessionID] : undefined
      const last = messages?.at(-1)
      if (last?.role === "user") {
        setMode("thinking")
      } else {
        setMode("replying")
      }
      lastActivity = now
    } else if (inputLen > 0) {
      setMode("typing")
      lastActivity = now
      setKeyPulse(3)
      setKeySeed((prev) => (prev + 127 + inputLen) % 100000)
    } else if (isHome) {
      setMode("welcome")
    } else {
      setMode("idle")
    }
  })

  // Opacity breathing: tick-based like the original (80ms interval)
  onMount(() => {
    const ticker = setInterval(() => {
      const m = mode()
      const idleSince = Date.now() - lastActivity

      if (m === "thinking" || m === "replying") {
        bgTarget = 1
      } else if (m === "typing" && idleSince < 500) {
        bgTarget = 1
        } else if (m === "welcome") {
          // Home screen: keep animation at calm level until user types
          bgTarget = 0.95
      } else {
        bgTarget = 0
      }

      const rate = bgTarget > currentOpacity ? 0.14 : 0.60
      currentOpacity += (bgTarget - currentOpacity) * rate
      if (Math.abs(currentOpacity - bgTarget) < 0.025) currentOpacity = bgTarget
      if (bgTarget === 0 && currentOpacity < 0.025) currentOpacity = 0
      setOpacity(currentOpacity)
    }, TICK_MS)

    onCleanup(() => clearInterval(ticker))
  })

  // Decay keyPulse
  createEffect(() => {
    const pulse = keyPulse()
    if (pulse > 0) {
      const timer = setTimeout(() => setKeyPulse(pulse - 1), 100)
      onCleanup(() => clearTimeout(timer))
    }
  })

  // Sync signals to renderable imperatively
  createEffect(() => {
    const el = renderableRef
    if (!el) return
    el.mode = mode()
    el.bgOpacity = opacity()
    el.keyPulse = keyPulse()
    el.keySeed = keySeed()
  })

  return (
    <commons_bg
      width={dimensions().width}
      height={dimensions().height}
      position="absolute"
      top={0}
      left={0}
      live
      ref={(el) => { renderableRef = el as unknown as CommonsBgRenderable }}
    />
  )
}
