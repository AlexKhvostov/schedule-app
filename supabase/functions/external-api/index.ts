import { createApp } from "./app.ts";
import { repository } from "./core/repository.ts";

const load = repository(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("EXTERNAL_API_SERVER_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);
Deno.serve(createApp(load, (event) => console.info(JSON.stringify(event))));
