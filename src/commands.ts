
import * as vscode from 'vscode'

let terminal = vscode.window.createTerminal('Lab');

vscode.window.onDidCloseTerminal((closed) => {

  if (closed === terminal) {
    terminal = vscode.window.createTerminal('Lab');
  }
});

export async function runLabTest(filepath: string, testname: string) {

  terminal.sendText('clear');
  terminal.show();
  terminal.sendText(`npx lab -m 30000 -v -g ${testname} ${filepath}`);
}
