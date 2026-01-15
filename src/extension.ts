/**
 * @fileoverview Lab Test Explorer - A VSCode extension for running @hapi/lab tests
 *
 * This extension integrates with VSCode's native Test Explorer to provide seamless
 * test discovery and execution for projects using the @hapi/lab testing framework.
 *
 * @module extension
 */
import { spawn } from "child_process";
import * as fs from "fs";
import path from "path";
import * as vscode from "vscode";
import { getConfig } from "./config";
import { LabTestController } from "./testController";

type DependencyMap = Record<string, string>;

interface PackageJson {
  dependencies?: DependencyMap;
  devDependencies?: DependencyMap;
}

const isPackageJson = (value: unknown): value is PackageJson => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;
  const hasDependencies =
    obj.dependencies === undefined ||
    (typeof obj.dependencies === "object" && obj.dependencies !== null);
  const hasDevDependencies =
    obj.devDependencies === undefined ||
    (typeof obj.devDependencies === "object" && obj.devDependencies !== null);

  return hasDependencies && hasDevDependencies;
};

let testController: LabTestController | undefined;
let outputChannel: vscode.OutputChannel | undefined;

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
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    return;
  }

  for (const folder of workspaceFolders) {
    const pkgPath = path.join(folder.uri.fsPath, "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkgRaw: unknown = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      if (!isPackageJson(pkgRaw)) {
        continue;
      }

      const deps = {
        ...(pkgRaw.dependencies ?? {}),
        ...(pkgRaw.devDependencies ?? {}),
      };
      if (deps["@hapi/lab"] || deps.lab) {
        console.log("Lab Test Explorer is now active");

        testController = new LabTestController();
        context.subscriptions.push({
          dispose: () => testController?.dispose(),
        });

        const refreshCommand = vscode.commands.registerCommand(
          "labTestExplorer.refresh",
          async () => {
            await testController?.discoverAllTests();
          }
        );
        context.subscriptions.push(refreshCommand);

        const activationCommand = getConfig().activationCommand;
        if (activationCommand) {
          outputChannel = vscode.window.createOutputChannel("Lab Test Explorer");
          context.subscriptions.push(outputChannel);
          outputChannel.show(true);

          const binPath = path.join(folder.uri.fsPath, "node_modules", ".bin");
          const env = {
            ...process.env,
            PATH: `${binPath}:${process.env.PATH}`,
          };

          outputChannel.appendLine(`> ${activationCommand}\n`);

          const proc = spawn(activationCommand, [], {
            cwd: folder.uri.fsPath,
            env,
            shell: true,
          });

          proc.stdout.on("data", (data: Buffer) => {
            outputChannel?.append(data.toString());
          });

          proc.stderr.on("data", (data: Buffer) => {
            outputChannel?.append(data.toString());
          });

          proc.on("error", (err) => {
            outputChannel?.appendLine(`\nActivation command failed: ${err.message}`);
          });

          proc.on("close", (code) => {
            outputChannel?.appendLine(`\nProcess exited with code ${code}`);
          });
        }
      }
    }
  }
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
  outputChannel?.dispose();
  outputChannel = undefined;
}
