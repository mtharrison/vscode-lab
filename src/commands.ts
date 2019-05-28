
import * as vscode from 'vscode'

const terminal = vscode.window.createTerminal(`Lab test`);

export async function runLabTest(filename: string, testname: string) {

  terminal.sendText(`npx lab -m 20000 -a @hapi/code -v -g ${testname} ${filename}`);
  terminal.show();
}
