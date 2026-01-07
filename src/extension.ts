import * as vscode from 'vscode';
import { LabTestController } from './testController';

let testController: LabTestController | undefined;

export function activate(context: vscode.ExtensionContext): void {
  console.log('Lab Test Explorer is now active');

  testController = new LabTestController();
  context.subscriptions.push({
    dispose: () => testController?.dispose(),
  });

  const refreshCommand = vscode.commands.registerCommand(
    'labTestExplorer.refresh',
    async () => {
      await testController?.discoverAllTests();
    }
  );
  context.subscriptions.push(refreshCommand);
}

export function deactivate(): void {
  testController?.dispose();
  testController = undefined;
}
