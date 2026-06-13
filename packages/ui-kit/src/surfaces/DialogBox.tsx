import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

export function DialogBox({
  speaker,
  text,
  children
}: {
  speaker?: string;
  text: string;
  children?: ReactNode;
}) {
  return (
    <section className="dialog-box" aria-label="dialog">
      <div className="dialog-speaker">{speaker ?? "Narrator"}</div>
      <p>{text}</p>
      {children}
      <Dialog.Root>
        <Dialog.Trigger asChild>
          <button className="icon-button" aria-label="Open backlog">
            ≡
          </button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="modal-overlay" />
          <Dialog.Content className="modal-content">
            <Dialog.Title>Backlog</Dialog.Title>
            <Dialog.Description>{speaker ? `${speaker}: ${text}` : text}</Dialog.Description>
            <Dialog.Close asChild>
              <button className="primary-button">Close</button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
