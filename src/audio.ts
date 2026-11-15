/** Small WebAudio synth for original sound effects and jingles. */
export type Sfx =
  | 'shoot' | 'brick' | 'steel' | 'wall' | 'armor' | 'enemyDie' | 'playerDie' | 'eagle' | 'powerupAppear'
  | 'powerup' | 'life' | 'shieldHit' | 'paralyze' | 'pause' | 'tick' | 'bonus' | 'stageStart' | 'gameOver'
  | 'menu' | 'place'

type Wave = OscillatorType

export class Sound {
  muted = false
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private engineOsc: OscillatorNode | null = null
  private engineGain: GainNode | null = null
  private noiseBuf: AudioBuffer | null = null

  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      this.ctx = new Ctor()
      this.master = this.ctx.createGain()
      this.master.gain.value = this.muted ? 0 : 0.5
      this.master.connect(this.ctx.destination)
      const len = this.ctx.sampleRate
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
      const data = this.noiseBuf.getChannelData(0)
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  setMuted(m: boolean): void {
    this.muted = m
    if (this.master) this.master.gain.value = m ? 0 : 0.5
  }

  private tone(freq: number, dur: number, wave: Wave = 'square', vol = 0.15, slideTo?: number, at = 0): void {
    const ctx = this.ctx
    if (!ctx || !this.master) return
    const t0 = ctx.currentTime + at
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = wave
    osc.frequency.setValueAtTime(freq, t0)
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur)
    g.gain.setValueAtTime(vol, t0)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    osc.connect(g).connect(this.master)
    osc.start(t0)
    osc.stop(t0 + dur + 0.02)
  }

  private noise(dur: number, vol = 0.3, cutoff = 1200, at = 0): void {
    const ctx = this.ctx
    if (!ctx || !this.master || !this.noiseBuf) return
    const t0 = ctx.currentTime + at
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(cutoff, t0)
    filter.frequency.exponentialRampToValueAtTime(80, t0 + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(vol, t0)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    src.connect(filter).connect(g).connect(this.master)
    src.start(t0)
    src.stop(t0 + dur + 0.02)
  }

  private melody(notes: readonly [number, number][], step: number, wave: Wave = 'square', vol = 0.12): void {
    let at = 0
    for (const [midi, len] of notes) {
      if (midi > 0) this.tone(440 * 2 ** ((midi - 69) / 12), step * len * 0.95, wave, vol, undefined, at)
      at += step * len
    }
  }

  play(s: Sfx): void {
    if (!this.ctx) return
    switch (s) {
      case 'shoot': this.tone(880, 0.06, 'square', 0.08, 220); break
      case 'brick': this.noise(0.12, 0.25, 900); break
      case 'wall': this.tone(160, 0.08, 'triangle', 0.25, 80); break
      case 'steel': this.tone(1400, 0.07, 'square', 0.06, 900); this.tone(160, 0.06, 'triangle', 0.2); break
      case 'armor': this.tone(600, 0.05, 'square', 0.1, 1200); break
      case 'enemyDie': this.noise(0.45, 0.45, 2000); this.tone(110, 0.3, 'sawtooth', 0.12, 40); break
      case 'playerDie': this.noise(0.8, 0.5, 2600); this.tone(220, 0.7, 'sawtooth', 0.15, 30); break
      case 'eagle': this.noise(1.2, 0.6, 3000); this.tone(160, 1.1, 'sawtooth', 0.2, 25); break
      case 'powerupAppear': this.melody([[84, 1], [88, 1], [91, 1], [96, 1]], 0.04, 'square', 0.08); break
      case 'powerup': this.melody([[72, 1], [76, 1], [79, 1], [84, 2], [79, 1], [84, 3]], 0.05, 'square', 0.1); break
      case 'life': this.melody([[79, 1], [84, 1], [88, 1], [91, 1], [96, 3], [91, 1], [96, 4]], 0.06, 'square', 0.1); break
      case 'shieldHit': this.tone(1800, 0.04, 'square', 0.05); break
      case 'paralyze': this.tone(300, 0.25, 'square', 0.08, 1200); break
      case 'pause': this.melody([[76, 1], [72, 1], [76, 1], [72, 2]], 0.06, 'square', 0.08); break
      case 'tick': this.tone(1046, 0.03, 'square', 0.06); break
      case 'bonus': this.melody([[84, 1], [86, 1], [88, 1], [91, 2], [96, 4]], 0.07, 'square', 0.1); break
      case 'menu': this.tone(660, 0.05, 'square', 0.07); break
      case 'place': this.tone(330, 0.04, 'triangle', 0.15); break
      case 'stageStart':
        this.melody([[67, 2], [71, 1], [74, 1], [79, 3], [0, 1], [74, 1], [79, 1], [83, 2], [86, 4]], 0.09, 'square', 0.1)
        this.melody([[43, 4], [47, 4], [50, 4], [55, 4]], 0.09, 'triangle', 0.18)
        break
      case 'gameOver':
        this.melody([[72, 2], [67, 2], [64, 2], [60, 3], [0, 1], [62, 1], [59, 1], [55, 6]], 0.12, 'square', 0.1)
        this.melody([[48, 6], [43, 6], [36, 6]], 0.12, 'triangle', 0.18)
        break
    }
  }

  /** Low engine rumble while playing; pitch rises while the player moves. */
  engine(state: 'off' | 'idle' | 'moving'): void {
    const ctx = this.ctx
    if (!ctx || !this.master) return
    if (!this.engineOsc) {
      this.engineOsc = ctx.createOscillator()
      this.engineOsc.type = 'sawtooth'
      this.engineGain = ctx.createGain()
      this.engineGain.gain.value = 0
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 300
      this.engineOsc.connect(filter).connect(this.engineGain).connect(this.master)
      this.engineOsc.start()
    }
    const t = ctx.currentTime
    const target = state === 'off' ? 0 : state === 'idle' ? 0.025 : 0.04
    this.engineGain!.gain.setTargetAtTime(target, t, 0.05)
    this.engineOsc.frequency.setTargetAtTime(state === 'moving' ? 82 : 55, t, 0.05)
  }
}
