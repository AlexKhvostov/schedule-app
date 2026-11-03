import { getSupabase } from "./client";

export type OnlineMember = {
  member_id: string;
  nick: string;
  avatar_url: string | null;
  online: boolean;
  activity_minutes: number;
  edit_minutes: number | null;
  edit_variant: string | null;
  edit_limit: string | null;
};

export async function pingMemberPresence(interacted: boolean) {
  const result = await getSupabase()?.rpc("ping_member_presence", { p_interacted: interacted });
  return Boolean(result && !result.error);
}

export async function loadOnlineMembers() {
  const result = await getSupabase()?.rpc("list_member_presence");
  return result && !result.error ? (result.data as OnlineMember[]) : null;
}
