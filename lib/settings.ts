import { supabase } from "./supabase";

export type AppSettings = {
  dj_name: string;
  cooldown: string;
  voting_enabled: string;
  welcome_message: string;
  admin_password: string;
  theme_color: string;
  blacklist: string;
  youtube_enabled: string;
  allow_duplicate_songs: string;
  allow_multi_vote: string;
  new_request_animation: string;
  logo_url: string;
  daily_request_limit: string;
  clear_history_on_reset: string;
  safe_search: string;
  allow_song_messages: string;
  request_closed_message: string;
};

export const defaultSettings: AppSettings = {
  dj_name: "DJ BARKIN FALAKACILAR",
  cooldown: "180",
  voting_enabled: "true",
  welcome_message: "DJ BARKIN'e hoş geldiniz 🎧",
  admin_password: "qrjam2026",
  theme_color: "purple",
  blacklist: "",
  youtube_enabled: "true",
  allow_duplicate_songs: "false",
  allow_multi_vote: "false",
  new_request_animation: "true",
  logo_url: "",
  daily_request_limit: "10",
  clear_history_on_reset: "false",
  safe_search: "strict",
  allow_song_messages: "true",
  request_closed_message: "DJ birazdan tekrar istekleri açacak.",
};

export async function getSettings() {
  const { data } = await supabase.from("settings").select("*");

  const settings = { ...defaultSettings };

  if (data) {
    data.forEach((item) => {
      settings[item.key as keyof AppSettings] = item.value;
    });
  }

  return settings;
}

export async function updateSetting(key: string, value: string) {
  await supabase.from("settings").update({ value }).eq("key", key);
}
