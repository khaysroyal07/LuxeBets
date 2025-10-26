// hooks/AuthContext.tsx  (make sure the import path/casing matches)
import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type SignUpInput = {
  email: string;
  password: string;
  full_name: string;
  dob: string;                 // 'YYYY-MM-DD'
  phone?: string;
  country: string;             // e.g. 'US'
  state?: string;              // e.g. 'FL'
  username?: string;
  referral_code?: string;
  termsAccepted: boolean;
  geoConsent: boolean;
};

type AuthCtx = {
  user: any;
  signUp: (input: SignUpInput) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  totpEnroll: () => Promise<{ qrCode: string; secret: string }>;
  totpVerify: (code: string) => Promise<void>;
  passwordScore: (pwd: string) => { score: number; label: "Weak" | "Okay" | "Good" | "Strong" };
};

const AuthContext = createContext<AuthCtx | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
    };
    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const passwordScore = (pwd: string) => {
    let score = 0;
    if (pwd.length >= 8) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[a-z]/.test(pwd)) score++;
    if (/\d/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    const label = score <= 2 ? "Weak" : score === 3 ? "Okay" : score === 4 ? "Good" : "Strong";
    return { score, label };
  };

  const signUp = async (input: SignUpInput) => {
    // 1) Send metadata only. DO NOT write to tables here.
    const { email, password, ...meta } = input;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: meta.full_name,
          dob: meta.dob,                 // "YYYY-MM-DD"
          username: meta.username,
          phone: meta.phone,
          country: meta.country,
          state: meta.state,
          referral_code: meta.referral_code,
          geoConsent: meta.geoConsent,
          termsAccepted: meta.termsAccepted,
        },
      },
    });
    if (error) throw error;

    // If email confirmation is ON, there's no session here. The DB trigger
    // (security definer) will create the profiles row. Nothing else to do.
    // If you disabled email confirmation and you DO have a session, you may
    // upsert the profile now (see the optional block below).
    //
    // Optional (only when a session exists):
    if (data.session?.user?.id) {
      const uid = data.session.user.id;
      // This will pass RLS because we're authenticated and id = auth.uid()
      await supabase
        .from("profiles")
        .upsert({
          id: uid,
          email,
          full_name: meta.full_name,
          username: meta.username,
          dob: meta.dob,
          phone: meta.phone,
          country: meta.country,
          state: meta.state,
          referral_code: meta.referral_code,
          geo_consent: meta.geoConsent,
          terms_accepted: meta.termsAccepted,
          terms_accepted_at: meta.termsAccepted ? new Date().toISOString() : null,
        }, { onConflict: "id" });
    }
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    // Optional logging (make sure login_events table & RLS exist if you keep this)
    try {
      await supabase.from("login_events").insert({ user_id: data.user?.id, success: true, method: "password" });
    } catch {}
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setUser(null);
  };

  // ---- MFA (TOTP) helpers (keep as-is; may vary by SDK version) ----
  const totpEnroll = async () => {
    // @ts-ignore
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    if (error) throw error;
    return { qrCode: data.totp.qr_code, secret: data.totp.secret };
  };

  const totpVerify = async (code: string) => {
    // @ts-ignore
    const { error } = await supabase.auth.mfa.verify({ code });
    if (error) throw error;
    if (user?.id) {
      await supabase
        .from("security_settings")
        .update({ two_factor_enabled: true, totp_enabled: true })
        .eq("user_id", user.id);
    }
  };

  return (
    <AuthContext.Provider value={{ user, signUp, signIn, signOut, totpEnroll, totpVerify, passwordScore }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
