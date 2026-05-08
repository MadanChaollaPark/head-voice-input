import type {
  HostToWebviewMessage,
  WebviewToHostMessage,
} from "../types";

declare const acquireVsCodeApi: () => {
  postMessage: (msg: WebviewToHostMessage) => void;
};

const vscode = acquireVsCodeApi();

function send(msg: WebviewToHostMessage): void {
  vscode.postMessage(msg);
}

window.addEventListener("message", (event: MessageEvent<HostToWebviewMessage>) => {
  const msg = event.data;
  switch (msg.type) {
    case "config":
      // future commits will wire this
      break;
    case "calibrate":
      break;
    case "toggle":
      break;
  }
});

function setStatus(text: string): void {
  const el = document.getElementById("banner");
  if (el) {
    el.textContent = text;
  }
}

setStatus("Ready. Camera + face tracking will start in the next commit.");
send({ type: "ready" });
