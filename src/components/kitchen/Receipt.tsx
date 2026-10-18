"use client";

// The token receipt: one button at the top of the chat; open it for the
// costs across every order in this conversation, line by line.

import { useEffect, useRef, useState } from "react";

import { fmtUsd } from "@/lib/brigade/client";
import type { ServiceState, Usage } from "@/lib/brigade/schemas";

export function Receipt({ services }: { services: ServiceState[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  const total = services.reduce((acc, s) => add(acc, s.bill), zero());
  return (
    <div ref={ref} className="relative">
      <button className="tbtn" onClick={() => setOpen((o) => !o)}>
        🧾 Token receipt
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 max-h-[70vh] w-[320px] overflow-y-auto rounded-lg border border-line bg-[#fffdf5] p-4 font-mono text-[12px] text-[#2b2520] shadow-2xl">
          {services.map((s, i) => (
            <div key={s.id} className={i > 0 ? "mt-3 border-t border-dashed border-[#c9b995] pt-2" : ""}>
              <div className="mb-1 font-bold">Order {i + 1}</div>
              {s.plannerUsage && <Row label="Head chef" u={s.plannerUsage} />}
              {s.stations.filter((st) => st.usage).map((st) => (
                <Row key={st.id} label={st.title} u={st.usage!} />
              ))}
              {s.platingUsage && <Row label="Expediter" u={s.platingUsage} />}
            </div>
          ))}
          <div className="my-2 border-t border-dashed border-[#c9b995]" />
          <div className="flex justify-between text-[#7a6f63]">
            <span>Tokens</span>
            <span>{(total.inputTokens + total.outputTokens).toLocaleString()}</span>
          </div>
          <div className="mt-1 flex justify-between text-[13px] font-bold">
            <span>Total</span>
            <span>{fmtUsd(total.costUsd)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, u }: { label: string; u: Usage }) {
  return (
    <div className="flex items-baseline gap-2 py-0.5">
      <span className="min-w-0 flex-1 truncate" title={label}>
        {label}
      </span>
      <span className="shrink-0 text-[#7a6f63]">{(u.inputTokens + u.outputTokens).toLocaleString()}</span>
      <span className="w-16 shrink-0 text-right">{fmtUsd(u.costUsd)}</span>
    </div>
  );
}

const zero = (): Usage => ({ inputTokens: 0, outputTokens: 0, costUsd: 0 });
const add = (a: Usage, b: Usage): Usage => ({ inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens, costUsd: a.costUsd + b.costUsd });
