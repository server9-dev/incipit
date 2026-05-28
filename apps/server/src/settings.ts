import { db } from "./db.js";

db.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);

export const SETTING_KEYS = [
  "provider",
  "model",
  "embedModel",
  "visionModel",
  "ollamaBaseUrl",
  "openaiKey",
  "anthropicKey",
  "googleKey",
] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

/** Raw stored overrides (only keys the user has set). */
export function getStored(): Partial<Record<SettingKey, string>> {
  const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  const out: Partial<Record<SettingKey, string>> = {};
  for (const r of rows) if ((SETTING_KEYS as readonly string[]).includes(r.key)) out[r.key as SettingKey] = r.value;
  return out;
}

/** Upsert provided settings; empty string clears a stored override. */
export function setStored(patch: Partial<Record<SettingKey, string>>) {
  const upsert = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  );
  const del = db.prepare("DELETE FROM settings WHERE key = ?");
  const tx = db.transaction(() => {
    for (const [k, v] of Object.entries(patch)) {
      if (!(SETTING_KEYS as readonly string[]).includes(k)) continue;
      if (v === "") del.run(k);
      else if (v != null) upsert.run(k, v);
    }
  });
  tx();
}
