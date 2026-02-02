import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, "..");

function loadPrompt(filename: string): string {
  const filePath = join(__dirname, "..", "prompts", filename);

  return readFileSync(filePath, "utf-8").trim();
}

export function loadWriterSystemPrompt(): string {
  return loadPrompt("writer-system.md");
}

export function loadWriterPromptTemplate(): string {
  return loadPrompt("writer-prompt.md");
}

export function loadReviewerSystemPrompt(): string {
  return loadPrompt("reviewer-system.md");
}

export function loadReviewerPromptTemplate(): string {
  return loadPrompt("reviewer-prompt.md");
}

export function loadInitialPlotSeeds(): string {
  return loadPrompt("initial-plot-seeds.md");
}
