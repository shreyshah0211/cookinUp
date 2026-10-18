"use client";

import { useState } from "react";

import { saveKeys, type House, type StoredKeys } from "@/lib/brigade/client";

// Bring your own keys. They stay in this browser and are sent only when an order is placed.
export function KeysDialog({ keys, house, onClose }: { keys: StoredKeys; house?: House | null; onClose: () => void }) {
  const [draft, setDraft] = useState(keys);
  return (
    <div className="flex flex-col gap-3 text-[13px]">
      <p className="text-xs text-muted">
        API keys are billed per use by each provider (a ChatGPT Plus, Claude Pro or Gemini app subscription does not work here). They are kept in this browser&apos;s local storage, sent to the kitchen only when you
        place an order, and never logged or stored on the server.
      </p>
      {house && house.providers.length > 0 && (
        <p className="border-2 border-line bg-paper px-2 py-1.5 text-xs">
          {house.remainingUsd > 0
            ? `No key? You can cook on this demo's shared keys: $${house.remainingUsd.toFixed(2)} of today's $${house.budgetUsd} left for everyone. Add your own key to use your account instead.`
            : "This demo's shared budget for today is used up. Add your own key to keep cooking."}
        </p>
      )}
      <label className="flex flex-col gap-1 text-xs">
        Anthropic key
        <input type="password" value={draft.anthropic} onChange={(e) => setDraft({ ...draft, anthropic: e.target.value })} placeholder="sk-ant-…" className="tinput" />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        OpenAI key
        <input type="password" value={draft.openai} onChange={(e) => setDraft({ ...draft, openai: e.target.value })} placeholder="sk-…" className="tinput" />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        Gemini key
        <input type="password" value={draft.google} onChange={(e) => setDraft({ ...draft, google: e.target.value })} placeholder="AIza…" className="tinput" />
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
