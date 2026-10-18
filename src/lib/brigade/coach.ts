// The prompt coach: quick checks on an order (and on a note to a chef) with
// one friendly tip. Plain pattern matching, so it is instant and free.

import type { Topic } from "./lessons";

export type Check = { key: Extract<Topic, "what" | "details" | "shape" | "who">; label: string; ok: boolean; tip: string };
export type Coaching = { checks: Check[]; score: number; tip: string | null; words: number };

const ACTION = /\b(write|make|create|list|plan|explain|summari[sz]e|describe|give|build|design|draw|tell|compare|translate|suggest|find|help|teach|show|turn|rewrite|name|pick|invent|brainstorm|outline)\b/i;
const SHAPE =
  /\b(list|bullets?|bullet points?|table|steps?|paragraphs?|sentences?|words|poem|haiku|rhyme|email|letter|story|outline|title|headline|slogan|recipe|quiz|questions|chart|code|html|readme|one[- ]line|short|long|\d+\s*(lines?|points?|tips?|ideas?|words|sentences?|items?|facts?|examples?))\b/i;
const WHO =
  /\b(for (my|a|an|the|our|your)?\s*(kids?|children|students?|class|classmates|teacher|beginners?|friends?|family|mom|dad|grandma|grandpa|brother|sister|parents?|team|boss|customers?|readers?|audience|teens?|kindergarten)|for \d+[- ]?year[- ]olds?|\d+[- ]?year[- ]olds?|kid[- ]friendly|for beginners|to my \w+)\b/i;

export function coach(text: string): Coaching {
  const t = text.trim();
  const words = t ? t.split(/\s+/).length : 0;
  const checks: Check[] = [
    { key: "what", label: "What", ok: ACTION.test(t), tip: "Start with an action word: “Write…”, “Make…”, “List…”." },
    { key: "details", label: "Details", ok: words >= 8, tip: "Add a detail or two: a topic, a name, a number." },
    { key: "shape", label: "Shape", ok: SHAPE.test(t), tip: "Say the shape: “in 5 bullet points”, “3 sentences”, “a short poem”." },
    { key: "who", label: "Who for", ok: WHO.test(t), tip: "Say who it's for: “for my class”, “for a 10-year-old”." },
  ];
  const score = checks.filter((c) => c.ok).length;
  const missing = checks.find((c) => !c.ok);
  const tip = !t ? null : words > 90 ? "That's a lot! Keep only what matters: short and clear works best." : missing ? missing.tip : "Great order! Clear, detailed, with a shape and a reader.";
  return { checks, score, tip, words };
}

const VAGUE = /^(redo|again|retry|fix( it)?|better|do it again|redo (it|this)|make it better|try again|no|wrong|change it)[.!]*$/i;

/** Is a note to a chef specific enough to act on? */
export function coachNote(text: string): { ok: boolean; tip: string } | null {
  const t = text.trim();
  if (!t) return null;
  const words = t.split(/\s+/).length;
  if (VAGUE.test(t) || words < 4) return { ok: false, tip: "Say exactly what to change, like “make it shorter and add an example”." };
  return { ok: true, tip: "Clear note: the chef knows what to change." };
}
