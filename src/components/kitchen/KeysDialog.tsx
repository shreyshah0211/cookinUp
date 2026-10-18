"use client";

import { useState } from "react";

import { saveKeys, type StoredKeys } from "@/lib/brigade/client";

// Bring your own keys. They stay in this browser and are sent only when an order is placed.
export function KeysDialog({ keys, onClose }: { keys: StoredKeys; onClose: () => void }) {
  const [draft, setDraft] = useState(keys);
  return (
    <div className="flex flex-col gap-3 text-[13px]">
      <p className="text-xs text-muted">
        API keys are billed per use by each provider (a ChatGPT Plus or Claude Pro subscription does not work here). They are kept in this browser&apos;s local storage, sent to the kitchen only when you
        place an order, and never logged or stored on the server.
      </p>
      <label className="flex flex-col gap-1 text-xs">
        Anthropic key
        <input type="password" value={draft.anthropic} onChange={(e) => setDraft({ ...draft, anthropic: e.target.value })} placeholder="sk-ant-…" className="tinput" />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        OpenAI key
        <input type="password" value={draft.openai} onChange={(e) => setDraft({ ...draft, openai: e.target.value })} placeholder="sk-…" className="tinput" />
      </label>
      <div className="flex justify-end gap-2">
        <button className="pix-btn pix-btn-plain" onClick={onClose}>
          Cancel
        </button>
        <button
          className="pix-btn"
          onClick={() => {
            saveKeys(draft);
            onClose();
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}
