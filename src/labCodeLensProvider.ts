import {
  CodeLensProvider,
  TextDocument,
  CodeLens,
  Range,
  Command
} from "vscode";

import { tokenize } from 'esprima';

class LabCodeLensProvider implements CodeLensProvider {

  async provideCodeLenses(document: TextDocument): Promise<CodeLens[]> {

    if (!document.fileName.match(/\/test\//)) {
      return [];
    }

    const tokens = tokenize(document.getText(), { loc: true });

    const lenses = [];

    tokens.forEach((token, i) => {

      if (token.type === 'Identifier' &&
          (token.value === 'it' || token.value === 'describe') &&
          tokens[i+1] &&
          tokens[i+2] &&
          tokens[i+1].value === '(') {

          const testName = tokens[i+2].value;

          const range = new Range(token.loc.start.line - 1, token.loc.start.column, token.loc.end.line - 1, token.loc.end.column);

          let c: Command = {
            command: "extension.runLabTest",
            title: "[Run Lab Test]",
            arguments: [
              document.fileName,
              this.escapeRegExp(testName)
            ]
          };

          lenses.push(new CodeLens(range, c));
      }

    });

    return lenses;
  }

  escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

export default LabCodeLensProvider;
