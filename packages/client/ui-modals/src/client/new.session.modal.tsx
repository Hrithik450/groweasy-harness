"use client";

import React, { useState } from "react";
import { X, Bot } from "lucide-react";
import { Modal } from "@openai-harness/client-ui-primitives";
import {
  useModalStore,
  useSessionStore,
} from "@openai-harness/client-ui-session";
import { toast } from "sonner";
import { createSession } from "./session-rpc";
import { navigateToSession } from "./navigation";

/**
 * New-agent-session surface for the `shell.overlay` seat.
 *
 * Markup and Tailwind classes are the application's existing modal. Next's
 * `useRouter` is replaced by {@link navigateToSession}, and session creation
 * goes through this package's typed Gateway client.
 */
export function NewSessionModal() {
  const { isNewSessionModalOpen, closeNewSessionModal } = useModalStore();
  const { addSession } = useSessionStore();

  const [title, setTitle] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    try {
      const created = await createSession(title.trim());

      addSession(created);
      toast.success(`Created ${created.title}`);
      closeNewSessionModal();
      setTitle("");
      navigateToSession(created.id);
    } catch (err) {
      console.error("Failed to create session:", err);
      toast.error("Failed to create new agent session");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      open={isNewSessionModalOpen}
      onClose={closeNewSessionModal}
      title="Create New Agent Session"
      headless
      className="max-h-none! w-auto! max-w-none! border-0! bg-transparent! p-0!"
    >
      <div className="fixed inset-0 z-50 bg-foreground/40 flex items-center justify-center p-4">
        <div className="bg-card rounded-none max-w-md w-full overflow-hidden border border-border animate-in fade-in zoom-in-95 duration-150">
          <div className="p-5 border-b border-border flex items-center justify-between bg-muted">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-none bg-success-tint text-success flex items-center justify-center">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  Create New Agent Session
                </h3>
                <p className="text-xs text-muted-foreground">
                  Allocates a dedicated marketing agent workspace
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={closeNewSessionModal}
              className="p-1.5 rounded-none text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Agent Name / Role Title
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Video Director, Media Buyer, Ad Copywriter"
                className="w-full px-3.5 py-2 border border-input rounded-none text-xs text-foreground focus:outline-hidden focus:border-success focus:ring-1 focus:ring-success"
                data-modal-autofocus
                autoFocus
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={closeNewSessionModal}
                className="px-4 py-2 border border-input text-foreground text-xs font-medium rounded-none hover:bg-muted transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !title.trim()}
                className="px-4 py-2 bg-brand-surface text-primary-foreground text-xs font-semibold rounded-none hover:bg-brand-hover transition-colors cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? "Creating..." : "Create Agent"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Modal>
  );
}
