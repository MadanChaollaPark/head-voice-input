import * as vscode from "vscode";
import { createOrShowPanel, getPanel, type PanelHandle } from "./panel";
import { createStatusBar, type StatusBar } from "./statusBar";
import type {
  Direction,
  HeadInputConfig,
  WebviewToHostMessage,
} from "./types";

const DEEPGRAM_SECRET_KEY = "headInput.deepgramApiKey";

let statusBar: StatusBar | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  statusBar = createStatusBar(context);

  const openPanel = () => {
    const handle = createOrShowPanel(context);
    wirePanel(context, handle);
    statusBar?.setState("tracking");
    handle.panel.onDidDispose(() => statusBar?.setState("off"));
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
