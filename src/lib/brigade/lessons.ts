// The kitchen lessons: one per kind of thing worth explaining. The service
// writes a run-specific line for each event (`KitchenEvent` with kind
// "explain"); these are the general ideas behind them, unlocked in the game
// the first time each one happens in front of you.

export type Topic = "split" | "dependency" | "hiring" | "tokens" | "context" | "model" | "rerun" | "conflict" | "bill";

export type Lesson = { title: string; color: string; idea: string; hint: string };

export const LESSONS: Record<Topic, Lesson> = {
  split: {
    title: "Splitting the order",
    color: "#e9a23b",
    idea: "Independent stations cook at the same time, so the order finishes sooner.",
    hint: "Place any order and watch the head chef write the menu.",
  },
  dependency: {
    title: "Dependencies",
    color: "#4d6fb3",
    idea: "A station that needs another's output waits; the longest chain sets the pace.",
    hint: "Order something with steps that build on each other.",
  },
  hiring: {
    title: "Picking the chef",
    color: "#8e7dbe",
    idea: "Small models are fast and cheap; big ones reason better but cost more per token.",
    hint: "Watch a station start cooking.",
  },
  tokens: {
    title: "Input and output tokens",
    color: "#2a9d8f",
    idea: "Input is what a chef reads, output is what it writes; you pay for both.",
    hint: "Wait for a station to finish.",
  },
  context: {
    title: "Context weight",
    color: "#c0783a",
    idea: "If a chef reads far more than it writes, trim what you hand it.",
    hint: "Spot a station that reads much more than it writes.",
  },
  model: {
    title: "Changing models",
    color: "#d9467a",
    idea: "Swapping a model trades cost and speed for quality.",
    hint: "Click a chef and switch their model.",
  },
  rerun: {
    title: "Re-firing",
    color: "#e76f51",
    idea: "Change one station and everything built on it cooks again.",
    hint: "Send a chef a correction.",
  },
  conflict: {
    title: "Conflicts",
    color: "#b23a48",
    idea: "Parallel stations can assume different things; agree on shared facts up front.",
    hint: "Watch for a dish the expediter sends back.",
  },
  bill: {
    title: "Reading the bill",
    color: "#3d8b5a",
    idea: "The station that writes the most, or uses the priciest model, costs the most.",
    hint: "Finish an order.",
  },
};

export const TOPICS = Object.keys(LESSONS) as Topic[];
