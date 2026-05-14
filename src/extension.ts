import * as vscode from "vscode";
import { createOrShowPanel, getPanel, type PanelHandle } from "./panel";
import { createStatusBar, type StatusBar } from "./statusBar";
import { ElevenLabsSttClient } from "./elevenlabsStt";
import type {
  Direction,
  HeadInputConfig,
  WebviewToHostMessage,
} from "./types";

/** Key under which the ElevenLabs API key is stored in `SecretStorage`. */
const ELEVENLABS_SECRET_KEY = "headInput.elevenLabsApiKey";

interface DictationStartResult {
  started: boolean;
  stopSent: boolean;
}

let statusBar: StatusBar | undefined;
let dictation: ElevenLabsSttClient | undefined;
let extensionContext: vscode.ExtensionContext | undefined;
let lastActiveEditor: vscode.TextEditor | undefined;
let wiredPanel: PanelHandle | undefined;
let dictationRequested = false;
let dictationStartGeneration = 0;
let panelPaused = false;

/**
 * Extension entry point. Registers commands, the status bar, and a
 * configuration watcher. The panel itself is created on demand.
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  extensionContext = context;
  statusBar = createStatusBar(context);
  lastActiveEditor = vscode.window.activeTextEditor;
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        lastActiveEditor = editor;
      }
    }),
  );

  const openPanel = () => {
    const handle = createOrShowPanel(context);
    if (wiredPanel !== handle) {
      wiredPanel = handle;
      const messageSubscription = wirePanel(handle);
      let disposeSubscription: vscode.Disposable | undefined;
      disposeSubscription = handle.panel.onDidDispose(() => {
        cancelDictation();
        panelPaused = false;
        statusBar?.setState("off");
        void vscode.commands.executeCommand("setContext", "headInput.panelOpen", false);
        messageSubscription.dispose();
        disposeSubscription?.dispose();
        if (wiredPanel === handle) {
          wiredPanel = undefined;
        }
      });
      context.subscriptions.push(messageSubscription, disposeSubscription);
    }
    statusBar?.setState(dictation ? "dictating" : panelPaused ? "paused" : "tracking");
    void vscode.commands.executeCommand("setContext", "headInput.panelOpen", true);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("headInput.openPanel", openPanel),
    vscode.commands.registerCommand("headInput.calibrate", () => {
      const handle = getPanel();
      if (!handle) {
        vscode.window.showWarningMessage("Open the Head Input panel first.");
        return;
      }
      handle.post({ type: "calibrate" });
    }),
    vscode.commands.registerCommand("headInput.toggle", () => {
      const handle = getPanel();
      if (!handle) {
        vscode.window.showWarningMessage("Open the Head Input panel first.");
        return;
      }
      handle.post({ type: "toggle" });
    }),
    vscode.commands.registerCommand("headInput.setElevenLabsKey", async () => {
      const key = await vscode.window.showInputBox({
        prompt: "ElevenLabs API key (stored in Cursor's secret storage)",
        password: true,
        ignoreFocusOut: true,
      });
      if (!key) {
        return;
      }
      await context.secrets.store(ELEVENLABS_SECRET_KEY, key.trim());
      vscode.window.showInformationMessage("Head Input: ElevenLabs key saved.");
    }),
    vscode.commands.registerCommand("headInput.clearElevenLabsKey", async () => {
      await context.secrets.delete(ELEVENLABS_SECRET_KEY);
      vscode.window.showInformationMessage("Head Input: ElevenLabs key cleared.");
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration("headInput")) {
        return;
      }
      const handle = getPanel();
      if (handle) {
        handle.post({ type: "config", config: readConfig(), elevenLabsKey: null });
      }
    }),
  );

  if (vscode.workspace.getConfiguration("headInput").get<boolean>("autoOpenOnStartup")) {
    openPanel();
  }
}

/** No-op deactivation hook — disposables are released via `context.subscriptions`. */
export function deactivate(): void {
  // no-op
}

/** Subscribe the host to messages from a newly-opened panel. */
function wirePanel(handle: PanelHandle): vscode.Disposable {
  return handle.onMessage((msg) => routeMessage(msg, handle));
}

/**
 * Route a single webview message to the appropriate host action. See
 * `docs/data-flow.md` for the full message taxonomy.
 */
function routeMessage(msg: WebviewToHostMessage, handle: PanelHandle): void {
  switch (msg.type) {
    case "ready":
      handle.post({ type: "config", config: readConfig(), elevenLabsKey: null });
      return;
    case "nudge":
      runDirection(msg.direction, readConfig());
      return;
    case "dictation":
      if (msg.active) {
        dictationRequested = true;
        const generation = ++dictationStartGeneration;
        statusBar?.setState("dictating");
        void startDictation(
          handle,
          () => dictationRequested && generation === dictationStartGeneration && getPanel() === handle,
        ).then(({ started, stopSent }) => {
          if (!dictationRequested || generation !== dictationStartGeneration || getPanel() !== handle) {
            if (started) {
              stopDictation();
            }
            return;
          }
          if (!started) {
            dictationRequested = false;
            dictationStartGeneration++;
            statusBar?.setState(panelPaused ? "paused" : "tracking");
            if (!stopSent) {
              handle.post({ type: "dictation-stop", reason: "Dictation cancelled." });
            }
          }
        });
      } else {
        cancelDictation();
        statusBar?.setState(panelPaused ? "paused" : "tracking");
      }
      return;
    case "audio":
      dictation?.sendAudio(msg.data);
      return;
    case "dictation-end":
      cancelDictation();
      statusBar?.setState(panelPaused ? "paused" : "tracking");
      return;
    case "dab":
      void vscode.commands.executeCommand("type", { text: "\n" });
      return;
    case "transcript":
      // wired in a later commit (insert at cursor)
      return;
    case "pose":
      return;
    case "status":
      if (msg.state === "paused") {
        panelPaused = true;
        statusBar?.setState("paused");
      } else if (msg.state === "tracking") {
        panelPaused = false;
        statusBar?.setState(dictation ? "dictating" : "tracking");
      }
      return;
    case "error":
      statusBar?.setError(msg.message);
      vscode.window.showErrorMessage(`Head Input: ${msg.message}`);
      return;
  }
}

/** Snapshot the current `headInput.*` configuration into a `HeadInputConfig`. */
function readConfig(): HeadInputConfig {
  const c = vscode.workspace.getConfiguration("headInput");
  return {
    tiltSensitivity: c.get<number>("tiltSensitivity", 1.0),
    deadZoneDegrees: c.get<number>("deadZoneDegrees", 8),
    repeatRateHz: c.get<number>("repeatRateHz", 4),
    verticalAction: c.get<"cursor" | "scroll">("verticalAction", "cursor"),
    horizontalAction: c.get<"cursor" | "word">("horizontalAction", "cursor"),
    smileOnThreshold: c.get<number>("smileOnThreshold", 0.5),
    smileOffThreshold: c.get<number>("smileOffThreshold", 0.3),
    smileOnHoldMs: c.get<number>("smileOnHoldMs", 200),
    smileOffHoldMs: c.get<number>("smileOffHoldMs", 500),
    elevenLabsLanguageCode: c.get<string>("elevenLabsLanguageCode", "en"),
    elevenLabsSttModel: c.get<string>("elevenLabsSttModel", "scribe_v2_realtime"),
    whistleEnabled: c.get<boolean>("whistleEnabled", true),
    whistleMinHz: c.get<number>("whistleMinHz", 500),
    whistleMaxHz: c.get<number>("whistleMaxHz", 4000),
    whistleSplit1Hz: c.get<number>("whistleSplit1Hz", 800),
    whistleSplit2Hz: c.get<number>("whistleSplit2Hz", 1400),
    whistleSplit3Hz: c.get<number>("whistleSplit3Hz", 2200),
    whistleClarity: c.get<number>("whistleClarity", 0.85),
    whistleHoldMs: c.get<number>("whistleHoldMs", 200),
    whistleRepeatRateHz: c.get<number>("whistleRepeatRateHz", 3),
    dabEnabled: c.get<boolean>("dabEnabled", true),
    dabHoldMs: c.get<number>("dabHoldMs", 250),
    dabCooldownMs: c.get<number>("dabCooldownMs", 1200),
  };
}

/**
 * Open an ElevenLabs WebSocket for the current dictation session. Reads the API
 * key from `SecretStorage` and prompts for it if missing. No-op if a session
 * is already running.
 */
async function startDictation(
  handle: PanelHandle,
  shouldContinue: () => boolean,
): Promise<DictationStartResult> {
  if (dictation) {
    return { started: true, stopSent: false };
  }
  if (!extensionContext || !shouldContinue()) {
    return { started: false, stopSent: false };
  }
  const apiKey = await extensionContext.secrets.get(ELEVENLABS_SECRET_KEY);
  if (!shouldContinue()) {
    return { started: false, stopSent: false };
  }
  if (!apiKey) {
    handle.post({
      type: "dictation-stop",
      reason: "Set an ElevenLabs API key before dictating.",
    });
    dictationRequested = false;
    dictationStartGeneration++;
    statusBar?.setState(panelPaused ? "paused" : "tracking");
    const choice = await vscode.window.showWarningMessage(
      "Head Input: ElevenLabs key not set.",
      "Set API Key",
      "Cancel",
    );
    if (choice !== "Set API Key") {
      return { started: false, stopSent: true };
    }
    if (!shouldContinue()) {
      return { started: false, stopSent: true };
    }
    await vscode.commands.executeCommand("headInput.setElevenLabsKey");
    return { started: false, stopSent: true };
  }
  if (!apiKey || !shouldContinue()) {
    return { started: false, stopSent: false };
  }
  const config = readConfig();
  const client = new ElevenLabsSttClient({
    apiKey,
    languageCode: config.elevenLabsLanguageCode,
    modelId: config.elevenLabsSttModel,
    sampleRate: 16000,
    onTranscript: (text, isFinal) => {
      handle.post({ type: "transcript-forward", text, isFinal });
      if (isFinal) {
        void insertTranscript(text);
      }
    },
    onError: (err) => {
      vscode.window.showErrorMessage(`ElevenLabs: ${err.message}`);
    },
    onClose: (_code, _reason) => {
      if (dictation === client) {
        dictation = undefined;
        dictationRequested = false;
        dictationStartGeneration++;
        statusBar?.setState(panelPaused ? "paused" : "tracking");
        handle.post({ type: "dictation-stop", reason: "ElevenLabs connection closed." });
      }
    },
  });
  dictation = client;
  client.start();
  return { started: true, stopSent: false };
}

/** Cancel any pending or active dictation session. */
function cancelDictation(): void {
  dictationRequested = false;
  dictationStartGeneration++;
  stopDictation();
}

/** Close the current ElevenLabs STT session, if any. Idempotent. */
function stopDictation(): void {
  const client = dictation;
  dictation = undefined;
  client?.stop();
}

/**
 * Insert a final transcript at the active editor's caret. Adds a leading
 * space if the preceding character isn't whitespace.
 */
async function insertTranscript(rawText: string): Promise<void> {
  const text = rawText.trim();
  if (!text) {
    return;
  }
  const editor = vscode.window.activeTextEditor ?? lastActiveEditor;
  if (!editor) {
    vscode.window.showWarningMessage("Head Input: no active editor to insert into.");
    return;
  }
  const pos = editor.selection.active;
  let prefix = "";
  if (pos.character > 0) {
    const lineText = editor.document.lineAt(pos.line).text;
    const prev = lineText[pos.character - 1];
    if (prev && !/\s/.test(prev)) {
      prefix = " ";
    }
  }
  await editor.edit((b) => b.insert(pos, prefix + text));
}

/**
 * Translate a single nudge into the corresponding VS Code command, honoring
 * `verticalAction` (cursor vs. scroll) and `horizontalAction` (char vs. word).
 */
function runDirection(direction: Direction, config: HeadInputConfig): void {
  if (direction === "up" || direction === "down") {
    if (config.verticalAction === "scroll") {
      void vscode.commands.executeCommand("editorScroll", {
        to: direction,
        by: "line",
        value: 1,
        revealCursor: true,
      });
      return;
    }
    void vscode.commands.executeCommand(direction === "up" ? "cursorUp" : "cursorDown");
    return;
  }
  const word = config.horizontalAction === "word";
  if (direction === "left") {
    void vscode.commands.executeCommand(word ? "cursorWordLeft" : "cursorLeft");
  } else {
    void vscode.commands.executeCommand(word ? "cursorWordRight" : "cursorRight");
  }
}
