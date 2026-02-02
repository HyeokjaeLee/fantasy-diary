import { createGenAIClient } from "./lib/genai";

async function main(): Promise<void> {
  const client = createGenAIClient();

  console.log("Listing available models...");
  const pager = await client.models.list();

  for await (const model of pager) {
    if (model.name.includes("flash") || model.name.includes("gemini")) {
      console.log(`Model: ${model.name}`);
      if (model.supportedGenerationMethods) {
        console.log(`  Supported methods: ${model.supportedGenerationMethods.join(", ")}`);
      }
      console.log();
    }
  }
}

main().catch(console.error);
