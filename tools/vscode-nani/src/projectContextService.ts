import * as vscode from "vscode";
import {
  NaniProjectAssetService,
  type NaniProjectAssetInvalidation
} from "./projectAssetService";
import {
  NaniProjectScriptService,
  type NaniCatalogSnapshot,
  type NaniProjectScriptInvalidation
} from "./projectScriptService";

export type NaniProjectContextInvalidation = NaniProjectAssetInvalidation & NaniProjectScriptInvalidation;

/** Owns one coherent asset/script generation for every configured App. */
export class NaniProjectContextService implements vscode.Disposable {
  private readonly assets: NaniProjectAssetService;
  private readonly scripts: NaniProjectScriptService;
  private readonly invalidationEmitter = new vscode.EventEmitter<NaniProjectContextInvalidation>();
  private readonly subscriptions: vscode.Disposable[] = [];
  private synchronizingAssets = false;
  readonly onDidInvalidate = this.invalidationEmitter.event;

  constructor(output: vscode.OutputChannel) {
    this.assets = new NaniProjectAssetService(output);
    this.scripts = new NaniProjectScriptService(output, this.assets);
    this.subscriptions.push(
      this.assets.onDidInvalidate((event) => {
        this.synchronizingAssets = true;
        if (event.configPath) this.scripts.refreshConfig(event.configPath);
        else this.scripts.refreshAll();
        this.synchronizingAssets = false;
        this.invalidationEmitter.fire(event);
      }),
      this.scripts.onDidInvalidate((event) => {
        if (!this.synchronizingAssets) this.invalidationEmitter.fire(event);
      })
    );
  }

  getIndex(documentUri: vscode.Uri) {
    return this.assets.getIndex(documentUri);
  }

  getLoaded(documentUri: vscode.Uri) {
    return this.assets.getLoaded(documentUri);
  }

  getCharacterPackDescriptor(documentUri: vscode.Uri, characterId: string) {
    return this.assets.getCharacterPackDescriptor(documentUri, characterId);
  }

  getSnapshot(documentUri: vscode.Uri): Promise<NaniCatalogSnapshot | undefined> {
    return this.scripts.getSnapshot(documentUri);
  }

  isCurrent(snapshot: NaniCatalogSnapshot): boolean {
    return this.scripts.isCurrent(snapshot);
  }

  refreshAll(): void {
    this.assets.refreshAll();
  }

  dispose(): void {
    this.subscriptions.forEach((subscription) => subscription.dispose());
    this.scripts.dispose();
    this.assets.dispose();
    this.invalidationEmitter.dispose();
  }
}
