import { useEffect } from "react";
import "./webGameDocumentPolicy.css";

const WEB_GAME_DOCUMENT_ATTRIBUTE = "data-v-ronpa-web-game-document";
const TEXT_EDITABLE_INPUT_TYPES = new Set([
  "",
  "email",
  "number",
  "password",
  "search",
  "tel",
  "text",
  "url"
]);

interface ActiveWebGameDocumentPolicy {
  count: number;
  previousAttributeValue: string | null;
  listeners: Array<{ type: string; listener: EventListener }>;
}

const activePolicies = new WeakMap<Document, ActiveWebGameDocumentPolicy>();

export function useWebGameDocumentPolicy(): void {
  useEffect(() => {
    if (typeof document === "undefined") return;
    return installWebGameDocumentPolicy(document);
  }, []);
}

export function installWebGameDocumentPolicy(targetDocument: Document): () => void {
  const active = activePolicies.get(targetDocument);
  if (active) {
    active.count += 1;
    return createPolicyRelease(targetDocument, active);
  }

  const previousAttributeValue = targetDocument.documentElement.getAttribute(WEB_GAME_DOCUMENT_ATTRIBUTE);
  targetDocument.documentElement.setAttribute(WEB_GAME_DOCUMENT_ATTRIBUTE, "active");

  const listeners = createPolicyListeners();
  for (const { type, listener } of listeners) {
    targetDocument.addEventListener(type, listener, true);
  }

  const policy: ActiveWebGameDocumentPolicy = {
    count: 1,
    previousAttributeValue,
    listeners
  };
  activePolicies.set(targetDocument, policy);
  return createPolicyRelease(targetDocument, policy);
}

function createPolicyRelease(targetDocument: Document, policy: ActiveWebGameDocumentPolicy): () => void {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    policy.count -= 1;
    if (policy.count > 0) return;

    for (const { type, listener } of policy.listeners) {
      targetDocument.removeEventListener(type, listener, true);
    }
    if (policy.previousAttributeValue === null) {
      targetDocument.documentElement.removeAttribute(WEB_GAME_DOCUMENT_ATTRIBUTE);
    } else {
      targetDocument.documentElement.setAttribute(WEB_GAME_DOCUMENT_ATTRIBUTE, policy.previousAttributeValue);
    }
    activePolicies.delete(targetDocument);
  };
}

function createPolicyListeners(): Array<{ type: string; listener: EventListener }> {
  const preventOutsideEditable: EventListener = (event) => {
    if (!eventTargetsEditable(event)) event.preventDefault();
  };
  const preventUnsafeDrop: EventListener = (event) => {
    if (dragEventHasFiles(event) || dragEventHasNonPlainText(event) || !eventTargetsEditable(event)) event.preventDefault();
  };

  return [
    { type: "contextmenu", listener: preventOutsideEditable },
    { type: "selectstart", listener: preventOutsideEditable },
    { type: "dragstart", listener: preventOutsideEditable },
    { type: "dragover", listener: preventUnsafeDrop },
    { type: "drop", listener: preventUnsafeDrop }
  ];
}

export function eventTargetsEditable(event: Pick<Event, "composedPath" | "target">): boolean {
  const path = typeof event.composedPath === "function" ? event.composedPath() : [];
  const targets = path.length > 0 ? path : event.target ? [event.target] : [];
  return targets.some(isTextEditableTarget);
}

export function dragEventHasFiles(event: Event): boolean {
  const dataTransfer = (event as Event & { dataTransfer?: Pick<DataTransfer, "types"> | null }).dataTransfer;
  return dataTransfer ? Array.from(dataTransfer.types).includes("Files") : false;
}

export function dragEventHasNonPlainText(event: Event): boolean {
  const dataTransfer = (event as Event & { dataTransfer?: Pick<DataTransfer, "types"> | null }).dataTransfer;
  if (!dataTransfer) return false;
  return Array.from(dataTransfer.types).some((type) => type !== "text/plain" && type !== "Files");
}

function isTextEditableTarget(target: EventTarget): boolean {
  const candidate = target as EventTarget & {
    getAttribute?: (name: string) => string | null;
    isContentEditable?: boolean;
    tagName?: string;
    type?: string;
  };
  const tagName = candidate.tagName?.toLowerCase();
  if (tagName === "textarea") return true;
  if (tagName === "input") return TEXT_EDITABLE_INPUT_TYPES.has((candidate.type ?? "").toLowerCase());
  if (candidate.isContentEditable === true) return true;
  const contentEditable = candidate.getAttribute?.("contenteditable");
  return contentEditable !== undefined && contentEditable !== null && contentEditable.toLowerCase() !== "false";
}
