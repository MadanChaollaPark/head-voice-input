import * as vscode from "vscode";

export type StatusState = "off" | "tracking" | "paused" | "dictating";

export interface StatusBar {
  setState: (state: StatusState) => void;
  setError: (message: string) => void;
  dispose: () => void;
}

export function createStatusBar(context: vscode.ExtensionContext): StatusBar {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.command = "headInput.openPanel";
  context.subscriptions.push(item);

  function render(state: StatusState): void {
    switch (state) {
      case "off":
        item.text = "$(eye-closed) Head Input";
        item.tooltip = "Click to open Head + Voice Input panel";
        item.backgroundColor = undefined;
        return;
      case "tracking":
        item.text = "$(eye) Head Input";
        item.tooltip = "Tracking head pose. Smile to dictate.";
        item.backgroundColor = undefined;
        return;
      case "paused":
        item.text = "$(debug-pause) Head Input";
        item.tooltip = "Tracking paused.";
        item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
        return;
      case "dictating":
        item.text = "$(record) Dictating";
        item.tooltip = "Smile-held dictation active.";
        item.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
        return;
    }
  }

  render("off");
  item.show();

  return {
    setState: render,
    setError: (message) => {
      item.text = `$(warning) Head Input`;
      item.tooltip = message;
      item.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
    },
    dispose: () => item.dispose(),
  };
}
