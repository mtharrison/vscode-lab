/**
 * @fileoverview Lab Test Explorer - A VSCode extension for running @hapi/lab tests
 *
 * This extension integrates with VSCode's native Test Explorer to provide seamless
 * test discovery and execution for projects using the @hapi/lab testing framework.
 *
 * @module extension
 */
import * as vscode from 'vscode';
import { LabTestController } from './testController';

let testController: LabTestController | undefined;

/**
 * Activates the Lab Test Explorer extension.
 *
 * This function is called by VSCode when the extension is activated. It initializes
 * the test controller which handles test discovery, display in the Test Explorer,
 * and test execution.
 *
 * @param context - The extension context provided by VSCode, used for managing
 *                  subscriptions and extension lifecycle
 */
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

/**
 * Deactivates the Lab Test Explorer extension.
 *
 * Called by VSCode when the extension is being deactivated. Cleans up resources
 * by disposing of the test controller and releasing any held references.
 */
export function deactivate(): void {
  testController?.dispose();
  testController = undefined;
}
