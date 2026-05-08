import * as vscode from "vscode";

const DEEPGRAM_SECRET_KEY = "headInput.deepgramApiKey";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  context.subscriptions.push(
    vscode.commands.registerCommand("headInput.openPanel", () => {
      vscode.window.showInformationMessage("Head Input panel — coming next commit.");
    }),
    vscode.commands.registerCommand("headInput.calibrate", () => {
      vscode.window.showInformationMessage("Head Input: calibration requested.");
    }),
    vscode.commands.registerCommand("headInput.toggle", () => {
      vscode.window.showInformationMessage("Head Input: toggle requested.");
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
  );

  if (vscode.workspace.getConfiguration("headInput").get<boolean>("autoOpenOnStartup")) {
    void vscode.commands.executeCommand("headInput.openPanel");
  }
}

export function deactivate(): void {
  // no-op for now
}
