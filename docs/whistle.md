# Whistle to direction

Sustained whistle pitches can drive cursor moves the same way head tilts do. The microphone is already open while the panel is up, so a Web Audio `AnalyserNode` is tapped off the same `MediaStream` that feeds dictation, runs YIN pitch detection on each frame, and feeds the result through a band-to-direction controller.

## Pitch -> direction

Three split frequencies divide the whistle range into four bands:

```
  whistleMinHz                   whistleMaxHz
       |                              |
       |  down  | left | right |  up  |
       |        |      |       |      |
       0       split1 split2  split3
```

Defaults:

| Band   | Default range  |
| ------ | -------------- |
| down   | 500 – 800 Hz   |
| left   | 800 – 1400 Hz  |
| right  | 1400 – 2200 Hz |
| up     | 2200 – 4000 Hz |

The mapping reflects the natural intuition that low pitch feels "low" and high pitch feels "high", with the two middle bands handling the horizontal axis.

## Hold and repeat

Just like the head-tilt controller:

- A whistle must hold one band for `whistleHoldMs` (default 200 ms) before the first nudge fires.
- Continuing to whistle in the same band repeats the nudge at `whistleRepeatRateHz` (default 3 Hz).
- Drifting out of all four bands (or stopping) resets the gate. The next time you re-enter a band, you again need to hold for `whistleHoldMs`.

This makes a quick "blip" of the wrong pitch harmless — it doesn't fire — but a sustained whistle in one band paginates through the editor.

## Conflicts with dictation

The smile gate and the whistle controller both want the microphone. They're resolved by giving the smile gate priority:

- While `SmileGate.isActive()` is true (i.e. you're dictating), the whistle controller is reset every frame and emits no nudges.
- As soon as the smile drops and dictation ends, whistle detection resumes.

Whistling *while* you smile is therefore a no-op. If you want to issue a quick nudge during dictation, use a head tilt — those run independently of the audio path.

## Tuning

The defaults assume an average adult whistler with a comfortable range around 1–3 kHz. Some people whistle higher or lower than this; here's how to retune.

1. Open the panel and watch the **Whistle** row in the status grid. It shows the detected frequency (e.g. `1.45 kHz`) plus the matched band (e.g. `▸ right`).
2. Whistle your most comfortable low pitch and note the Hz value.
3. Whistle your most comfortable high pitch and note the Hz value.
4. Set `headInput.whistleMinHz` and `headInput.whistleMaxHz` to roughly bracket your range with ~50 Hz of margin.
5. Pick three split frequencies that divide your range into four roughly equal-difficulty bands. Geometric (log-frequency) spacing usually feels more natural than linear: e.g. for a range of 600–3500 Hz, splits at ~900, 1500, 2400 Hz.

If the controller fires the wrong direction, raise `headInput.whistleClarity` to be stricter. If clean whistles aren't being recognized, lower it.

## Failure modes

- **Whistling while talking near the mic**: speech can briefly produce strong pitch detections. Raise `whistleClarity` (try `0.9`) or `whistleHoldMs` (try `300`) to require a longer sustained tone.
- **Background hum / fan noise**: low-frequency noise tends to sit below the default `whistleMinHz`, so it's already filtered. If a steady hum at 200–400 Hz is bleeding in, raise `whistleMinHz`.
- **Music playing nearby**: melodic content can cause sporadic firings. The simplest mitigation is to set `headInput.whistleEnabled` to `false` while music is on.

## Disabling the feature

Two ways:

- Set `headInput.whistleEnabled` to `false`. The audio path stays open (so dictation still works), but the whistle controller is bypassed.
- Run `Head Input: Toggle Tracking`. While paused, both head-tilt and whistle detection are disabled, but the camera and microphone remain live.

## Implementation notes

- Pitch detection: YIN with parabolic interpolation, in `src/webview/pitch.ts`. Window size is 2048 samples (~42 ms at 48 kHz). Cost per frame is negligible because τ is constrained to the whistle range, not the full half-window.
- Audio source: `AnalyserNode` connected to a `MediaStreamSource` from the camera stream. **Not** connected to `ctx.destination` — that would route your microphone to your speakers.
- Concurrency: the analyser and dictation PCM recorder both read from the same `MediaStream`. Web Audio fans audio out at the source level, so they don't conflict.
