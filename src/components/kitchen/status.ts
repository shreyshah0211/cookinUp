import type { StationStatus } from "@/lib/brigade/schemas";

export const STATUS_LABEL: Record<StationStatus, string> = {
  idle: "Mise en place",
  waiting: "Waiting for prep",
  cooking: "Cooking",
  done: "Dish ready",
  burnt: "Burnt",
};

export const STATUS_COLOR: Record<StationStatus, string> = {
  idle: "#9ca3af",
  waiting: "#8e7dbe",
  cooking: "#d97706",
  done: "#2a9d8f",
  burnt: "#e76f51",
};
