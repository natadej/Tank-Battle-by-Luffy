import './style.css'
import { App } from './app'
import { Sound } from './audio'
import { SCREEN_H, SCREEN_W } from './game/constants'
import { Input } from './input'
import { storage } from './storage'

const params = new URLSearchParams(location.search)
const cartoon = params.get('look') !== 'original'
const sample = params.get('sample')
const isSample = sample !== null && ['title', 'curtain', 'play', 'construction', 'ranking', 'tally', 'gameover'].includes(sample)
document.body.classList.toggle('cartoon', cartoon)
document.body.classList.toggle('embedded', params.has('embed'))
document.body.classList.toggle('sample', isSample)
const canvas = document.querySelector<HTMLCanvasElement>('#screen')!
const resolution = cartoon ? 4 : 1
canvas.width = SCREEN_W * resolution
canvas.height = SCREEN_H * resolution
const ctx = canvas.getContext('2d')!
ctx.scale(resolution, resolution)

const input = new Input()
const sound = new Sound()
sound.setMuted(storage.muted())
const app = new App(input, sound, cartoon)
if (isSample) app.previewSample(sample)

function fit(): void {
  const stage = document.querySelector<HTMLElement>('#stage')!
  const { width, height } = stage.getBoundingClientRect()
  const scale = Math.max(.1, Math.min(width / SCREEN_W, height / SCREEN_H))
  const s = scale >= 2 ? Math.floor(scale * 4) / 4 : scale
  canvas.style.width = `${Math.floor(SCREEN_W * s)}px`
  canvas.style.height = `${Math.floor(SCREEN_H * s)}px`
}
window.addEventListener('resize', fit)
new ResizeObserver(fit).observe(document.querySelector('#stage')!)
fit()

const unlock = () => sound.unlock()
window.addEventListener('pointerdown', unlock)
window.addEventListener('keydown', unlock)

// Touch controls -----------------------------------------------------------
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window
document.body.classList.toggle('touch', isTouch)
window.addEventListener('touchstart', () => document.body.classList.add('touch'), { once: true })

const dpad = document.querySelector<HTMLElement>('#dpad')!
const DIRS = ['up', 'right', 'down', 'left'] as const
let dpadDir: string | null = null
function setDpad(dir: string | null): void {
  if (dir === dpadDir) return
  if (dpadDir) input.release(`T:${dpadDir}`)
  if (dir) input.press(`T:${dir}`)
  dpadDir = dir
  dpad.dataset.dir = dir ?? ''
}
function dpadFromEvent(e: PointerEvent): void {
  const r = dpad.getBoundingClientRect()
  const dx = e.clientX - (r.left + r.width / 2)
  const dy = e.clientY - (r.top + r.height / 2)
  if (Math.hypot(dx, dy) < r.width * 0.12) return setDpad(null)
  const angle = Math.atan2(dy, dx)
  const idx = Math.round(angle / (Math.PI / 2) + 4) % 4
  setDpad([DIRS[1], DIRS[2], DIRS[3], DIRS[0]][idx])
}
dpad.addEventListener('pointerdown', e => {
  dpad.setPointerCapture(e.pointerId)
  dpadFromEvent(e)
})
dpad.addEventListener('pointermove', e => {
  if (dpad.hasPointerCapture(e.pointerId)) dpadFromEvent(e)
})
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) dpad.addEventListener(ev, () => setDpad(null))

for (const btn of document.querySelectorAll<HTMLElement>('[data-key]')) {
  const key = `T:${btn.dataset.key}`
  btn.addEventListener('pointerdown', e => {
    btn.setPointerCapture(e.pointerId)
    btn.classList.add('down')
    input.press(key)
  })
  const up = () => {
    btn.classList.remove('down')
    input.release(key)
  }
  btn.addEventListener('pointerup', up)
  btn.addEventListener('pointercancel', up)
}

const mute = document.querySelector<HTMLButtonElement>('#mute')!
function renderMute(): void {
  mute.textContent = sound.muted ? 'SOUND OFF' : 'SOUND ON'
}
mute.addEventListener('click', () => {
  sound.unlock()
  sound.setMuted(!sound.muted)
  storage.saveMuted(sound.muted)
  renderMute()
})
window.addEventListener('keydown', e => {
  if (e.code === 'KeyM' && app.scene !== 'name') mute.click()
})
renderMute()
for (const el of document.querySelectorAll('#controls, #mute')) {
  el.addEventListener('contextmenu', e => e.preventDefault())
}

// Main loop: fixed 60 Hz simulation -------------------------------------------
const STEP = 1000 / 60
let last = performance.now()
let acc = 0
function frame(now: number): void {
  acc += Math.min(250, now - last)
  last = now
  let steps = 0
  while (!isSample && acc >= STEP && steps < 5) {
    input.poll()
    app.step()
    input.endFrame()
    acc -= STEP
    steps++
  }
  if (isSample) acc = 0
  if (steps === 5) acc = 0
  app.draw(ctx)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

if (import.meta.env.DEV) Object.assign(window, { __app: app })
