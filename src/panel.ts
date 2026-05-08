import * as vscode from "vscode";
import { randomBytes } from "node:crypto";
import type { HostToWebviewMessage, WebviewToHostMessage } from "./types";

/**
 * Wrapper around `vscode.WebviewPanel` exposing only the surface the host
 * needs: a typed post helper, a typed message subscriber, and a disposer.
 */
export interface PanelHandle {
  panel: vscode.WebviewPanel;
  /** Send a typed message to the webview. Fire-and-forget. */
  post: (msg: HostToWebviewMessage) => void;
  /** Subscribe to typed messages from the webview. Returns a disposable. */
  onMessage: (handler: (msg: WebviewToHostMessage) => void) => vscode.Disposable;
  /** Dispose the panel and its subscriptions. */
  dispose: () => void;
}

let current: PanelHandle | undefined;

/** Returns the current `PanelHandle` if one is open, otherwise undefined. */
export function getPanel(): PanelHandle | undefined {
  return current;
}

/**
 * Reveal the existing panel or create a new one. The webview is loaded with a
 * strict CSP and a per-load nonce; only assets under `dist/` are addressable
 * via `webview.asWebviewUri`. Subsequent calls return the existing handle.
 */
export function createOrShowPanel(context: vscode.ExtensionContext): PanelHandle {
  if (current) {
    current.panel.reveal(vscode.ViewColumn.Beside, true);
    return current;
  }

  const panel = vscode.window.createWebviewPanel(
    "headInput",
    "Head + Voice Input",
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "dist")],
    },
  );

  panel.webview.html = renderHtml(panel.webview, context);

  const messageEmitter = new vscode.EventEmitter<WebviewToHostMessage>();
  const sub = panel.webview.onDidReceiveMessage((msg: WebviewToHostMessage) => {
    messageEmitter.fire(msg);
  });

  const handle: PanelHandle = {
    panel,
    post: (msg) => {
      void panel.webview.postMessage(msg);
    },
    onMessage: (handler) => messageEmitter.event(handler),
    dispose: () => {
      sub.dispose();
      messageEmitter.dispose();
      panel.dispose();
    },
  };

  panel.onDidDispose(() => {
    sub.dispose();
    messageEmitter.dispose();
    if (current === handle) {
      current = undefined;
    }
  });

  current = handle;
  return handle;
}

/**
 * Build the HTML payload for the webview. Injects a per-load nonce, asset URIs
 * resolved through `webview.asWebviewUri`, and a CSP that allows MediaPipe's
 * model fetch (`storage.googleapis.com`) plus Deepgram's WebSocket.
 */
function renderHtml(webview: vscode.Webview, context: vscode.ExtensionContext): string {
  const distUri = vscode.Uri.joinPath(context.extensionUri, "dist");
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distUri, "webview.js"));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distUri, "webview.css"));
  const wasmRoot = webview.asWebviewUri(vscode.Uri.joinPath(distUri, "wasm")).toString();
  const nonce = randomBytes(16).toString("base64");
  const cspSource = webview.cspSource;

  const csp = [
    `default-src 'none'`,
    `script-src 'nonce-${nonce}' 'wasm-unsafe-eval' ${cspSource}`,
    `style-src ${cspSource} 'unsafe-inline'`,
    `img-src ${cspSource} data: blob:`,
    `media-src ${cspSource} blob: mediastream:`,
    `font-src ${cspSource}`,
    `worker-src ${cspSource} blob:`,
    `connect-src ${cspSource} https://storage.googleapis.com https://*.deepgram.com wss://api.deepgram.com blob: data:`,
    `frame-src 'none'`,
  ].join("; ");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Head + Voice Input</title>
    <link rel="stylesheet" href="${styleUri}">
    <script nonce="${nonce}">
      window.__HEAD_INPUT__ = ${JSON.stringify({ wasmRoot })};
    </script>
  </head>
  <body>
    <div class="app">
      <div id="banner" class="banner">Initializing...</div>
      <div class="preview">
        <video id="video" autoplay playsinline muted></video>
        <canvas id="overlay"></canvas>
      </div>
      <div class="status-grid">
        <span class="label">Yaw</span>
        <div class="bar"><div id="yaw-fill" class="bar-fill"></div></div>
        <span id="yaw-value" class="value">0°</span>
        <span class="label">Pitch</span>
        <div class="bar"><div id="pitch-fill" class="bar-fill"></div></div>
        <span id="pitch-value" class="value">0°</span>
        <span class="label">Smile</span>
        <div id="smile-bar" class="bar smile"><div id="smile-fill" class="bar-fill"></div></div>
        <span id="smile-value" class="value">0%</span>
        <span class="label">Whistle</span>
        <div id="whistle-bar" class="bar whistle"><div id="whistle-fill" class="bar-fill"></div></div>
        <span id="whistle-value" class="value">-</span>
      </div>
      <div class="toolbar">
        <button id="calibrate">Recalibrate</button>
        <button id="toggle" class="secondary">Pause</button>
        <span id="dictation-pill" class="dictation-pill"><span class="dot"></span><span id="dictation-label">idle</span></span>
        <span id="dab-pill" class="dab-pill"><span class="dot"></span><span>dab</span></span>
      </div>
      <div id="transcript" class="transcript"></div>
    </div>
    <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
}
