import * as vscode from "vscode";
import { createOrShowPanel, getPanel, type PanelHandle } from "./panel";
import { createStatusBar, type StatusBar } from "./statusBar";
import { DeepgramClient } from "./deepgram";
import type {
  Direction,
  HeadInputConfig,
  WebviewToHostMessage,
} from "./types";

const DEEPGRAM_SECRET_KEY = "headInput.deepgramApiKey";

let statusBar: StatusBar | undefined;
let dictation: DeepgramClient | undefined;
let extensionContext: vscode.ExtensionContext | undefined;
let lastActiveEditor: vscode.TextEditor | undefined;

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
    wirePanel(context, handle);
    statusBar?.setState("tracking");
    void vscode.commands.executeCommand("setContext", "headInput.panelOpen", true);
    handle.panel.onDidDispose(() => {
      statusBar?.setState("off");
      void vscode.commands.executeCommand("setContext", "headInput.panelOpen", false);
    });
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
    vscode.commands.registerCommand("headInput.setDeepgramKey", async () => {
      const key = await vscode.window.showInputBox({
        prompt: "Deepgram API key (stored in Cursor's secret storage)",
        password: true,
        ignoreFocusOut: true,
      });
      if (!key) {
        return;
      }
      await context.secrets.store(DEEPGRAM_SECRET_KEY, key.trim());
      vscode.window.showInformationMessage("Head Input: Deepgram key saved.");
    }),
    vscode.commands.registerCommand("headInput.clearDeepgramKey", async () => {
      await context.secrets.delete(DEEPGRAM_SECRET_KEY);
      vscode.window.showInformationMessage("Head Input: Deepgram key cleared.");
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration("headInput")) {
        return;
      }
      const handle = getPanel();
      if (handle) {
        handle.post({ type: "config", config: readConfig(), deepgramKey: null });
      }
    }),
  );

  if (vscode.workspace.getConfiguration("headInput").get<boolean>("autoOpenOnStartup")) {
    openPanel();
  }
}

export function deactivate(): void {
  // no-op
}

function wirePanel(_context: vscode.ExtensionContext, handle: PanelHandle): void {
  handle.onMessage((msg) => routeMessage(msg, handle));
}

function routeMessage(msg: WebviewToHostMessage, handle: PanelHandle): void {
  switch (msg.type) {
    case "ready":
      handle.post({ type: "config", config: readConfig(), deepgramKey: null });
      return;
    case "nudge":
      runDirection(msg.direction, readConfig());
      return;
    case "dictation":
      statusBar?.setState(msg.active ? "dictating" : "tracking");
      if (msg.active) {
        void startDictation(handle);
      } else {
        stopDictation();
      }
      return;
    case "audio":
      dictation?.sendAudio(msg.data);
      return;
    case "dictation-end":
      stopDictation();
      return;
    case "transcript":
      // wired in a later commit (insert at cursor)
      return;
    case "pose":
      return;
    case "status":
      return;
    case "error":
      statusBar?.setError(msg.message);
      vscode.window.showErrorMessage(`Head Input: ${msg.message}`);
      return;
  }
}

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
    deepgramLanguage: c.get<string>("deepgramLanguage", "en-US"),
    deepgramModel: c.get<string>("deepgramModel", "nova-3"),
  };
}

async function startDictation(handle: PanelHandle): Promise<void> {
  if (dictation) {
    return;
  }
  if (!extensionContext) {
    return;
  }
  let apiKey = await extensionContext.secrets.get(DEEPGRAM_SECRET_KEY);
  if (!apiKey) {
    const choice = await vscode.window.showWarningMessage(
      "Head Input: Deepgram key not set.",
      "Set API Key",
      "Cancel",
    );
    if (choice !== "Set API Key") {
      return;
    }
    await vscode.commands.executeCommand("headInput.setDeepgramKey");
    apiKey = await extensionContext.secrets.get(DEEPGRAM_SECRET_KEY);
    if (!apiKey) {
      return;
    }
  }
  const config = readConfig();
  dictation = new DeepgramClient({
    apiKey,
    language: config.deepgramLanguage,
    model: config.deepgramModel,
    onTranscript: (text, isFinal) => {
      handle.post({ type: "transcript-forward", text, isFinal });
      if (isFinal) {
        void insertTranscript(text);
      }
    },
    onError: (err) => {
      vscode.window.showErrorMessage(`Deepgram: ${err.message}`);
    },
    onClose: (_code, _reason) => {
      dictation = undefined;
    },
  });
  dictation.start();
}

function stopDictation(): void {
  dictation?.stop();
  dictation = undefined;
}

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
