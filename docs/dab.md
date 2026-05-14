# Dab -> Newline

A held dab pose inserts a newline (Enter) into the active editor. It's the
"commit my dictated sentence and move on" gesture — useful after the smile gate
has dropped and ElevenLabs' committed transcript has landed at the caret.

## What counts as a dab

```
            extended arm                              bent arm
        (high, out, mirror-able)                   (across face)
                  \                                    /
                   \                                  /
              wrist above              wrist near
              shoulder                 nose
                   \                                  /
                    \____________   ________________/
                                 \ /
                              shoulders
                              (level, ~10% image apart)
```

Concretely, every frame the body tracker fires `pose_landmarker_lite` runs five
geometric checks on the 33 keypoints. All five must pass for either arm
orientation (left arm extended + right arm bent, or vice versa):

1. The extended wrist is at least `0.18` (normalized image y) above its
   shoulder. Image y grows downward, so this is a physical "up".
2. The extended wrist is more than `1.1 ×` shoulder-distance outside the
   torso center.
3. The extended elbow is at or above its shoulder (`<= shoulder.y + 0.02`).
4. The bent wrist is within `0.85 ×` shoulder-distance of the nose.
5. The bent elbow is within `0.65 ×` shoulder-distance of its shoulder's y.

Mirror symmetry: either arm can be the extended one. The detector tries both
orientations.

## Hold and cooldown

A single matching frame doesn't fire. The pose must be held for `dabHoldMs`
(default `250` ms — about 4 frames at the throttled 15 Hz). After firing, the
detector ignores everything for `dabCooldownMs` (default `1200` ms) so a
sustained pose only enters one newline.

If you start a dab and let it lapse before the hold completes, the timer
resets — partial dabs cost nothing.

The "armed" indicator chip in the panel goes blue while the timer is running.

## Tuning

| Setting           | Default | Notes                                           |
| ----------------- | ------- | ----------------------------------------------- |
| `dabEnabled`      | `true`  | Master switch.                                  |
| `dabHoldMs`       | `250`   | Lower = snappier, more false positives.         |
| `dabCooldownMs`   | `1200`  | Raise if one dab fires twice.                   |

If the dab refuses to register:
- Make sure your full upper body is in frame. The detector needs both
  shoulders, both elbows, both wrists, and the nose visible.
- Check the lighting on your bent arm — the visibility gate is `0.5`, and
  shadowed wrists drop below that.
- Try `dabHoldMs: 150` for a less committed pose.

If the dab fires accidentally during normal motion:
- Raise `dabHoldMs` to `400+`. Real dabs are easy to hold; flapping arms are
  not.
- Note that the visibility gate already rules out arms-down poses (check #5
  rejects bent elbows below shoulder height).

## Why a newline, not a real Enter?

VS Code extensions can't synthesize raw keypresses. Instead, the dab fires
`vscode.commands.executeCommand("type", { text: "\n" })`, which is the same
mechanism the editor uses internally for typed input. In a text editor this
is indistinguishable from pressing Enter. In other surfaces (chat panels,
input boxes) it may behave differently or do nothing.

## Performance

Body landmarking is heavier than face landmarking. To keep the cost
predictable, the body tracker runs every other frame (~15 Hz) on the GPU
delegate. A dab is held for 250 ms+, so 15 Hz is plenty of resolution.

If you're on a low-end GPU and the panel feels sluggish, you can bump
`everyN` in `src/webview/bodyLandmarker.ts` to `3` for ~10 Hz.
