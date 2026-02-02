import { createGenAIClient } from "./lib/genai";

async function main(): Promise<void> {
  const client = createGenAIClient();

  console.info("Listing available models...");
  const pager = await client.models.list();

  for await (const model of pager) {
    if (model.name?.includes("flash") || model.name?.includes("gemini")) {
      console.info(`Model: ${model.name}`);
      if ("supportedGenerationMethods" in model && model.supportedGenerationMethods) {
        console.info(
          `  Supported methods: ${(model.supportedGenerationMethods as string[]).join(", ")}`
        );
      }
      console.info();
    }
  }
}

main().catch(console.error);
