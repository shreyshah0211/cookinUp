// The recipe book: five short challenges, each a task with a constraint that
// can only be met by using one of the kitchen's controls. A challenge is
// checked against the latest order in its chat; passing it earns a badge.

import { costUsd } from "./models";
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

const num = (n: number) => n.toLocaleString("en-US");
const stationTokens = (s: ServiceState) => s.stations.reduce((n, st) => n + (st.usage ? st.usage.inputTokens + st.usage.outputTokens : 0), 0);

/** What the same order would have cost with every call on Opus: same tokens, the top price. */
export function opusBaseline(s: ServiceState): number {
  const parts: (Usage | undefined)[] = [s.plannerUsage, s.platingUsage, ...s.stations.map((st) => st.usage)];
  return parts.reduce((n, u) => n + (u ? costUsd("claude-opus-5", u.inputTokens, u.outputTokens) : 0), 0);
}

/** Has a heading (or bold line) mentioning any of the words. */
function hasSection(md: string, words: RegExp): boolean {
  return md.split("\n").some((l) => /^\s*(#{1,6}\s|\*\*)/.test(l) && words.test(l));
}

const ARTICLE = `Rooftop gardens are quietly changing how cities eat. Across older neighbourhoods, flat roofs that once held nothing but gravel and air-conditioning units now carry raised beds, beehives and rows of tomatoes. The movement began with a handful of restaurants that wanted fresher herbs than their suppliers could deliver, and it has since spread to schools, apartment blocks and even hospitals.

The appeal is partly practical. A planted roof absorbs rainwater that would otherwise rush into storm drains, which reduces flooding during heavy downpours. The soil and plants also insulate the building below, keeping it cooler in summer and warmer in winter. Several building managers report heating and cooling savings of ten to fifteen percent after converting their roofs, although the figure depends heavily on climate and on how deep the soil is.

There are social benefits too. Community rooftop plots give residents in dense housing a place to meet, and schools use them to teach biology and nutrition in a way textbooks cannot. Children who grow vegetables are measurably more willing to eat them, according to a number of small studies, and teachers say the gardens make abstract topics like photosynthesis and pollination concrete.

The obstacles are real, however. Not every roof can carry the weight of wet soil, and a structural survey is the first and often most expensive step. Waterproofing must be checked or replaced, and access for people, tools and compost has to meet safety rules. Wind is a constant problem at height: it dries out plants quickly and can damage tall crops. Many projects fail in their second year, when the volunteers who started them move on and nobody has been trained to take over watering and maintenance.

Costs vary widely. A simple container garden can be set up for a few thousand dollars, while a full green roof with irrigation, drainage layers and railings can run to several hundred thousand. Some cities now offer grants or tax breaks to offset the expense, arguing that the public saves money on storm-water infrastructure and gains cooler streets.

Experts who have watched the trend for a decade offer consistent advice. Start small, with containers rather than a full planted roof. Choose hardy, low-water crops such as herbs, leafy greens and strawberries before attempting fruit trees. Put a named person in charge of maintenance and budget for paid help if volunteers cannot commit. Above all, work with the building's owner and insurer from the beginning, because a garden that is not allowed to stay will not last.

Done well, a rooftop garden repays the effort many times over: in food, in lower bills, in cooler air and in the simple pleasure of green space above a grey street.`;

export const CHALLENGES: Challenge[] = [
  {
    id: "mise",
    n: 1,
    name: "Mise en place",
    task: "Write a product description for a reusable water bottle.",
    rule: "Finish any run",
    teaches: "Watching the kitchen",
    hint: "Just fire it and read the kitchen notes at the bottom as it cooks.",
    review: false,
    progress: (s) => (s.status === "planning" ? "The head chef is writing the menu…" : `${s.stations.filter((x) => x.status === "done").length}/${s.stations.length} stations done`),
    verdict: () => ({ pass: true, line: "Order served. Every line in the notes told you why something happened." }),
  },
  {
    id: "budget",
    n: 2,
    name: "Tight budget",
    task: `Summarise this article into exactly 3 bullet points.\n\n${ARTICLE}`,
    rule: "Stations use ≤ 2,000 tokens in total",
    teaches: "Tokens and model choice",
    hint: "Every station reads the whole article (~650 tokens). On the menu, delete or merge stations, keep one cheap chef, and lower its budget.",
    review: true,
    progress: (s) => (s.status === "review" ? `${s.stations.length} station${s.stations.length === 1 ? "" : "s"} would each read the article` : `Station tokens: ${num(stationTokens(s))} / 2,000`),
    verdict: (s) => {
      const t = stationTokens(s);
      return t <= 2000 ? { pass: true, line: `${num(t)} station tokens: under budget.` } : { pass: false, line: `${num(t)} station tokens, over by ${num(t - 2000)}. Fewer stations and smaller budgets.` };
    },
  },
  {
    id: "fewer",
    n: 3,
    name: "Fewer cooks",
    task: "Plan a 2-day Seattle trip with food and a budget.",
    rule: "Cook with 3 stations or fewer",
    teaches: "Splitting the order",
    hint: "On the menu, merge stations that do related work (e.g. food into each day) or delete ones you don't need.",
    review: true,
    progress: (s) => `Menu: ${s.stations.length} station${s.stations.length === 1 ? "" : "s"} (need ≤ 3)`,
    verdict: (s) => (s.stations.length <= 3 ? { pass: true, line: `Cooked with ${s.stations.length} station${s.stations.length === 1 ? "" : "s"}.` } : { pass: false, line: `${s.stations.length} stations. Merge or delete on the menu next time.` }),
  },
  {
    id: "sendback",
    n: 4,
    name: "Send it back",
    task: "Write a README for a CLI todo app.",
    rule: "README has Install, Usage and Example sections",
    teaches: "Retasking a chef",
    hint: "The first brief is vague on purpose. Click the README chef and tell them exactly which sections to add.",
    review: false,
    twist: "Keep it brief: ask for a single short overview paragraph, with no sections, headings or code.",
    progress: (s) => (s.status === "served" ? "Served: checking sections…" : "Cooking…"),
    verdict: (s) => {
      const md = s.plating?.final ?? "";
      const got = { Install: hasSection(md, /install|setup|getting started/i), Usage: hasSection(md, /usage|how to use|commands/i), Example: hasSection(md, /example/i) };
      const missing = Object.entries(got).filter(([, v]) => !v).map(([k]) => k);
      return missing.length === 0 ? { pass: true, line: "Install, Usage and Example are all there." } : { pass: false, line: `Missing: ${missing.join(", ")}. Send the README chef a specific note.` };
    },
  },
  {
    id: "routing",
    n: 5,
    name: "Right chef, right station",
    task: "Build a landing page: copy, colour palette, and HTML.",
    rule: "Quality ≥ 4/5 and cost ≤ 60% of all-Opus",
    teaches: "Model routing",
    hint: "On the menu, put a strong chef only on the HTML station and Commis chefs on copy and palette.",
    review: true,
    rubric: "A complete landing page: persuasive copy, a named colour palette with hex codes, and a single valid HTML document that uses that copy and palette. 5 = polished and all three fit together; 3 = present but generic or inconsistent; 1 = missing parts.",
    progress: (s) => {
      const base = opusBaseline(s);
      return base > 0 ? `Cost so far: ${Math.round((s.bill.costUsd / base) * 100)}% of all-Opus` : "Route your chefs on the menu";
    },
    verdict: (s, grade) => {
      const base = opusBaseline(s);
      const pct = base > 0 ? Math.round((s.bill.costUsd / base) * 100) : 100;
      if (!grade) return { pass: false, line: `Cost ${pct}% of all-Opus. Judging quality…` };
      const ok = grade.score >= 4 && pct <= 60;
      return { pass: ok, line: `Quality ${grade.score}/5 · cost ${pct}% of all-Opus. ${ok ? "Well routed." : grade.score < 4 ? grade.reason : "Too pricey: smaller chefs off the HTML."}` };
    },
  },
];

export const challengeById = (id?: string) => CHALLENGES.find((c) => c.id === id);
