"use client";

// The app: the pixel kitchen on the left, the chat on the right. Type an order
// and press Enter; click a chef to talk to them; click the head chef for settings.

import { useEffect, useMemo, useState } from "react";

import { fmtUsd, placeOrder, stationAction, useClock, useKeys, useService } from "@/lib/brigade/client";
import { DEFAULT_BUDGET, DEFAULT_HEAD_CHEF, DEFAULT_SHIFT, MODELS } from "@/lib/brigade/models";

import { Bill } from "./Bill";
import { ChatPanel } from "./ChatPanel";
import { ChefCard } from "./ChefCard";
import { HeadChefCard } from "./HeadChefCard";
import { KeysDialog } from "./KeysDialog";
import { NeedsYou } from "./NeedsYou";
import { PixelKitchen } from "./PixelKitchen";

const PALETTE = ["#F4A261", "#E76F51", "#8E7DBE", "#2A9D8F", "#E9C46A", "#F28482", "#4D96FF", "#F5F5F5", "#6C757D"];

export function Kitchen() {
  const keys = useKeys();
  const hasKeys = !!(keys.anthropic || keys.openai);
  const [showKeys, setShowKeys] = useState(false);
  const [headChef, setHeadChef] = useState(DEFAULT_HEAD_CHEF);
  const [totalBudget, setTotalBudget] = useState(DEFAULT_BUDGET);
  const [offShift, setOffShift] = useState<string[]>(() => MODELS.map((m) => m.id).filter((id) => !DEFAULT_SHIFT.includes(id)));
  // The chat's width; drag the divider to change it, and the kitchen refills the rest.
  const [chatWidth, setChatWidth] = useState(560);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => setChatWidth(Math.min(window.innerWidth * 0.7, Math.max(320, window.innerWidth - e.clientX)));
    const up = () => setDragging(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragging]);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [ordering, setOrdering] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);

  // "head", "expo", a station id, or nothing.
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [nicknames, setNicknames] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string[]>([]);
  const [confirmStop, setConfirmStop] = useState<string | null>(null);

  const state = useService(serviceId);
  const stations = useMemo(() => state?.stations ?? [], [state]);
  const now = useClock(stations.some((s) => s.status === "cooking"));
  const picked = stations.find((s) => s.id === pickedId) ?? null;

  const order = async (task: string) => {
    setOrdering(true);
    setOrderError(null);
    setPickedId(null);
    setExpanded([]);
    try {
      const models = MODELS.map((m) => m.id).filter((m) => !offShift.includes(m));
      setServiceId(await placeOrder({ task, totalBudget, headChef, models, keys }));
    } catch (e) {
      setOrderError(e instanceof Error ? e.message : String(e));
    } finally {
      setOrdering(false);
    }
  };

  const send = (text: string) => {
    if (picked && serviceId) {
      void stationAction(serviceId, { stationId: picked.id, action: "rerun", instruction: text }).catch((e) => setOrderError(e instanceof Error ? e.message : String(e)));
      return;
    }
    if (!hasKeys) {
      setPickedId("head");
      setOrderError("Add your API keys first: click the head chef.");
      return;
    }
    void order(text);
  };

  const context = (() => {
    if (pickedId === "head") {
      return (
        <HeadChefCard
          headChef={headChef}
          onHeadChef={setHeadChef}
          totalBudget={totalBudget}
          onTotalBudget={setTotalBudget}
          offShift={offShift}
          onOffShift={setOffShift}
          keys={keys}
          onKeys={() => setShowKeys(true)}
          onClose={() => setPickedId(null)}
        />
      );
    }
    if (pickedId === "expo" && state) {
      return (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-bold">The pass</span>
            <button className="tbtn tbtn-plain" onClick={() => setPickedId(null)}>
              ✕
            </button>
          </div>
          <NeedsYou state={state} onSendBack={(id) => setPickedId(id)} onReplate={() => void stationAction(state.id, { action: "replate" }).catch(() => {})} />
          {!state.plating && state.status !== "plating" && state.status !== "failed" && <p className="text-xs text-muted">Dishes land here as the expediter plates them.</p>}
        </div>
      );
    }
    if (picked && state && serviceId) {
      return (
        <ChefCard
          key={picked.id}
          serviceId={serviceId}
          station={picked}
          color={PALETTE[stations.findIndex((s) => s.id === picked.id) % PALETTE.length]}
          nickname={nicknames[picked.id]}
          now={now}
          hireable={state.hireable}
          maxBudget={Math.max(1, ...stations.map((x) => x.token_budget))}
          picked={false}
          expanded={expanded.includes(picked.id)}
          confirmingStop={confirmStop === picked.id}
          onRename={(name) => setNicknames((n) => ({ ...n, [picked.id]: name }))}
          onToggleExpand={() => setExpanded((e) => (e.includes(picked.id) ? e.filter((x) => x !== picked.id) : [...e, picked.id]))}
          onConfirmStop={(on) => setConfirmStop(on ? picked.id : null)}
          onHide={() => setPickedId(null)}
          onPick={() => {}}
        />
      );
    }
    return undefined;
  })();

  return (
    <div className="flex h-dvh flex-col">
      {/* Fixed height: the pane below must not change size when the bill appears. */}
      <header className="flex h-10 shrink-0 items-center gap-3 border-b border-line px-3 text-[13px]">
        <span className="font-bold">cookinUp</span>
        <span className="flex-1" />
        {state && (
          <span className="text-xs text-muted">
            {stations.filter((s) => s.status === "cooking").length} cooking · {stations.filter((s) => s.status === "done").length} ready · {fmtUsd(state.bill.costUsd)}
          </span>
        )}
        {state && <Bill state={state} />}
        {!hasKeys && (
          <button className="tbtn tbtn-primary" onClick={() => setShowKeys(true)}>
            🔑 Add API keys
          </button>
        )}
      </header>

      <main className={`flex min-h-0 flex-1 ${dragging ? "select-none" : ""}`}>
        <section className="min-w-0 flex-1">
          <PixelKitchen key={serviceId ?? "empty"} state={state} pickedId={pickedId} onPick={setPickedId} />
        </section>
        <div
          role="separator"
          aria-orientation="vertical"
          title="Drag to resize"
          onPointerDown={() => setDragging(true)}
          className={`relative z-10 w-2.5 shrink-0 cursor-col-resize border-l border-line hover:bg-amber/40 ${dragging ? "bg-amber/60" : ""}`}
        />
        <ChatPanel
          width={chatWidth}
          state={state}
          context={context}
          target={picked ? { id: picked.id, name: nicknames[picked.id] || picked.title } : null}
          onClearTarget={() => setPickedId(null)}
          onSend={send}
          onPick={(id) => setPickedId(id)}
          onReplate={() => state && void stationAction(state.id, { action: "replate" }).catch(() => {})}
          busy={ordering}
          hint={hasKeys ? "Type an order and press Enter. Click the head chef to change who runs the pass, the pantry, or who is on shift." : "Click the head chef (or the 🔑 button) to add your API keys first."}
        />
      </main>
      {orderError && (
        <div className="fixed bottom-3 left-3 z-20 rounded-lg border border-ember bg-background px-3 py-2 text-xs text-ember shadow-xl" onClick={() => setOrderError(null)}>
          {orderError}
        </div>
      )}
      {showKeys && <KeysDialog keys={keys} onClose={() => setShowKeys(false)} />}
    </div>
  );
}
