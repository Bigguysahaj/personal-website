export type Theme = "light" | "dark";

/** Runs before paint (inlined in <head>) so the page never flashes the wrong theme. */
export const themeInitScript = `try{document.documentElement.dataset.theme=localStorage.getItem("theme")||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light")}catch(e){}`;

export const currentTheme = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

/** Lights off: a quick fade. Lights on: a fluorescent-tube flicker before it settles. */
export function setTheme(next: Theme, animate = true) {
  const root = document.documentElement;
  try {
    localStorage.setItem("theme", next);
  } catch {}
  if (next === "dark" || !animate) {
    root.dataset.theme = next;
    return;
  }
  root.classList.add("flicker");
  const seq: [Theme, number][] = [["light", 0], ["dark", 60], ["light", 130], ["dark", 190], ["light", 380]];
  for (const [t, ms] of seq) setTimeout(() => (root.dataset.theme = t), ms);
  setTimeout(() => root.classList.remove("flicker"), 420);
}
