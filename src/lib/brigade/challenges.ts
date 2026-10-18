// The recipe book: five short challenges, each a task with a constraint that
// can only be met by using one of the kitchen's controls. A challenge is
// checked against the latest order in its chat; passing it earns a badge.

import { coach } from "./coach";
import { costUsd, tierOf } from "./models";
import type { ServiceState, Usage } from "./schemas";

export type Verdict = { pass: boolean; line: string };

export type Challenge = {
  id: string;
  n: number;
  name: string;
  task: string;
  /** The rule, in a few words. */
  rule: string;
  teaches: string;
  hint: string;
  /** Stop after the menu so the player can edit it before cooking. */
  review: boolean;
  /** A note to the head chef on the first order (challenge 4's deliberately vague brief). */
  twist?: string;
  /** For a judged challenge: what a 5/5 looks like. */
  rubric?: string;
  /** A short live line while the order is in progress. */
  progress: (s: ServiceState) => string;
  /** Once served: did it pass, and why (not). Gets the judge's score when there is a rubric. */
  verdict: (s: ServiceState, grade?: { score: number; reason: string }) => Verdict;
};


/** What the same order would have cost with every call on Opus: same tokens, the top price. */
export function opusBaseline(s: ServiceState): number {
  const parts: (Usage | undefined)[] = [s.plannerUsage, s.platingUsage, ...s.stations.map((st) => st.usage)];
  return parts.reduce((n, u) => n + (u ? costUsd("claude-opus-5", u.inputTokens, u.outputTokens) : 0), 0);
}

/** Has a heading (or bold line) mentioning any of the words. */
function hasSection(md: string, words: RegExp): boolean {
  return md.split("\n").some((l) => /^\s*(#{1,6}\s|\*\*)/.test(l) && words.test(l));
}


export const CHALLENGES: Challenge[] = [
  {
    id: "mise",
    n: 1,
    name: "First order",
    task: "Write a product description for a reusable water bottle.",
    rule: "Send any order and let it finish",
    teaches: "How the kitchen works",
    hint: "Fire it, then watch the notes at the bottom while the chefs cook.",
    review: false,
    progress: (s) => (s.status === "planning" ? "The head chef is writing the menu…" : `${s.stations.filter((x) => x.status === "done").length} of ${s.stations.length} jobs done`),
    verdict: () => ({ pass: true, line: "Served! You just ran a whole kitchen." }),
  },
  {
    id: "power",
    n: 2,
    name: "Power prompt",
    task: "write a birthday message",
    rule: "Get the prompt meter to 4/4, then fire",
    teaches: "Writing a clear order",
    hint: "Add who it's for, a detail or two (a name, something they love) and a shape (3 sentences, a short poem).",
    review: false,
    progress: (s) => `Prompt meter: ${coach(s.task).score}/4`,
    verdict: (s) => {
      const c = coach(s.task);
      return c.score === 4 ? { pass: true, line: "4/4: clear, detailed, with a shape and a reader." } : { pass: false, line: `${c.score}/4. ${c.tip ?? ""}` };
    },
  },
  {
    id: "fewer",
    n: 3,
    name: "Fewer cooks",
    task: "Plan a 2-day Seattle trip with food and a budget.",
    rule: "Cook it with 3 chefs or fewer",
    teaches: "Big jobs, small jobs",
    hint: "On the menu, merge jobs that go together, or delete ones you don't need.",
    review: true,
    progress: (s) => `Menu: ${s.stations.length} chef${s.stations.length === 1 ? "" : "s"} (need 3 or fewer)`,
    verdict: (s) => (s.stations.length <= 3 ? { pass: true, line: `Done with ${s.stations.length} chef${s.stations.length === 1 ? "" : "s"}.` } : { pass: false, line: `${s.stations.length} chefs. Merge or delete jobs on the menu.` }),
  },
  {
    id: "sendback",
    n: 4,
    name: "Send it back",
    task: "Write a README for a CLI todo app.",
    rule: "The README needs Install, Usage and Example parts",
    teaches: "Fixing with a clear note",
    hint: "The first try is vague on purpose. Click the README chef and say exactly which parts to add.",
    review: false,
    twist: "Keep it brief: ask for a single short overview paragraph, with no sections, headings or code.",
    progress: (s) => (s.status === "served" ? "Checking the parts…" : "Cooking…"),
    verdict: (s) => {
      const md = s.plating?.final ?? "";
      const got = { Install: hasSection(md, /install|setup|getting started/i), Usage: hasSection(md, /usage|how to use|commands/i), Example: hasSection(md, /example/i) };
      const missing = Object.entries(got).filter(([, v]) => !v).map(([k]) => k);
      return missing.length === 0 ? { pass: true, line: "Install, Usage and Example are all there." } : { pass: false, line: `Missing: ${missing.join(", ")}. Send the README chef a clear note.` };
    },
  },
  {
    id: "routing",
    n: 5,
    name: "Right helper, right job",
    task: "Build a landing page: copy, colour palette, and HTML.",
    rule: "Score 4/5 or more, with strong helpers only where needed",
    teaches: "Picking helpers",
    hint: "On the menu, give the HTML job a strong helper (★★★) and the words and colours quick helpers (★).",
    review: true,
    rubric: "A complete landing page: persuasive copy, a named colour palette with hex codes, and a single valid HTML document that uses that copy and palette. 5 = polished and all three fit together; 3 = present but generic or inconsistent; 1 = missing parts.",
    progress: (s) => {
      const strong = s.stations.filter((x) => tierOf(x.model) === 3).length;
      return `${s.stations.length - strong} quick or solid helper${s.stations.length - strong === 1 ? "" : "s"}, ${strong} strong`;
    },
    verdict: (s, grade) => {
      const base = opusBaseline(s);
      const thrifty = base > 0 && s.bill.costUsd / base <= 0.6;
      if (!grade) return { pass: false, line: "Tasting the dish…" };
      const ok = grade.score >= 4 && thrifty;
      return { pass: ok, line: `Score ${grade.score}/5. ${ok ? "Strong helper where it counts, quick ones elsewhere." : grade.score < 4 ? grade.reason : "Too many strong helpers: use quick ones for the easy jobs."}` };
    },
  },
];

export const challengeById = (id?: string) => CHALLENGES.find((c) => c.id === id);
