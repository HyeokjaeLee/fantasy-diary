import { AgentError } from "./errors/agentError";
import { generateEpisodeWorkflow } from "./workflows/generateEpisodeWorkflow";

function resolveNovelId(): string {
  const fromEnv = process.env.NOVEL_ID;
  if (fromEnv) return fromEnv;

  const fromArg = process.argv[2];
  if (fromArg) return fromArg;

  throw new AgentError({
    type: "VALIDATION_ERROR",
    code: "REQUIRED",
    message: "Missing required novel id. Set NOVEL_ID or pass as argv[2].",
  });
}

async function main(): Promise<void> {
  const novelId = resolveNovelId();
  const result = await generateEpisodeWorkflow({ novelId });

  console.info(
    JSON.stringify(
      {
        episode_id: result.episode.id,
        episode_number: result.episode.episode_number,
      },
      null,
      2
    )
  );
}

try {
  await main();
} catch (error) {
  if (error instanceof AgentError) {
    console.error(JSON.stringify(error.toLLMResponse(), null, 2));
  } else {
    console.error(error);
  }
  process.exitCode = 1;
}
