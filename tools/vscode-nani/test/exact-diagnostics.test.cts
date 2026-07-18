import assert = require("node:assert/strict");
import vscode = require("vscode");

suite("V-Ronpa Nani exact diagnostics", () => {
  teardown(async () => {
    if (vscode.window.activeTextEditor) {
      await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
    }
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  });

  test("auto-activates for a real .nani workspace file and publishes an exact UTF-16 range", async () => {
    const source = "旁白: 中文😀\r\n@bgm Piano volume:fast";
    const extension = getNaniExtension();
    assert.equal(extension.isActive, false, "opening the .nani file must be the activation trigger");

    const document = await openWorkspaceNaniDocument("auto-activation.nani", source);
    assert.equal(document.languageId, "nani");
    const diagnostic = await waitForDiagnostic(
      document.uri,
      (candidate) => candidate.code === "invalid-command-param"
    );

    assert.equal(extension.isActive, true);
    assert.equal(diagnostic.source, "nani");
    assert.equal(document.getText(diagnostic.range), "fast");
    assert.deepEqual(
      [diagnostic.range.start.line, diagnostic.range.start.character],
      [1, source.split("\r\n")[1]!.indexOf("fast")]
    );
  });

  test("keeps repeated commands attached to the offending occurrence", async () => {
    const source = ["@bgm Piano volume:0.7", "@bgm Piano volume:fast"].join("\n");
    const document = await openNaniDocument(source);
    const diagnostic = await waitForDiagnostic(
      document.uri,
      (candidate) => candidate.code === "invalid-command-param"
    );

    assert.equal(document.getText(diagnostic.range), "fast");
    assert.equal(diagnostic.range.start.line, 1);
  });

  test("publishes only the invalid middle UI list item", async () => {
    const source = "@showUI uINames:dialog,hud,toastLayer wait!";
    const document = await openNaniDocument(source);
    const diagnostic = await waitForDiagnostic(
      document.uri,
      (candidate) => candidate.code === "unsupported-ui-target"
    );

    assert.equal(diagnostic.source, "nani");
    assert.equal(document.getText(diagnostic.range), "hud");
    assert.equal(
      vscode.languages
        .getDiagnostics(document.uri)
        .filter((candidate) => candidate.code === "unsupported-ui-target").length,
      1
    );
  });

  test("projects a quoted and escaped rich-text parser error to the original value", async () => {
    const source = String.raw`@print text:"She said \"hi\" <font color=not-a-color>bad</font>"`;
    const document = await openNaniDocument(source);
    const diagnostic = await waitForDiagnostic(
      document.uri,
      (candidate) => candidate.message.includes("Invalid rich text font color")
    );

    assert.equal(diagnostic.source, "nani");
    assert.equal(diagnostic.code, "invalid-rich-text");
    assert.equal(document.getText(diagnostic.range), "not-a-color");
  });

  test("does not publish diagnostics computed for obsolete document versions", async () => {
    const document = await openNaniDocument("@bgm Piano volume:0.5");
    const editor = await vscode.window.showTextDocument(document);
    await delay(400);
    assert.deepEqual(vscode.languages.getDiagnostics(document.uri), []);

    const observedDiagnosticTexts: string[][] = [];
    const subscription = vscode.languages.onDidChangeDiagnostics((event) => {
      if (!event.uris.some((changed) => changed.toString() === document.uri.toString())) return;
      observedDiagnosticTexts.push(
        vscode.languages.getDiagnostics(document.uri).map((diagnostic) =>
          document.getText(diagnostic.range)
        )
      );
    });

    try {
      await editor.edit((builder) => {
        builder.replace(fullDocumentRange(document), "@bgm Piano volume:fast");
      });
      await editor.edit((builder) => {
        builder.replace(fullDocumentRange(document), "@bgm Piano volume:slow");
      });

      const diagnostic = await waitForDiagnostic(
        document.uri,
        (candidate) => candidate.code === "invalid-command-param"
      );
      await delay(400);
      assert.equal(document.getText(diagnostic.range), "slow");
      assert.equal(
        observedDiagnosticTexts.some((texts) => texts.includes("fast")),
        false,
        `obsolete diagnostic was published: ${JSON.stringify(observedDiagnosticTexts)}`
      );
      assert.equal(
        vscode.languages
          .getDiagnostics(document.uri)
          .some((candidate) => candidate.code === "unknown-command"),
        false
      );
    } finally {
      subscription.dispose();
    }
  });

  test("clears diagnostics after editing an error to valid source", async () => {
    const document = await openNaniDocument("@bgm Piano volume:fast");
    const editor = await vscode.window.showTextDocument(document);
    await waitForDiagnostic(document.uri, (candidate) => candidate.code === "invalid-command-param");

    await editor.edit((builder) => {
      builder.replace(fullDocumentRange(document), "@bgm Piano volume:0.8");
    });

    await waitForDiagnostics(document.uri, (diagnostics) => diagnostics.length === 0);
    assert.deepEqual(vscode.languages.getDiagnostics(document.uri), []);
  });
});

async function openNaniDocument(content: string): Promise<vscode.TextDocument> {
  const document = await vscode.workspace.openTextDocument({ language: "nani", content });
  await vscode.window.showTextDocument(document);
  getNaniExtension();
  return document;
}

async function openWorkspaceNaniDocument(
  fileName: string,
  content: string
): Promise<vscode.TextDocument> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(workspaceFolder, "Extension Host test workspace is available");
  const uri = vscode.Uri.joinPath(workspaceFolder.uri, fileName);
  await vscode.workspace.fs.writeFile(uri, Buffer.from(content, "utf8"));
  const document = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(document);
  return document;
}

function getNaniExtension(): vscode.Extension<unknown> {
  const extension = vscode.extensions.getExtension("v-ronpa.v-ronpa-nani");
  assert.ok(extension, "V-Ronpa Nani extension is available in the Extension Host");
  return extension;
}

async function waitForDiagnostic(
  uri: vscode.Uri,
  predicate: (candidate: vscode.Diagnostic) => boolean,
  timeoutMs = 5_000
): Promise<vscode.Diagnostic> {
  const diagnostics = await waitForDiagnostics(
    uri,
    (candidates) => candidates.some(predicate),
    timeoutMs
  );
  const diagnostic = diagnostics.find(predicate);
  if (!diagnostic) throw new Error("Expected diagnostic disappeared before assertion.");
  return diagnostic;
}

async function waitForDiagnostics(
  uri: vscode.Uri,
  predicate: (diagnostics: readonly vscode.Diagnostic[]) => boolean,
  timeoutMs = 5_000
): Promise<vscode.Diagnostic[]> {
  const existing = vscode.languages.getDiagnostics(uri);
  if (predicate(existing)) return existing;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      subscription.dispose();
      reject(
        new Error(
          `Timed out waiting for diagnostic. Current diagnostics: ${JSON.stringify(
            vscode.languages.getDiagnostics(uri).map((diagnostic) => ({
              code: diagnostic.code,
              message: diagnostic.message,
              source: diagnostic.source
            }))
          )}`
        )
      );
    }, timeoutMs);
    const subscription = vscode.languages.onDidChangeDiagnostics((event) => {
      if (!event.uris.some((changed) => changed.toString() === uri.toString())) return;
      const diagnostics = vscode.languages.getDiagnostics(uri);
      if (!predicate(diagnostics)) return;
      clearTimeout(timeout);
      subscription.dispose();
      resolve(diagnostics);
    });
  });
}

function fullDocumentRange(document: vscode.TextDocument): vscode.Range {
  return new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
