"use client";

// The token receipt: every order in this chat, line by line, and the total.

import { fmtUsd } from "@/lib/brigade/client";
import type { ServiceState, Usage } from "@/lib/brigade/schemas";

export function ReceiptList({ services }: { services: ServiceState[] }) {
  const total = services.reduce((acc, s) => add(acc, s.bill), zero());
  return (
    <div className="font-mono text-[12px]">
      {services.length === 0 && <p className="text-muted">Nothing on the tab yet.</p>}
      {services.map((s, i) => (
        <div key={s.id} className={i > 0 ? "mt-3 border-t border-dashed border-line pt-2" : ""}>
          <div className="mb-1 font-bold">Course {i + 1}</div>
          {s.plannerUsage && <Row label="Head chef" u={s.plannerUsage} />}
          {s.stations
            .filter((st) => st.usage)
            .map((st) => (
              <Row key={st.id} label={st.title} u={st.usage!} />
            ))}
          {s.platingUsage && <Row label="Expediter" u={s.platingUsage} />}
        </div>
      ))}
      <div className="my-2 border-t border-dashed border-line" />
      <div className="flex justify-between text-muted">
        <span>Tokens</span>
        <span>{(total.inputTokens + total.outputTokens).toLocaleString()}</span>
      </div>
      <div className="mt-1 flex justify-between text-[13px] font-bold">
        <span>Total</span>
        <span>{fmtUsd(total.costUsd)}</span>
      </div>
    </div>
  );
}

function Row({ label, u }: { label: string; u: Usage }) {
  return (
    <div className="flex items-baseline gap-2 py-0.5">
      <span className="min-w-0 flex-1 truncate" title={label}>
        {label}
      </span>
      <span className="shrink-0 text-muted">{(u.inputTokens + u.outputTokens).toLocaleString()}</span>
      <span className="w-16 shrink-0 text-right">{fmtUsd(u.costUsd)}</span>
    </div>
  );
}

const zero = (): Usage => ({ inputTokens: 0, outputTokens: 0, costUsd: 0 });
export const add = (a: Usage, b: Usage): Usage => ({ inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens, costUsd: a.costUsd + b.costUsd });
