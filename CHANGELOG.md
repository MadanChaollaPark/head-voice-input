# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Whistle-to-direction: YIN pitch detection on the existing mic stream maps four pitch bands to up / down / left / right with a configurable hold time and repeat rate.
- Pitch readout in the panel's status grid showing detected Hz and the matched band.
- `headInput.whistle*` configuration keys: enabled, min/max range, three split frequencies, clarity threshold, hold time, repeat rate.
- Dab-to-newline: MediaPipe PoseLandmarker runs alongside the face tracker, and a geometric detector checks for the dab pose every other frame. Holding it for `dabHoldMs` inserts a newline at the caret.
- `dab` indicator chip in the panel toolbar that lights up while a dab is being held.
- `headInput.dab*` configuration keys: enabled, hold time, cooldown.

### Notes
- Whistle detection is suppressed while dictation is active (smile gate on).
- Dab detection runs at ~15 Hz (every other frame) on the GPU delegate to keep cost predictable.

## [0.0.1] - 2026-05-08

### Added
- Webview-based head tracking using MediaPipe FaceLandmarker.
- Head pose extraction (yaw, pitch, roll) from facial transformation matrices.
- One-Euro filter smoothing on pose values.
- 1-second auto-calibration of neutral pose at panel open; manual recalibrate.
- Tilt-to-cursor mapping with configurable dead zone, hysteresis, and repeat-on-hold.
- Vertical action selectable between cursor movement and editor scrolling.
- Horizontal action selectable between character and word movement.
- Smile-blendshape detection with separate on/off thresholds and hold times.
- MediaRecorder mic capture gated on dictation state (smile held).
- Deepgram streaming WebSocket client; interim and final transcripts surfaced.
- Final transcripts inserted at the last active editor's cursor with smart spacing.
- Status bar item showing tracking, paused, and dictating states.
- Default keybindings: open panel (Cmd/Ctrl+Shift+H), recalibrate (Cmd/Ctrl+Shift+R).
- Deepgram API key stored via VS Code SecretStorage; commands to set and clear.
- Configuration schema covering sensitivity, dead zone, repeat rate, smile thresholds, and Deepgram options.
- esbuild-based bundling for both extension host and webview targets.
- README, MIT license, and project documentation.
