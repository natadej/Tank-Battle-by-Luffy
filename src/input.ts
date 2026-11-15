import { type Dir, DOWN, LEFT, RIGHT, UP } from './game/constants'
import type { Pad } from './game/world'

export type Button = 'up' | 'down' | 'left' | 'right' | 'fire' | 'start' | 'select'
const DIR_BUTTONS: readonly [Button, Dir][] = [['up', UP], ['right', RIGHT], ['down', DOWN], ['left', LEFT]]

type Bindings = Record<Button, readonly string[]>

const TOUCH: Bindings = {
  up: ['T:up'], down: ['T:down'], left: ['T:left'], right: ['T:right'], fire: ['T:fire'], start: ['T:start'], select: [],
}

function gamepadBindings(i: number): Bindings {
  const k = (b: Button) => [`G${i}:${b}`]
  return { up: k('up'), down: k('down'), left: k('left'), right: k('right'), fire: k('fire'), start: k('start'), select: k('select') }
}

const SOLO: Bindings = {
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  fire: ['Space', 'KeyJ', 'KeyK', 'KeyZ', 'KeyX', 'KeyF'],
  start: ['Enter', 'Escape', 'KeyP'],
  select: ['ShiftLeft', 'Backspace'],
}
const DUO_P1: Bindings = {
  up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
  fire: ['Space', 'KeyF', 'KeyG'], start: ['Enter', 'Escape', 'KeyP'], select: ['ShiftLeft'],
}
const DUO_P2: Bindings = {
  up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
  fire: ['Slash', 'Period', 'Numpad0', 'ShiftRight', 'ControlRight', 'KeyL'], start: [], select: [],
}

function merge(...all: Bindings[]): Bindings {
  const out = {} as Record<Button, string[]>
  for (const b of Object.keys(SOLO) as Button[]) out[b] = all.flatMap(x => x[b])
  return out
}

const CAPTURED = new Set(Object.values(merge(SOLO, DUO_P2)).flat())

export class Input {
  players = 1
  /** Characters typed this frame (for name entry). */
  typed: string[] = []
  private held = new Map<string, number>()
  private pressed = new Set<string>()
  private counter = 0
  private padPrev = new Set<string>()

  constructor(target: Window = window) {
    target.addEventListener('keydown', e => {
      if (CAPTURED.has(e.code)) e.preventDefault()
      if (e.repeat) return
      this.press(e.code)
      if (e.key.length === 1) this.typed.push(e.key)
      if (e.key === 'Backspace') this.typed.push('\b')
    })
    target.addEventListener('keyup', e => this.release(e.code))
    target.addEventListener('blur', () => this.held.clear())
  }

  press(code: string): void {
    if (!this.held.has(code)) {
      this.held.set(code, ++this.counter)
      this.pressed.add(code)
    }
  }

  release(code: string): void {
    this.held.delete(code)
  }

  private bindings(player: number): Bindings {
    if (this.players === 1) return merge(SOLO, TOUCH, gamepadBindings(0))
    return player === 0 ? merge(DUO_P1, TOUCH, gamepadBindings(0)) : merge(DUO_P2, gamepadBindings(1))
  }

  /** Reads connected gamepads into virtual keys. Call once at the start of every frame. */
  poll(): void {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []
    const now = new Set<string>()
    for (let i = 0; i < Math.min(2, pads.length); i++) {
      const gp = pads[i]
      if (!gp) continue
      const btn = (n: number) => !!gp.buttons[n]?.pressed
      const ax = gp.axes[0] ?? 0
      const ay = gp.axes[1] ?? 0
      if (btn(12) || ay < -0.5) now.add(`G${i}:up`)
      if (btn(13) || ay > 0.5) now.add(`G${i}:down`)
      if (btn(14) || ax < -0.5) now.add(`G${i}:left`)
      if (btn(15) || ax > 0.5) now.add(`G${i}:right`)
      if (btn(0) || btn(1) || btn(2) || btn(3)) now.add(`G${i}:fire`)
      if (btn(9)) now.add(`G${i}:start`)
      if (btn(8)) now.add(`G${i}:select`)
    }
    for (const k of now) if (!this.padPrev.has(k)) this.press(k)
    for (const k of this.padPrev) if (!now.has(k)) this.release(k)
    this.padPrev = now
  }

  endFrame(): void {
    this.pressed.clear()
    this.typed = []
  }

  isHeld(player: number, b: Button): boolean {
    return this.bindings(player)[b].some(k => this.held.has(k))
  }

  wasPressed(player: number, b: Button): boolean {
    return this.bindings(player)[b].some(k => this.pressed.has(k))
  }

  /** Pressed by anyone, used for menus. */
  any(b: Button): boolean {
    return this.wasPressed(0, b) || (this.players > 1 && this.wasPressed(1, b)) || merge(SOLO, gamepadBindings(1))[b].some(k => this.pressed.has(k))
  }

  anyHeld(b: Button): boolean {
    return this.isHeld(0, b) || merge(SOLO, gamepadBindings(1))[b].some(k => this.held.has(k))
  }

  pad(player: number): Pad {
    const bind = this.bindings(player)
    let dir: Dir | null = null
    let best = -1
    for (const [b, d] of DIR_BUTTONS) {
      for (const k of bind[b]) {
        const t = this.held.get(k)
        if (t !== undefined && t > best) {
          best = t
          dir = d
        }
      }
    }
    return { dir, fire: this.isHeld(player, 'fire'), firePressed: this.wasPressed(player, 'fire') }
  }
}
