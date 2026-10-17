// Cook one order from the terminal, no UI. Keys come from .env.local.
//   npm run cook -- "Build a landing page for a bakery"

import { DEFAULT_HEAD_CHEF } from "../src/lib/brigade/models";
import type { ServiceState } from "../src/lib/brigade/schemas";
import { KitchenService } from "../src/lib/brigade/service";

const task = process.argv.slice(2).join(" ") || "Write a short product description and three taglines for a reusable coffee cup.";
const budget = Number(process.env.TOTAL_BUDGET ?? 6000);

const service = new KitchenService({ id: "cli", task, keys: {}, headChef: process.env.HEAD_CHEF ?? DEFAULT_HEAD_CHEF, totalBudget: budget });

let lastLine = "";
service.subscribe((s: ServiceState) => {
  const line = `[${s.status}] ` + s.stations.map((st) => `${st.id}:${st.status}`).join("  ");
  if (line !== lastLine) {
    console.log(line);
    lastLine = line;
  }
});

console.log(`Order in: ${task}\nHead chef: ${service.state.headChef}, budget ${budget} tokens\n`);
const final = await service.start();

console.log("\n=== MENU ===");
for (const s of final.stations) {
  console.log(`- ${s.id} (${s.model}, ${s.token_budget} tok) deps=[${s.depends_on.join(",")}] -> ${s.status}${s.error ? `: ${s.error}` : ""}`);
  if (s.output) console.log(`    ${s.output.summary}`);
}
if (final.plating) {
  console.log("\n=== FINAL DISH ===\n" + final.plating.final);
  console.log("\n=== CONFLICTS ===");
  console.log(final.plating.conflicts.length ? final.plating.conflicts.map((c) => `- [${c.station_ids.join(", ")}] ${c.problem}`).join("\n") : "none");
}
if (final.error) console.log("\nKITCHEN FAILED: " + final.error);
console.log("\n=== BILL ===");
for (const s of final.stations) if (s.usage) console.log(`${s.id.padEnd(16)} ${s.model.padEnd(16)} in ${s.usage.inputTokens} out ${s.usage.outputTokens}  $${s.usage.costUsd.toFixed(4)}`);
if (final.plannerUsage) console.log(`${"head chef".padEnd(16)} ${final.headChef.padEnd(16)} in ${final.plannerUsage.inputTokens} out ${final.plannerUsage.outputTokens}  $${final.plannerUsage.costUsd.toFixed(4)}`);
if (final.platingUsage) console.log(`${"expediter".padEnd(16)} ${final.headChef.padEnd(16)} in ${final.platingUsage.inputTokens} out ${final.platingUsage.outputTokens}  $${final.platingUsage.costUsd.toFixed(4)}`);
console.log(`TOTAL in ${final.bill.inputTokens} out ${final.bill.outputTokens}  $${final.bill.costUsd.toFixed(4)}`);
