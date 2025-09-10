// lib/env.ts
import Constants from "expo-constants";

function readExtra(name: string): string | undefined {
  // Works with app.config.(ts|js) `extra: { ... }` or EAS secrets
  return (Constants?.expoConfig as any)?.extra?.[name];
}

export const SDIO_KEY =
  readExtra("SPORTSDATAIO_KEY") ||
  process.env.EXPO_PUBLIC_SPORTSDATAIO_KEY ||
  process.env.SPORTSDATAIO_KEY ||
  ""; // <= put your key in .env as EXPO_PUBLIC_SPORTSDATAIO_KEY=...

export const SPORTSDB_KEY =
  readExtra("SPORTSDB_KEY") ||
  process.env.EXPO_PUBLIC_SPORTSDB_KEY ||
  "3"; // public demo key works

export const SDIO_BASE = "https://api.sportsdata.io/v3";
export const SPORTSDB_BASE = "https://www.thesportsdb.com/api/v1/json";
