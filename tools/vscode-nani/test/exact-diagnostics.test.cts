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

  test("renders a real layered character artifact only on the @char identity hover", async () => {
    const fixture = await createCharacterPreviewFixture();
    const source = "@char alice.EYE1 time:not-a-number";
    const document = await openWorkspaceNaniDocument("preview/story.nani", source);
    const identityPosition = new vscode.Position(0, source.indexOf("alice") + 2);
    const identityHover = await executeHover(document.uri, identityPosition);

    assert.match(identityHover, /alice.*EYE1/su);
    assert.match(identityHover, /static layered composition/u);
    const artifactUri = artifactUriFromHover(identityHover);
    const info = await vscode.workspace.fs.stat(artifactUri);
    assert.ok(info.size > 0, "character preview SVG exists in extension storage");

    const commandHover = await executeHover(document.uri, new vscode.Position(0, 2));
    assert.doesNotMatch(commandHover, /static layered composition/u);
    assert.match(commandHover, /@char/u);

    const paramStart = source.indexOf("time:");
    const paramHover = await executeHover(document.uri, new vscode.Position(0, paramStart + 1));
    assert.doesNotMatch(paramHover, /static layered composition/u);
    assert.match(paramHover, /time/iu);

    assert.ok(
      vscode.languages.getDiagnostics(document.uri).some((diagnostic) => diagnostic.severity === vscode.DiagnosticSeverity.Error),
      "the unrelated invalid parameter remains a language diagnostic without blocking preview"
    );
    assert.equal(
      vscode.languages.getDiagnostics(document.uri).some((diagnostic) => diagnostic.source === "char-preview"),
      false
    );

    await vscode.workspace.fs.writeFile(fixture.bodyPng, Buffer.concat([fixture.png, Buffer.from([0])]));
    const changedHover = await waitForHover(
      document.uri,
      identityPosition,
      (value) => artifactUriFromHover(value).toString() !== artifactUri.toString()
    );
    assert.notEqual(artifactUriFromHover(changedHover).toString(), artifactUri.toString());
  });

  test("retains the same-line last valid character preview while an invalid expression is edited", async () => {
    await createCharacterPreviewFixture();
    const source = "@char alice.EYE1";
    const document = await openWorkspaceNaniDocument("preview/editing.nani", source);
    const editor = await vscode.window.showTextDocument(document);
    const identityPosition = new vscode.Position(0, source.indexOf("alice") + 2);
    const validHover = await executeHover(document.uri, identityPosition);
    const validArtifact = artifactUriFromHover(validHover).toString();

    const expressionStart = source.indexOf("EYE1");
    await editor.edit((builder) => {
      builder.replace(new vscode.Range(0, expressionStart, 0, expressionStart + 4), "Missing");
    });
    const updating = await executeHover(document.uri, identityPosition);
    assert.match(updating, /正在生成当前外观/u);
    assert.equal(artifactUriFromHover(updating).toString(), validArtifact);

    const invalid = await waitForHover(
      document.uri,
      identityPosition,
      (value) => value.includes("当前表达式无效")
    );
    assert.match(invalid, /当前表达式无效，显示上次有效预览/u);
    assert.match(invalid, /Missing/u);
    assert.equal(artifactUriFromHover(invalid).toString(), validArtifact);
  });

  test("registers Preview Character at Cursor and moves selection to the identity without editing", async () => {
    await createCharacterPreviewFixture();
    const source = "@char alice.EYE1 pos:center";
    const document = await openWorkspaceNaniDocument("preview/command.nani", source);
    const editor = await vscode.window.showTextDocument(document);
    editor.selection = new vscode.Selection(0, source.length, 0, source.length);

    await vscode.commands.executeCommand("v-ronpa-nani.previewCharacterAtCursor");

    assert.equal(document.getText(), source);
    assert.equal(editor.selection.active.line, 0);
    assert.equal(editor.selection.active.character, source.indexOf("alice"));
  });
});

async function createCharacterPreviewFixture(): Promise<{ bodyPng: vscode.Uri; png: Buffer }> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(workspaceFolder, "Extension Host test workspace is available");
  const root = workspaceFolder.uri;
  const pack = vscode.Uri.joinPath(root, "public/example/characters/alice");
  const layers = vscode.Uri.joinPath(pack, "assets/layers");
  const generated = vscode.Uri.joinPath(root, "src/generatedAssets.ts");
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lBY8WQAAAABJRU5ErkJggg==",
    "base64"
  );
  await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(root, "preview"));
  await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(root, "src"));
  await vscode.workspace.fs.createDirectory(layers);
  await writeWorkspaceFile("pnpm-workspace.yaml", "packages: []\n");
  await writeWorkspaceFile("asset.config.mjs", [
    "export default {",
    '  publicRoot: "public/example",',
    '  publicBaseUri: "/example",',
    '  outputPath: "src/generatedAssets.ts",',
    '  exportName: "exampleAssets"',
    "};",
    ""
  ].join("\n"));
  const asset = {
    id: "alice",
    kind: "character-pack",
    optimizedUri: "/example/characters/alice/character.json",
    format: "json",
    compression: [],
    lods: [],
    collisionProxyIds: [],
    tags: []
  };
  await vscode.workspace.fs.writeFile(generated, Buffer.from(`export const exampleAssets = ${JSON.stringify([asset], null, 2)};\n`));
  await writeJson(vscode.Uri.joinPath(pack, "character.json"), {
    id: "alice",
    defaultComposition: ["Default"],
    renderSpace: { stageScale: 1, characterAnchor: [0, 0] }
  });
  await writeJson(vscode.Uri.joinPath(pack, "layers.json"), {
    groups: {
      MAIN: { layers: { BODY: { src: "assets/layers/BODY.png", metadata: "assets/layers/BODY.json" } } },
      "MAIN/EYE": { layers: {
        "0": { src: "assets/layers/EYE0.png", metadata: "assets/layers/EYE0.json" },
        "1": { src: "assets/layers/EYE1.png", metadata: "assets/layers/EYE1.json" }
      } }
    }
  });
  await writeJson(vscode.Uri.joinPath(pack, "compositions.json"), {
    tokens: { Default: ["MAIN>BODY", "MAIN/EYE>0"], EYE1: ["MAIN/EYE>1"] }
  });
  await writeJson(vscode.Uri.joinPath(layers, "BODY.json"), previewMetadata(0));
  await writeJson(vscode.Uri.joinPath(layers, "EYE0.json"), previewMetadata(1));
  await writeJson(vscode.Uri.joinPath(layers, "EYE1.json"), previewMetadata(2));
  const bodyPng = vscode.Uri.joinPath(layers, "BODY.png");
  await vscode.workspace.fs.writeFile(bodyPng, png);
  await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(layers, "EYE0.png"), png);
  await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(layers, "EYE1.png"), png);
  await vscode.commands.executeCommand("v-ronpa-nani.refreshProjectAssets");
  return { bodyPng, png };
}

function previewMetadata(drawOrder: number): Record<string, unknown> {
  return {
    sourcePath: `fixture/${drawOrder}`,
    drawOrder,
    sprite: { pivot: { x: 0, y: 0 }, pixelsPerUnit: 1 },
    localTransform: {
      position: { x: drawOrder, y: drawOrder, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      rotation: { x: 0, y: 0, z: 0 }
    },
    renderer: { color: { r: 1, g: 1, b: 1, a: 1 }, flipX: false, flipY: false }
  };
}

async function writeWorkspaceFile(path: string, content: string): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(workspaceFolder);
  await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(workspaceFolder.uri, path), Buffer.from(content));
}

async function writeJson(uri: vscode.Uri, value: unknown): Promise<void> {
  await vscode.workspace.fs.writeFile(uri, Buffer.from(`${JSON.stringify(value, null, 2)}\n`));
}

async function executeHover(uri: vscode.Uri, position: vscode.Position): Promise<string> {
  const hovers = await vscode.commands.executeCommand<vscode.Hover[]>("vscode.executeHoverProvider", uri, position);
  assert.ok(hovers && hovers.length > 0, `Expected hover at ${position.line}:${position.character}`);
  return hovers.flatMap((hover) => hover.contents).map((content) => typeof content === "string" ? content : content.value).join("\n");
}

async function waitForHover(
  uri: vscode.Uri,
  position: vscode.Position,
  predicate: (value: string) => boolean,
  timeoutMs = 5_000
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    last = await executeHover(uri, position);
    if (predicate(last)) return last;
    await delay(100);
  }
  throw new Error(`Timed out waiting for hover. Last hover: ${last}`);
}

function artifactUriFromHover(hover: string): vscode.Uri {
  const match = /<img src="([^"]+)"/u.exec(hover);
  assert.ok(match?.[1], `Expected artifact image URI in hover: ${hover}`);
  return vscode.Uri.parse(match[1].replace(/&amp;/gu, "&"));
}

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
