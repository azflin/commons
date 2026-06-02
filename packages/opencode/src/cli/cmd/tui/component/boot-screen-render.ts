/**
 * BootScreen painter — faithful opentui port of Slayed's
 * `commons-terminal-ascii-flow-v44-animated-status.js`.
 *
 * Renders into an `OptimizedBuffer`:
 *   1. A density-ASCII "wobble" field (donut + spiral-triangle + swirl, with
 *      breathing zoom) across the entire canvas, in two dark-blue tones.
 *   2. A decorative figlet COMMONS logo at center, with edge glyphs that
 *      reactively morph based on local wobble-field intensity.
 *   3. A status line below the logo: `{spinner} {statusText}{dots}`.
 *
 * The painter is intentionally close to the v44 script line-by-line so that
 * Slayed can compare-and-tweak against his source. Knobs (DENSITY, FRAME_MS,
 * wobble coefficients) are kept verbatim. The two changes vs. v44:
 *   - statusText is a setter, not a constant (so the auth flow can swap it
 *     for "Press enter to open browser", "Waiting for browser…", etc.)
 *   - the script's full-screen fade-in is dropped (opentui controls mount).
 */
import { OptimizedBuffer, RGBA } from "@opentui/core"

// ─── Knobs (verbatim from v44) ─────────────────────────────────────────────
const DENSITY = " .:-=+*#%@"
const FRAME_MS = 42 // 1 "virtual frame" = 42ms; v44's pacing
const ASPECT = 2.1 // y * aspect correction for non-square terminal cells

// ─── Decorative COMMONS logo (verbatim from v44; figlet "Gothic"-style) ────
const LOGO = [
  "                                                                               ",
  "                                                                               ",
  ' ,p6"bo   ,pW"Wq.`7MMpMMMb.pMMMb.  `7MMpMMMb.pMMMb.  ,pW"Wq.`7MMpMMMb.  ,pP"Ybd',
  "6M'  OO  6W'   `Wb MM    MM    MM    MM    MM    MM 6W'   `Wb MM    MM  8I   `\"",
  "8M       8M     M8 MM    MM    MM    MM    MM    MM 8M     M8 MM    MM  `YMMMa.",
  "YM.    , YA.   ,A9 MM    MM    MM    MM    MM    MM YA.   ,A9 MM    MM  L.   I8",
  " YMbmd'   `Ybmd9'.JMML  JMML  JMML..JMML  JMML  JMML.`Ybmd9'.JMML  JMML.M9mmmP'",
]
const LOGO_W = Math.max(...LOGO.map((line) => line.length))
const LOGO_H = LOGO.length

const SPACE = " ".codePointAt(0)!

// ─── Tones ─────────────────────────────────────────────────────────────────
const TONE_EMPTY = 0
const TONE_DIM2 = 1 // soft halftone (idx ≤ 6 in DENSITY)
const TONE_DIM1 = 2 // brighter halftone (idx > 6)
const TONE_MAIN = 3 // logo + status text

export type Rgb = [number, number, number]

function clamp01(x: number) {
  return x < 0 ? 0 : x > 1 ? 1 : x
}
function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}
function toRgb(c: RGBA | Rgb): Rgb {
  if (Array.isArray(c)) return c
  const [r, g, b] = c.toInts()
  return [r, g, b]
}
function sameRgb(a: Rgb, b: Rgb) {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2]
}

const SPINNER_FRAMES = ["/", "-", "\\", "|"]

export type BootScreenRenderOptions = {
  deltaTime?: number
  rgb?: boolean
}

export class BootScreenPainter {
  private elapsedMs = 0
  private statusText = ""
  private mainRgb: Rgb = [6, 27, 255] // #061BFF — brand blue (v44 MAIN_BLUE)
  private dim1Rgb: Rgb = [3, 12, 145] // #030C91 — v44 DARK_BLUE_1
  private dim2Rgb: Rgb = [1, 6, 85] // #010655  — v44 DARK_BLUE_2
  private panelRgb: Rgb = [0, 0, 0] // terminal bg; theme override expected

  // Scratch grids rebuilt per resize; written by drawWobble then drawLogo,
  // finally flushed to the framebuffer. Avoids re-reading the framebuffer
  // for `neighborhoodActivity` (which would couple ordering bugs).
  private gridW = 0
  private gridH = 0
  private chars = new Uint32Array(0)
  private tones = new Uint8Array(0)

  setStatusText(text: string): boolean {
    if (this.statusText === text) return false
    this.statusText = text
    return true
  }

  setPanel(value: RGBA | Rgb | undefined): boolean {
    if (!value) return false
    const next = toRgb(value)
    if (sameRgb(this.panelRgb, next)) return false
    this.panelRgb = next
    return true
  }

  setPrimary(value: RGBA | Rgb | undefined): boolean {
    if (!value) return false
    const next = toRgb(value)
    if (sameRgb(this.mainRgb, next)) return false
    this.mainRgb = next
    return true
  }

  setDim1(value: RGBA | Rgb | undefined): boolean {
    if (!value) return false
    const next = toRgb(value)
    if (sameRgb(this.dim1Rgb, next)) return false
    this.dim1Rgb = next
    return true
  }

  setDim2(value: RGBA | Rgb | undefined): boolean {
    if (!value) return false
    const next = toRgb(value)
    if (sameRgb(this.dim2Rgb, next)) return false
    this.dim2Rgb = next
    return true
  }

  render(frameBuffer: OptimizedBuffer, options: BootScreenRenderOptions = {}): void {
    this.elapsedMs += options.deltaTime ?? 0
    const w = frameBuffer.width
    const h = frameBuffer.height
    if (w !== this.gridW || h !== this.gridH) {
      this.gridW = w
      this.gridH = h
      this.chars = new Uint32Array(w * h)
      this.tones = new Uint8Array(w * h)
    }
    this.chars.fill(SPACE)
    this.tones.fill(TONE_EMPTY)

    // "virtual frame" — same time variable v44 used (per-render increment).
    // We derive it from elapsed ms so pacing is frame-rate-independent.
    const time = this.elapsedMs / FRAME_MS

    this.drawWobble(time)
    this.drawLogoAndStatus(time)
    this.flush(frameBuffer)
  }

  // ─── 1. Wobble field — radial donut + spiral-triangle + swirl. ───────────
  // Direct port of v44 `drawReferenceWobbly`. The "readability pocket" around
  // the logo zone is preserved so logo edges aren't visually swallowed.
  private drawWobble(time: number): void {
    const w = this.gridW
    const h = this.gridH
    const t = time * 0.048
    const minDim = Math.min(w, h)

    // Logo box (centered, biased up 1 row to make room for the status line).
    const logoX0 = Math.floor((w - LOGO_W) / 2)
    const logoY0 = Math.floor((h - LOGO_H) / 2) - 1
    const zoneCenterX = logoX0 + LOGO_W / 2
    const zoneCenterY = logoY0 + LOGO_H / 2 + 1
    const zoneRadiusX = LOGO_W * 0.88
    const zoneRadiusY = LOGO_H * 2.2

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let nx = (x - w / 2) / minDim
        let ny = ((y - h / 2) * ASPECT) / minDim

        // Gentle wobble distortion — kills static geometry.
        const wobbleX = Math.sin(ny * 7.5 + t * 1.7) * 0.06 + Math.cos(ny * 2.8 - t * 0.9) * 0.03
        const wobbleY = Math.cos(nx * 8.3 - t * 1.5) * 0.06 + Math.sin(nx * 3.4 + t * 1.05) * 0.03
        nx += wobbleX
        ny += wobbleY

        const a = Math.atan2(ny, nx)
        const r = Math.sqrt(nx * nx + ny * ny) + 1e-6

        // Pulsing zoom — the "breathing / zooming in and out" feel.
        const zoom = 1.0 + 0.16 * Math.sin(t * 0.95) + 0.05 * Math.sin(t * 1.7 + r * 8.0)
        const rz = r * zoom

        // Donut/ring system.
        const donut1 = 1.0 - Math.abs(Math.sin(rz * 30.0 - t * 2.8 + 1.8 * Math.sin(a * 2.0 + t * 0.65)))
        const donut2 = 1.0 - Math.abs(Math.sin(rz * 18.0 - t * 1.9 + 0.9 * Math.cos(a * 4.0 - t * 0.45)))
        const donut = Math.max(donut1 * 0.95, donut2 * 0.72)

        // Spiral triangles — 3-fold angular symmetry with radial drift.
        const triCore = 1.0 - Math.abs(Math.cos(a * 3.0 + rz * 20.0 - t * 2.4))
        const triSpiral = 1.0 - Math.abs(Math.cos(a * 3.0 - rz * 13.0 + t * 1.85 + Math.sin(rz * 6.0 - t) * 0.7))
        const triangle = Math.max(triCore * 0.85, triSpiral * 0.92)

        // Secondary swirl.
        const swirl = 1.0 - Math.abs(Math.sin((nx - ny) * 10.0 + rz * 10.0 - t * 1.55))

        let field = Math.max(donut, triangle * 0.96, swirl * 0.55)

        // Readability pocket behind the logo.
        const ex = (x - zoneCenterX) / zoneRadiusX
        const ey = (y - zoneCenterY) / zoneRadiusY
        const zoneDist = Math.sqrt(ex * ex + ey * ey)
        const deadness = 1 - smoothstep(0.0, 1.0, zoneDist)
        field -= deadness * 0.72

        if (field < 0.17) continue

        // Quantize to a stable density char (no speckle).
        const q = clamp01((field - 0.17) / 0.83)
        const idx = Math.max(1, Math.min(DENSITY.length - 1, Math.floor(q * DENSITY.length)))
        const ch = DENSITY[idx]
        if (ch === " ") continue

        const i = y * w + x
        this.chars[i] = ch.codePointAt(0)!
        this.tones[i] = idx > 6 ? TONE_DIM1 : TONE_DIM2
      }
    }
  }

  // ─── 2. Logo + reactive edges + status line. ─────────────────────────────
  private drawLogoAndStatus(time: number): void {
    const w = this.gridW
    const h = this.gridH
    const logoX0 = Math.floor((w - LOGO_W) / 2)
    const logoY0 = Math.floor((h - LOGO_H) / 2) - 1

    for (let y = 0; y < LOGO.length; y++) {
      const line = LOGO[y]!
      for (let x = 0; x < line.length; x++) {
        const ch = line[x]!
        if (ch === " ") continue
        const gx = logoX0 + x
        const gy = logoY0 + y
        if (gx < 0 || gx >= w || gy < 0 || gy >= h) continue

        const isEdge = this.logoEdgeAt(line, y, x)
        const activity = isEdge ? this.neighborhoodActivity(gx, gy) : 0
        const finalCh = isEdge ? this.reactiveGlyph(ch, gx, gy, activity, time) : ch

        const i = gy * w + gx
        this.chars[i] = finalCh.codePointAt(0)!
        this.tones[i] = TONE_MAIN
      }
    }

    // Status line: `{spinner} {statusText}{dots}` centered below the logo.
    const statusY = logoY0 + LOGO_H + 1
    if (statusY < 0 || statusY >= h) return
    const spinner = SPINNER_FRAMES[Math.floor(time / 3) % SPINNER_FRAMES.length]!
    const dotCount = Math.floor(time / 8) % 4
    const dots = ".".repeat(dotCount).padEnd(3, " ")
    const status = `${spinner} ${this.statusText}${dots}`
    const statusX = Math.floor((w - status.length) / 2)
    for (let i = 0; i < status.length; i++) {
      const gx = statusX + i
      if (gx < 0 || gx >= w) continue
      const c = status[i]!
      if (c === " ") continue
      const idx = statusY * w + gx
      this.chars[idx] = c.codePointAt(0)!
      this.tones[idx] = TONE_MAIN
    }
  }

  // Returns true if this logo cell sits on the outline (any neighbor is
  // background space). Used to gate reactive-edge glitching.
  private logoEdgeAt(line: string, y: number, x: number): boolean {
    if (line[x] === " ") return false
    const up = LOGO[y - 1]?.[x] ?? " "
    const down = LOGO[y + 1]?.[x] ?? " "
    const left = line[x - 1] ?? " "
    const right = line[x + 1] ?? " "
    return up === " " || down === " " || left === " " || right === " "
  }

  // Sum nearby wobble-field intensity — dim2 = 0.6, dim1 = 1.0 (matches v44).
  private neighborhoodActivity(gx: number, gy: number): number {
    let score = 0
    const w = this.gridW
    const h = this.gridH
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        if (ox === 0 && oy === 0) continue
        const nx = gx + ox
        const ny = gy + oy
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue
        const tone = this.tones[ny * w + nx]
        if (tone === TONE_DIM1) score += 1.0
        else if (tone === TONE_DIM2) score += 0.6
      }
    }
    return score
  }

  // Edge-only: swap a logo glyph for an accent char when the local wobble
  // field is hot and the spatial phase fires. Verbatim from v44.
  private reactiveGlyph(baseChar: string, gx: number, gy: number, activity: number, time: number): string {
    const phase =
      Math.sin(gx * 0.28 + gy * 0.51 - time * 0.21) + Math.cos(gx * 0.16 - gy * 0.27 + time * 0.13)
    if (activity > 4.8 && phase > 1.05) {
      const accent = ["/", "\\", "+", "*", "=", "-", ":"]
      return accent[Math.abs(Math.floor(gx + gy + time / 2)) % accent.length]!
    }
    if (activity > 3.2 && phase > 0.9) {
      const accent = [".", ":", "-", "=", "+"]
      return accent[Math.abs(Math.floor(gx * 2 + gy + time / 3)) % accent.length]!
    }
    return baseChar
  }

  // ─── 3. Flush scratch grids to the framebuffer. ──────────────────────────
  private flush(frameBuffer: OptimizedBuffer): void {
    const buffers = frameBuffer.buffers
    const fg = buffers.fg
    const bg = buffers.bg
    const charBuf = buffers.char
    const attrs = buffers.attributes
    const total = this.gridW * this.gridH
    const [pR, pG, pB] = this.panelRgb
    const [mR, mG, mB] = this.mainRgb
    const [d1R, d1G, d1B] = this.dim1Rgb
    const [d2R, d2G, d2B] = this.dim2Rgb

    for (let i = 0; i < total; i++) {
      const off = i * 4
      charBuf[i] = this.chars[i]!
      attrs[i] = 0
      // Background is uniform panel everywhere — matches v44's transparent-
      // terminal-bg look once we set panel = theme.background.
      bg[off] = pR
      bg[off + 1] = pG
      bg[off + 2] = pB
      bg[off + 3] = 255
      const tone = this.tones[i]!
      let r = pR
      let g = pG
      let b = pB
      if (tone === TONE_MAIN) {
        r = mR
        g = mG
        b = mB
      } else if (tone === TONE_DIM1) {
        r = d1R
        g = d1G
        b = d1B
      } else if (tone === TONE_DIM2) {
        r = d2R
        g = d2G
        b = d2B
      }
      fg[off] = r
      fg[off + 1] = g
      fg[off + 2] = b
      fg[off + 3] = 255
    }
  }
}
