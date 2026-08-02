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

  test("provides catalog-driven charTone primary completion, hover, and exact diagnostics", async () => {
    const source = ["@charTone r", "@charTone unknown"].join("\n");
    const document = await openNaniDocument(source);
    const completions = await executeCompletions(
      document.uri,
      new vscode.Position(0, "@charTone r".length),
      0
    );
    assert.deepEqual(completions.items.map(completionLabel), ["rain"]);

    const hover = await executeHover(
      document.uri,
      new vscode.Position(0, "@charTone r".length)
    );
    assert.match(hover, /preset parameter · string · primary/u);
    assert.match(hover, /rain, fog, sunset, night, alert, fluorescent, none/u);

    const invalid = await waitForDiagnostic(
      document.uri,
      (candidate) =>
        candidate.code === "invalid-command-param" &&
        document.getText(candidate.range) === "unknown"
    );
    assert.equal(invalid.source, "nani");
    assert.equal(invalid.range.start.line, 1);
    assert.equal(
      vscode.languages
        .getDiagnostics(document.uri)
        .some((candidate) => candidate.code === "unknown-command"),
      false
    );
  });

  test("provides Cue, HideCue, and staged-text editor behavior from shared facts", async () => {
    const source = [
      '@cue "Center[-]More" autoNext!',
      "@hideCue time:0.4 wait!",
      "Felix: A[",
      '@cue "A['
    ].join("\n");
    const document = await openNaniDocument(source);
    const commandHover = await executeHover(document.uri, new vscode.Position(0, 2));
    const primaryHover = await executeHover(document.uri, new vscode.Position(0, 9));
    const compactHover = await executeHover(document.uri, new vscode.Position(0, 13));
    const hideHover = await executeHover(document.uri, new vscode.Position(1, 4));

    assert.match(commandHover, /画面中央/u);
    assert.match(primaryHover, /text parameter · string · primary/u);
    assert.match(compactHover, /staged-text input stop/u);
    assert.match(hideHover, /隐藏中央演出文本 Surface/u);

    const dialogue = await executeCompletions(
      document.uri,
      new vscode.Position(2, "Felix: A[".length),
      0
    );
    assert.deepEqual(dialogue.items.map(completionLabel), ["[>]", "[< speed:0.8]", "[-]", "[wait i]"]);
    const explicit = await executeCompletions(
      document.uri,
      new vscode.Position(3, '@cue "A['.length),
      0
    );
    assert.deepEqual(explicit.items.map(completionLabel), ["[-]", "[wait i]"]);
  });

  test("publishes exact required Cue text and textId diagnostics", async () => {
    const source = [
      "@cue",
      "@cue 42",
      '@cue "A" textId:shared_id',
      '@print "B" textId:shared_id',
      '@cue "C" textId:"bad id"'
    ].join("\n");
    const document = await openNaniDocument(source);
    const diagnostics = await waitForDiagnostics(document.uri, (values) =>
      values.some((diagnostic) => diagnostic.message.includes("@cue requires parameter text:string"))
      && values.filter((diagnostic) => diagnostic.message.includes("Duplicate textId")).length >= 1
      && values.some((diagnostic) => diagnostic.message.includes("Invalid textId"))
    );

    assert.equal(
      diagnostics.find((diagnostic) => diagnostic.message.includes("@cue primary parameter expected string"))
        && document.getText(diagnostics.find((diagnostic) => diagnostic.message.includes("@cue primary parameter expected string"))!.range),
      "42"
    );
    assert.deepEqual(
      diagnostics
        .filter((diagnostic) => diagnostic.message.includes("Duplicate textId"))
        .map((diagnostic) => document.getText(diagnostic.range)),
      ["shared_id"]
    );
    const invalid = diagnostics.find((diagnostic) => diagnostic.message.includes("Invalid textId"));
    assert.ok(invalid);
    assert.equal(document.getText(invalid.range), "bad id");
  });

  test("provides live multi-script diagnostics, completion, hover, and definitions", async () => {
    const fixture = await createNavigationFixture();
    const opening = await vscode.workspace.openTextDocument(fixture.openingUri);
    const chapter = await vscode.workspace.openTextDocument(fixture.chapterUri);
    const editor = await vscode.window.showTextDocument(opening);

    const completionPosition = new vscode.Position(2, '@choice "Again" goto:'.length);
    const completions = await waitForCompletions(
      opening.uri,
      completionPosition,
      (items) => items.some((item) => completionLabel(item) === "game/chapter.nani")
    );
    assert.deepEqual(
      completions.items.slice(0, 3).map(completionLabel),
      ["#Start", "game/chapter.nani", "game/opening.nani"]
    );

    const endpointPosition = new vscode.Position(1, "@goto game/".length);
    const hover = await executeHover(opening.uri, endpointPosition);
    assert.match(hover, /cross-script navigation target/u);
    assert.match(hover, /game\/chapter\.nani/u);

    const definitions = await waitForDefinitions(
      opening.uri,
      endpointPosition,
      (values) => values.length === 1
    );
    assert.ok(definitions && definitions.length === 1);
    const definition = definitions[0];
    assert.ok(definition);
    const targetUri = "uri" in definition ? definition.uri : definition.targetUri;
    const targetRange = "uri" in definition
      ? definition.range
      : definition.targetSelectionRange;
    assert.ok(targetRange);
    assert.equal(targetUri.toString(), chapter.uri.toString());
    assert.equal(targetRange.start.line, 0);
    assert.equal(chapter.getText(targetRange), "Chapter");

    const endpointStart = opening.lineAt(1).text.indexOf("game/chapter");
    await editor.edit((builder) => {
      builder.replace(
        new vscode.Range(1, endpointStart, 1, opening.lineAt(1).text.length),
        "game/chapter.nani#Missing"
      );
    });
    const invalid = await waitForDiagnostic(
      opening.uri,
      (diagnostic) => diagnostic.code === "endpoint-label-missing"
    );
    assert.equal(opening.getText(invalid.range), "game/chapter.nani#Missing");
    const invalidDefinitions = await vscode.commands.executeCommand<
      Array<vscode.Location | vscode.LocationLink>
    >(
      "vscode.executeDefinitionProvider",
      opening.uri,
      new vscode.Position(1, endpointStart + 5)
    );
    assert.equal(invalidDefinitions?.length ?? 0, 0);

    const chapterEditor = await vscode.window.showTextDocument(chapter);
    await chapterEditor.edit((builder) => {
      builder.insert(chapter.positionAt(chapter.getText().length), "\n#Missing\n@end");
    });
    await waitForDiagnostics(
      opening.uri,
      (diagnostics) => !diagnostics.some((diagnostic) => diagnostic.code === "endpoint-label-missing")
    );

    const smoke = await vscode.workspace.openTextDocument(fixture.smokeUri);
    await vscode.window.showTextDocument(smoke);
    const smokeCompletions = await executeCompletions(
      smoke.uri,
      new vscode.Position(1, "@goto ".length),
      0
    );
    assert.deepEqual(
      smokeCompletions.items.slice(0, 2).map(completionLabel),
      ["#Start", "game/test/smoke.nani"]
    );
    assert.equal(
      smokeCompletions.items.some((item) => completionLabel(item) === "game/opening.nani"),
      false
    );

    const unregisteredUri = vscode.Uri.joinPath(
      vscode.workspace.workspaceFolders![0]!.uri,
      "stories/unregistered.nani"
    );
    await vscode.workspace.fs.writeFile(
      unregisteredUri,
      Buffer.from("#Solo\n@goto #S")
    );
    const unregistered = await vscode.workspace.openTextDocument(unregisteredUri);
    await vscode.window.showTextDocument(unregistered);
    const fallback = await executeCompletions(
      unregistered.uri,
      new vscode.Position(1, "@goto #S".length),
      0
    );
    assert.deepEqual(fallback.items.map(completionLabel), ["#Solo"]);
  });

  test("publishes duplicate discovered logical paths on the project config", async () => {
    const fixture = await createNavigationFixture(true);
    await vscode.commands.executeCommand("v-ronpa-nani.refreshProjectAssets");
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(fixture.openingUri));

    const diagnostic = await waitForDiagnostic(
      fixture.configUri,
      (candidate) => candidate.source === "nani-project"
    );
    assert.equal(diagnostic.code, "invalid-project-script-config");
    assert.ok(diagnostic.message.includes("produced by both"));
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

  test("lazily resolves token-local and projected character images in completion documentation", async () => {
    await createCharacterPreviewFixture();
    const source = "@char alice.EYE1,MO";
    const document = await openWorkspaceNaniDocument("preview/completion.nani", source);
    const position = new vscode.Position(0, source.length);

    const unresolved = await executeCompletions(document.uri, position, 0);
    const unresolvedMouth = unresolved.items.find((item) => completionLabel(item) === "MOUTH0");
    assert.ok(unresolvedMouth, "MOUTH0 is offered from the live character pack");
    assert.equal(unresolvedMouth.documentation, undefined, "candidate list creation does not load preview documentation");

    const resolved = await executeCompletions(document.uri, position, 20);
    const mouth = resolved.items.find((item) => completionLabel(item) === "MOUTH0");
    assert.ok(mouth, "resolved MOUTH0 completion exists");
    const documentation = completionDocumentation(mouth);
    assert.match(documentation, /当前候选/u);
    assert.match(documentation, /应用后的角色/u);
    assert.doesNotMatch(documentation, /MAIN\/MOUTH|展开/u);
    const artifactUris = artifactUrisFromMarkdown(documentation);
    assert.equal(artifactUris.length, 2, `expected contribution and complete images: ${documentation}`);
    const [contributionUri, completeUri] = artifactUris;
    assert.ok(contributionUri && completeUri);
    for (const uri of artifactUris) {
      const info = await vscode.workspace.fs.stat(uri);
      assert.ok(info.size > 0, `completion preview artifact exists: ${uri.toString()}`);
    }
    const contributionSvg = Buffer.from(await vscode.workspace.fs.readFile(contributionUri)).toString("utf8");
    const completeSvg = Buffer.from(await vscode.workspace.fs.readFile(completeUri)).toString("utf8");
    assert.match(contributionSvg, /data-layer="MAIN\/MOUTH&gt;0"/u);
    assert.doesNotMatch(contributionSvg, /data-layer="MAIN&gt;BODY"/u);
    assert.match(completeSvg, /data-layer="MAIN&gt;BODY"/u);
    assert.match(completeSvg, /data-layer="MAIN\/MOUTH&gt;0"/u);
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
    '  runtimeAssetOutputPath: "src/generatedAssets.ts",',
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
      } },
      "MAIN/MOUTH": { layers: {
        "0": { src: "assets/layers/MOUTH0.png", metadata: "assets/layers/MOUTH0.json" },
        "2": { src: "assets/layers/MOUTH2.png", metadata: "assets/layers/MOUTH2.json" }
      } }
    }
  });
  await writeJson(vscode.Uri.joinPath(pack, "compositions.json"), {
    tokens: {
      Default: ["MAIN>BODY", "MAIN/EYE>0", "MAIN/MOUTH>2"],
      EYE1: ["MAIN/EYE>1"],
      MOUTH0: ["MAIN/MOUTH>0"]
    }
  });
  await writeJson(vscode.Uri.joinPath(layers, "BODY.json"), previewMetadata(0));
  await writeJson(vscode.Uri.joinPath(layers, "EYE0.json"), previewMetadata(1));
  await writeJson(vscode.Uri.joinPath(layers, "EYE1.json"), previewMetadata(2));
  await writeJson(vscode.Uri.joinPath(layers, "MOUTH0.json"), previewMetadata(3));
  await writeJson(vscode.Uri.joinPath(layers, "MOUTH2.json"), previewMetadata(3));
  const bodyPng = vscode.Uri.joinPath(layers, "BODY.png");
  await vscode.workspace.fs.writeFile(bodyPng, png);
  await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(layers, "EYE0.png"), png);
  await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(layers, "EYE1.png"), png);
  await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(layers, "MOUTH0.png"), png);
  await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(layers, "MOUTH2.png"), png);
  await vscode.commands.executeCommand("v-ronpa-nani.refreshProjectAssets");
  return { bodyPng, png };
}

async function createNavigationFixture(duplicate = false): Promise<{
  configUri: vscode.Uri;
  openingUri: vscode.Uri;
  chapterUri: vscode.Uri;
  smokeUri: vscode.Uri;
}> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(workspaceFolder);
  const root = workspaceFolder.uri;
  const openingUri = vscode.Uri.joinPath(root, "stories/nani/opening.nani");
  const chapterUri = vscode.Uri.joinPath(root, "stories/nani/chapter.nani");
  const smokeUri = vscode.Uri.joinPath(root, "stories/nani-test/smoke.nani");
  const configUri = vscode.Uri.joinPath(root, "asset.config.mjs");
  await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(root, "stories/nani"));
  await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(root, "stories/nani-test"));
  await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(root, "src"));
  await writeWorkspaceFile("pnpm-workspace.yaml", "packages: []\n");
  await vscode.workspace.fs.writeFile(
    openingUri,
    Buffer.from([
      "#Start",
      "@goto game/chapter.nani#Chapter",
      '@choice "Again" goto:#Start'
    ].join("\n"))
  );
  await vscode.workspace.fs.writeFile(chapterUri, Buffer.from("#Chapter\n@end"));
  await writeWorkspaceFile("src/generatedAssets.ts", "export const exampleAssets = [];\n");
  if (duplicate) {
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(root, "stories/nani-dev"));
    await vscode.workspace.fs.writeFile(
      vscode.Uri.joinPath(root, "stories/nani-dev/opening.nani"),
      Buffer.from("#Start\n@end\n")
    );
  }
  await vscode.workspace.fs.writeFile(
    configUri,
    Buffer.from(`export default ${JSON.stringify({
      publicRoot: "public/example",
      publicBaseUri: "/example",
      runtimeAssetOutputPath: "src/generatedAssets.ts",
      exportName: "exampleAssets",
      naniProject: {
        scopes: {
          production: { sourceRoot: "stories/nani", scriptRoot: "game" },
          ...(duplicate
            ? { development: { sourceRoot: "stories/nani-dev", scriptRoot: "game" } }
            : {}),
          test: { sourceRoot: "stories/nani-test", scriptRoot: "game/test" }
        },
        mainEntry: {
          id: "vn:main",
          scope: "production",
          initialScriptPath: "game/opening.nani",
          startLabel: "Start"
        },
        testEntries: {
        smoke: {
            id: "vn:test-smoke",
            scope: "test",
            initialScriptPath: "game/test/smoke.nani",
            startLabel: "Start"
          }
        },
        voiceLocales: []
      }
    }, null, 2)};\n`)
  );
  await vscode.workspace.fs.writeFile(
    smokeUri,
    Buffer.from("#Start\n@goto #Start\n@end\n")
  );
  await vscode.commands.executeCommand("v-ronpa-nani.refreshProjectAssets");
  return { configUri, openingUri, chapterUri, smokeUri };
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

async function executeCompletions(
  uri: vscode.Uri,
  position: vscode.Position,
  itemResolveCount: number
): Promise<vscode.CompletionList> {
  const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
    "vscode.executeCompletionItemProvider",
    uri,
    position,
    undefined,
    itemResolveCount
  );
  assert.ok(completions, `Expected completions at ${position.line}:${position.character}`);
  return completions;
}

async function waitForCompletions(
  uri: vscode.Uri,
  position: vscode.Position,
  predicate: (items: readonly vscode.CompletionItem[]) => boolean,
  timeoutMs = 5_000
): Promise<vscode.CompletionList> {
  const deadline = Date.now() + timeoutMs;
  let last: vscode.CompletionList | undefined;
  while (Date.now() < deadline) {
    last = await executeCompletions(uri, position, 0);
    if (predicate(last.items)) return last;
    await delay(100);
  }
  throw new Error(`Timed out waiting for catalog completions: ${last?.items.map(completionLabel).join(", ") ?? "none"}`);
}

async function waitForDefinitions(
  uri: vscode.Uri,
  position: vscode.Position,
  predicate: (values: readonly (vscode.Location | vscode.LocationLink)[]) => boolean,
  timeoutMs = 5_000
): Promise<Array<vscode.Location | vscode.LocationLink>> {
  const deadline = Date.now() + timeoutMs;
  let last: Array<vscode.Location | vscode.LocationLink> = [];
  while (Date.now() < deadline) {
    last = await vscode.commands.executeCommand<Array<vscode.Location | vscode.LocationLink>>(
      "vscode.executeDefinitionProvider",
      uri,
      position
    ) ?? [];
    if (predicate(last)) return last;
    await delay(100);
  }
  throw new Error(`Timed out waiting for catalog definition; found ${last.length}.`);
}

function completionLabel(item: vscode.CompletionItem): string {
  return typeof item.label === "string" ? item.label : item.label.label;
}

function completionDocumentation(item: vscode.CompletionItem): string {
  const documentation = item.documentation;
  assert.ok(documentation, `Expected resolved documentation for ${completionLabel(item)}`);
  return typeof documentation === "string" ? documentation : documentation.value;
}

function artifactUrisFromMarkdown(markdown: string): vscode.Uri[] {
  return [...markdown.matchAll(/<img src="([^"]+)"/gu)].map((match) => {
    assert.ok(match[1]);
    return vscode.Uri.parse(match[1].replace(/&amp;/gu, "&"));
  });
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
