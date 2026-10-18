import { houseBudgetUsd, houseMaxTokens, houseProviders, houseSpentUsd } from "@/lib/brigade/house";

// What the kitchen offers visitors who bring no keys: which providers the
// house can cook with, and how much of today's shared budget is left. Never
// the keys themselves.
export async function GET() {
  const budget = houseBudgetUsd();
  return Response.json(
    { providers: houseProviders(), remainingUsd: Math.max(0, budget - houseSpentUsd()), budgetUsd: budget, maxTokens: houseMaxTokens() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
