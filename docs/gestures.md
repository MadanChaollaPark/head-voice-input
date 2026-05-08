# Gestures

## Calibration first

Open the panel, sit in your normal posture, and look at your screen as you would when coding. The webview captures one second of "neutral" pose and stores it as zero. Every motion after that is reported relative to neutral.

If your seating shifts (different chair, different time of day), recalibrate:
- Click "Recalibrate" in the panel, or
- Press `Cmd/Ctrl+Shift+R`, or
- Run `Head Input: Recalibrate Neutral Pose`.

Calibration takes one second; hold still during it.

## Head tilt -> cursor

```
                pitch up  (cursor up / scroll up)
                    ^
                    |
   yaw left  <------+------>  yaw right
   (cursor left)    |        (cursor right)
                    |
                    v
                pitch down (cursor down / scroll down)
```

- The dead zone is symmetric around neutral. Tilt past `deadZoneDegrees` to fire one move.
- Hold the tilt past the dead zone to repeat moves at `repeatRateHz`.
- To stop, return your head close to neutral (specifically, inside half the dead zone). Then the next tilt fires fresh.

If a direction feels inverted, flip the sign of the corresponding axis in `src/webview/nudge.ts:evalAxis`. The convention currently assumed:
- Positive yaw = looking right.
- Positive pitch = looking up.

## Smile -> dictation

```
mouthSmileLeft + mouthSmileRight, averaged
0.0 ----| smileOffThreshold |------| smileOnThreshold |---- 1.0
        ^                          ^
        |                          |
        below this (held off-hold) above this (held on-hold)
        ends dictation              starts dictation
```

The two thresholds form a hysteresis band. As long as your smile stays in the band, the gate doesn't change state. This protects against brief excursions above or below the line.

Tips for clean dictation:
- A "you-look-pleased" smile (cheeks raised, mouth corners up) is what the model recognizes. Lip-press alone may not register.
- Talking with a smile on your face works fine; the gate stays *on* unless the smile actively drops.
- If false-positive dictation kicks in while you talk to someone, raise `smileOnThreshold` and / or `smileOnHoldMs`.
- If you can't reliably enter dictation, lower `smileOnThreshold` (try `0.4`) or `smileOnHoldMs` (try `100`).

## Whistle -> cursor

A separate, audio-driven path lets you nudge the cursor by whistling at a sustained pitch. Four pitch bands map to the four directions; see [whistle.md](./whistle.md) for the full layout, defaults, and tuning advice.

A summary, in case you don't follow the link:
- Low whistle → down. High whistle → up. The two middle bands → left and right.
- Hold the whistle for `whistleHoldMs` before the first nudge fires; sustained whistles repeat at `whistleRepeatRateHz`.
- Whistling while you're dictating (smile gate active) is intentionally a no-op — the audio path is reserved for Deepgram during dictation.

## Dab -> newline

A held dab pose inserts a newline (Enter) into the active editor. Either arm
can be the extended one — the detector is mirror-symmetric. See [dab.md](./dab.md) for the geometry, hold time, and cooldown.

Quick version:
- Extended arm high and out, bent arm across the face, hold for `dabHoldMs` (default 250 ms).
- After firing, a `dabCooldownMs` window (default 1200 ms) ignores re-detection so one dab equals one newline.
- The blue chip in the panel toolbar goes solid while the dab is "armed" (held but not yet fired).

## Combined flow

A typical "edit at line 50, then dictate a comment" flow:

1. Open the panel (`Cmd/Ctrl+Shift+H`).
2. Wait for "Calibrated" — about one second after the camera goes live.
3. Tilt your head down repeatedly to drop to line 50. Hold for sustained motion.
4. Position the caret with small left/right tilts.
5. Smile and say "hello world".
6. Stop smiling. The final transcript is inserted at the caret with a leading space if needed.

## Pause / resume

If you need to type with your hands without the camera firing extra moves:
- Click "Pause" in the panel, or run `Head Input: Toggle Tracking`.
- The camera and mic stay live but per-frame detection is skipped.
- Click "Resume" or run the toggle again to re-enable.

To fully stop, close the panel. The camera and mic are released.
