// src/hooks/useUserSettings.ts
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/AuthContext";

export type UserSettings = {
  biometric_enabled: boolean;
  gps_enabled: boolean;
  notif_push: boolean;
  notif_email: boolean;
  notif_sms: boolean;
  promos_opt_in: boolean;
  cache_buster: number;
};

const DEFAULTS: UserSettings = {
  biometric_enabled: false,
  gps_enabled: true,
  notif_push: true,
  notif_email: false,
  notif_sms: false,
  promos_opt_in: true,
  cache_buster: 0,
};

export function useUserSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<UserSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("profiles")
      .select(
        "biometric_enabled,gps_enabled,notif_push,notif_email,notif_sms,promos_opt_in,cache_buster"
      )
      .eq("id", user.id)
      .single();

    if (!error && data) setSettings({ ...DEFAULTS, ...data });
    setLoading(false);
  }, [user?.id]);

  const update = useCallback(
    async (patch: Partial<UserSettings>) => {
      if (!user?.id) return { ok: false, error: "Not signed in" };

      // optimistic
      setSettings((prev) => ({ ...prev, ...patch }));

      const { error } = await supabase
        .from("profiles")
        .update(patch)
        .eq("id", user.id);

      if (error) {
        // rollback by refetch
        await refresh();
        return { ok: false, error: error.message };
      }

      return { ok: true, error: null as any };
    },
    [user?.id, refresh]
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { settings, loading, refresh, update };
}
