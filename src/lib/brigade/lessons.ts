// The lessons: how to ask well, and how the kitchen works, in plain words.
// The first four unlock when your own order does that thing (see coach.ts);
// the rest unlock when it happens in the kitchen (the service sends an
// "explain" event with that topic).

export type Topic = "what" | "details" | "shape" | "who" | "split" | "wait" | "fix" | "helper" | "agree";

export type Lesson = {
  title: string;
  color: string;
  /** One plain sentence. */
  idea: string;
  /** "Instead of … try …" */
  instead: string;
  better: string;
  /** How to unlock it. */
  hint: string;
};

export const LESSONS: Record<Topic, Lesson> = {
  what: {
    title: "Say what you want",
    color: "#e9a23b",
    idea: "Start with an action word, so the chefs know the job.",
    instead: "dogs",
    better: "Write a fun fact about dogs",
    hint: "Start an order with a word like write, make, list or plan.",
  },
  details: {
    title: "Add the details",
    color: "#2a9d8f",
    idea: "A few details stop the chefs from guessing.",
    instead: "Write a story",
    better: "Write a story about a cat who becomes a pilot",
    hint: "Give your order a topic and a detail or two.",
  },
  shape: {
    title: "Pick the shape",
    color: "#8e7dbe",
    idea: "Say how it should look: a list, 3 sentences, a poem, a table.",
    instead: "Tell me about volcanoes",
    better: "Tell me about volcanoes in 5 bullet points",
    hint: "Ask for a shape, like a list or 3 sentences.",
  },
  who: {
    title: "Say who it's for",
    color: "#4d6fb3",
    idea: "Saying who will read it changes the words the chefs pick.",
    instead: "Explain gravity",
    better: "Explain gravity for a 10-year-old",
    hint: "Say who it's for, like 'for my class' or 'for kids'.",
  },
  split: {
    title: "Big jobs, small jobs",
    color: "#e76f51",
    idea: "The head chef cuts a big order into small jobs that can happen at the same time.",
    instead: "One chef doing everything",
    better: "Three chefs, one job each",
    hint: "Send any order and watch the menu.",
  },
  wait: {
    title: "Some jobs wait",
    color: "#c0783a",
    idea: "A job that needs another job's work has to wait for it.",
    instead: "Writing a title before the story",
    better: "Story first, then the title",
    hint: "Ask for something that builds on another part.",
  },
  fix: {
    title: "Fix it with a clear note",
    color: "#d9467a",
    idea: "Tell a chef exactly what to change. Jobs that used its work redo too.",
    instead: "redo it",
    better: "Make it shorter and add a joke at the end",
    hint: "Click a chef and send a note that says what to change.",
  },
  helper: {
    title: "The right helper",
    color: "#3d8b5a",
    idea: "Quick helpers (★) suit easy jobs; strong helpers (★★★) suit hard ones.",
    instead: "The strongest helper for a list",
    better: "A quick helper for the list, a strong one for the code",
    hint: "Click a chef and change their helper.",
  },
  agree: {
    title: "Say it once, up front",
    color: "#b23a48",
    idea: "If two chefs guess differently, the dish comes back. Put shared facts in your order.",
    instead: "Plan a trip",
    better: "Plan a 2-day trip for 2 people with $200",
    hint: "Happens when chefs disagree.",
  },
};

export const TOPICS = Object.keys(LESSONS) as Topic[];

/** The lesson for a topic, or nothing for topics from older versions. */
export const lessonOf = (t?: string): Lesson | undefined => (t && t in LESSONS ? LESSONS[t as Topic] : undefined);
