// hooks/AuthContext.tsx
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { supabase } from "@/lib/supabase";

type SignUpInput = {
  email: string;
  password: string;
  full_name: string;
  dob: string; // 'YYYY-MM-DD'
  phone?: string;
  country: string; // e.g. 'US'
  state?: string; // we’ll treat this as state_code (e.g. 'FL')
  username?: string;
  referral_code?: string;
  termsAccepted: boolean;
  geoConsent: boolean;
};

type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  is_admin?: boolean | null;
};

type PasswordScoreLabel = "Weak" | "Okay" | "Good" | "Strong";

type AuthCtx = {
  user: any;
  profile: Profile | null;
  isAdmin: boolean;
  signUp: (input: SignUpInput) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  totpEnroll: () => Promise<{ qrCode: string; secret: string }>;
  totpVerify: (code: string) => Promise<void>;
  passwordScore: (pwd: string) => {
    score: number;
    label: PasswordScoreLabel;
  };
};

const AuthContext = createContext<AuthCtx | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  // ---- helper to load profile for current user ----
  const loadProfile = async (uid: string) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, full_name, is_admin")
        .eq("id", uid)
        .maybeSingle();

      if (error) {
        console.warn("loadProfile error:", error.message);
        setProfile(null);
      } else {
        setProfile(data as Profile | null);
      }
    } catch (err) {
      console.warn("loadProfile exception:", err);
      setProfile(null);
    }
  };

  // ---- boot + auth state change ----
  useEffect(() => {
    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const u = session?.user ?? null;
      setUser(u);
      if (u?.id) await loadProfile(u.id);
    };
    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u?.id) {
        loadProfile(u.id);
      } else {
        setProfile(null);
      }
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
    const label: PasswordScoreLabel =
      score <= 2 ? "Weak" : score === 3 ? "Okay" : score === 4 ? "Good" : "Strong";
    return { score, label };
  };

  // ---------- SIGN UP ----------
  const signUp = async (input: SignUpInput) => {
    const {
      email,
      password,
      full_name,
      dob,
      phone,
      country,
      state,
      username,
      referral_code,
      termsAccepted,
      geoConsent,
    } = input;

    const nowISO = new Date().toISOString();

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          // names here MUST match what the trigger reads
          full_name,
          display_name: full_name,
          username,
          dob, // 'YYYY-MM-DD'
          phone,
          country,
          state_code: state, // treat input.state as 'FL'
          state,             // you can later store full name if you want
          referral_code,
          avatar_url: null,
          allow_geo: geoConsent,
          geo_consent: geoConsent,
          terms_accepted: termsAccepted,
          accepted_terms_at: termsAccepted ? nowISO : null,
          terms_accepted_at: termsAccepted ? nowISO : null,
        },
      },
    });

    if (error) throw error;

    // if email confirmation is disabled you’ll get a session here
    const uid = data.user?.id ?? data.session?.user?.id;
    if (uid) {
      await loadProfile(uid); // row created by trigger
    }
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;

    const uid = data.user?.id;
    if (uid) await loadProfile(uid);

    try {
      await supabase
        .from("login_events")
        .insert({ user_id: uid, success: true, method: "password" });
    } catch {
      // optional table, ignore errors
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setUser(null);
    setProfile(null);
  };

  // ---- MFA helpers (unchanged) ----
  const totpEnroll = async () => {
    // @ts-ignore
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
    });
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

  const isAdmin = !!profile?.is_admin;

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isAdmin,
        signUp,
        signIn,
        signOut,
        totpEnroll,
        totpVerify,
        passwordScore,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
