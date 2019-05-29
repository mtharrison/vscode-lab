
import * as vscode from 'vscode'
import * as cp from 'child_process'

const outputChannel = vscode.window.createOutputChannel(`Lab`);

export async function runLabTest(filepath: string, testname: string) {

  outputChannel.clear();

  const args = [
    'lab',
    '-m',
    '30000',
    '-v',
    '-g',
    testname.slice(1, testname.length - 1),
    filepath
  ];

  console.log(args);

  const cmd = cp.spawn('npx', args, {
    cwd: vscode.workspace.getWorkspaceFolder(vscode.Uri.parse(`file://${filepath}`)).uri.fsPath
  });

  cmd.stdout.on('data', (data) => outputChannel.append(data.toString()));
  cmd.stderr.on('data', (data) => outputChannel.append(data.toString()));

  cmd.on('close', (code) => outputChannel.appendLine(`exited with code ${code}`));

  outputChannel.show();
}
