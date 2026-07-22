// Gentle, non-alarming chime sounds for the app's nudges — soft sine tones in a
// comfortable mid-range (A4-E6), the same octave band the old pomodoro completion
// chime used. Never bass-heavy, never shrill, always quiet. One shared
// AudioContext created lazily on first use, since browsers require a user
// gesture before audio can play — every call site here is already inside a
// click handler, so that's satisfied naturally.
let audioCtx = null

function getCtx() {
  if (typeof window === 'undefined') return null
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) return null
    audioCtx = new AudioContextClass()
  }
  if (audioCtx.state === 'suspended') audioCtx.resume()
  return audioCtx
}

// A single soft sine tone with a gentle attack/decay envelope — a hard on/off
// click is what makes a beep read as alarming, so every note ramps in and
// fades out instead of snapping.
function tone(ctx, freq, startOffset, duration, peakGain) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  const start = ctx.currentTime + startOffset
  gain.gain.setValueAtTime(0, start)
  gain.gain.linearRampToValueAtTime(peakGain, start + duration * 0.25)
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(start)
  osc.stop(start + duration + 0.05)
}

function play(notes) {
  const ctx = getCtx()
  if (!ctx) return
  notes.forEach(([freq, offset, duration, gain]) => tone(ctx, freq, offset, duration, gain))
}

// Named for readability — never below A4 (reads as bassy/ominous) or above E6
// (reads as a shrill alert), the same ceiling the app's original pomodoro chime
// used.
const A4 = 440, C5 = 523.25, G5 = 783.99, A5 = 880, C6 = 1046.5, E6 = 1318.51

export const sounds = {
  // A reminder landed — an unhurried two-note "ding, dong".
  notification: () => play([[E6, 0, 0.45, 0.14], [C6, 0.22, 0.5, 0.12]]),

  // A task (or routine instance) got checked off — a small bright lift.
  taskDone: () => play([[C6, 0, 0.16, 0.16], [E6, 0.1, 0.3, 0.16]]),

  // Pausing the pomodoro — one short, low-key blip.
  pomodoroPause: () => play([[G5, 0, 0.22, 0.11]]),

  // A seatbelt-chime-style nudge: fires every 15s while paused mid-session, so
  // the clock sitting paused doesn't go silently forgotten — softer and shorter
  // than the one-off pause blip above since this one repeats.
  pausedReminder: () => play([[G5, 0, 0.16, 0.08]]),

  // Starting a focus session on a task — a quick, gentle two-note lift-off.
  startingTask: () => play([[A5, 0, 0.14, 0.13], [C5, 0.08, 0.22, 0.13]]),

  // A pomodoro round's timer finished (focus or break) — a three-note arpeggio,
  // the app's original completion chime.
  pomodoroEnd: () => play([[A5, 0, 0.4, 0.16], [C6, 0.16, 0.4, 0.16], [E6, 0.32, 0.45, 0.16]]),

  // Follows pomodoroEnd only when a focus round (not a break) just finished — a
  // soft, descending "time to rest" cue.
  takeABreak: () => play([[E6, 0, 0.35, 0.12], [C6, 0.2, 0.5, 0.12], [A4, 0.4, 0.6, 0.1]])
}
