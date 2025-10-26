// lib/results.ts
import { supabase } from "@/lib/supabase";

export const syncResultsForDay = async (dayISO: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  await supabase.functions.invoke("sync_results", {
    headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
    body: { date: dayISO },
  }).catch(() => null);
};
