import { createSupabaseAdminClient } from "@fantasy-diary/shared/supabase";

async function main(): Promise<void> {
  const client = createSupabaseAdminClient();

  // Fetch the generated episode
  const { data: episode, error } = await client
    .from("episodes")
    .select("*")
    .eq("id", "aa58856f-680f-495c-9ada-be8737e90ce6")
    .single();

  if (error) {
    console.error("Error fetching episode:", error);
    process.exit(1);
  }

  console.log("=== Generated Episode ===");
  console.log(JSON.stringify(episode, null, 2));

  // Fetch the novel details
  const { data: novel } = await client
    .from("novels")
    .select("*")
    .eq("id", "5653ed7f-a37f-4582-99c9-24651d5272b8")
    .single();

  console.log("\n=== Novel Details ===");
  console.log(JSON.stringify(novel, null, 2));
}

main().catch(console.error);
