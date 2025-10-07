// hooks/authContext.tsx
import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type SignUpInput = {
  email: string;
  password: string;
  full_name: string;
  dob: string; // 'YYYY-MM-DD'
  phone?: string;
  country: string;
  state?: string;
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
  // MFA (TOTP)
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
    if (!input.termsAccepted) throw new Error("Please accept the Terms & Privacy Policy.");
    // client guard for <18 could be added in UI; DB also enforces 18+
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        emailRedirectTo: "betaverse://login",
        data: {
          full_name: input.full_name,
          username: input.username,
        },
      },
    });
    if (error) throw error;

    const uid = data.user?.id;
    if (!uid) return;

    const { error: pErr } = await supabase.from("profiles").upsert(
      {
        id: uid,
        email: input.email,
        full_name: input.full_name,
        username: input.username,
        dob: input.dob,
        phone: input.phone,
        country: input.country,
        state: input.state,
        referral_code: input.referral_code,
        terms_accepted_at: new Date().toISOString(),
        geo_consent: input.geoConsent,
      },
      { onConflict: "id" }
    );
    if (pErr) throw pErr;
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    // optional: log events (ignore errors)
    try {
      await supabase.from("login_events").insert({ user_id: data.user?.id, success: true, method: "password" });
    } catch {}
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setUser(null);
  };

  // TOTP MFA (supported in Supabase)
  const totpEnroll = async () => {
    // @ts-ignore - types differ across SDK versions
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    if (error) throw error;
    return { qrCode: data.totp.qr_code, secret: data.totp.secret };
  };

  const totpVerify = async (code: string) => {
    // @ts-ignore - types differ across SDK versions
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
