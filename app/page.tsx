"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  AppSettings,
  defaultSettings,
  getSettings,
} from "../lib/settings";

type Song = {
  id: number;
  name: string;
  votes: number;
  status: string;
  created_at?: string;
  played_at?: string;
  youtube_url?: string;
  youtube_channel?: string;
  thumbnail?: string;
  song_message?: string | null;
  device_id?: string | null;
};

type YoutubeVideo = {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
  url: string;
};

type NewSong = {
  name: string;
  votes: number;
  status: string;
  youtube_url: string;
  youtube_channel: string;
  thumbnail: string;
  song_message?: string;
  device_id?: string;
};

type SubmitStatus = "idle" | "submitting" | "success" | "error";

export default function Home() {
  const [query, setQuery] = useState("");
  const [videos, setVideos] = useState<YoutubeVideo[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<YoutubeVideo | null>(null);
  const [songMessage, setSongMessage] = useState("");
  const [songs, setSongs] = useState<Song[]>([]);
  const [message, setMessage] = useState("");
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>("idle");
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const submitLockRef = useRef(false);

  const cooldownMs = Number(settings.cooldown || "180") * 1000;

  const loadSettings = async () => {
    const loadedSettings = await getSettings();
    setSettings(loadedSettings);
  };

  const fetchSongs = async () => {
    const { data, error } = await supabase.from("songs").select("*");

    if (error) {
      console.log("HATA:", error);
      return;
    }

    if (data) {
      const sorted = data.sort((a, b) => {
        if (a.status === "pending" && b.status === "played") return -1;
        if (a.status === "played" && b.status === "pending") return 1;
        return b.votes - a.votes;
      });

      setSongs(sorted);
    }
  };

  const updateCooldown = () => {
    const lastRequest = Number(localStorage.getItem("lastRequestTime") || "0");
    const now = Date.now();
    const left = Math.max(0, cooldownMs - (now - lastRequest));
    setCooldownLeft(left);
  };

  const hasBlacklistedWord = (
    text: string,
    sourceSettings: AppSettings = settings
  ) => {
    const blacklist = sourceSettings.blacklist
      .split(",")
      .map((word) => word.trim().toLowerCase())
      .filter(Boolean);

    const lowerText = text.toLowerCase();

    return blacklist.some((word) => lowerText.includes(word));
  };

  const getTodayKey = () => {
    const today = new Date().toISOString().split("T")[0];
    return `dailyRequestCount_${today}`;
  };

  const getDailyCount = () => {
    return Number(localStorage.getItem(getTodayKey()) || "0");
  };

  const increaseDailyCount = () => {
    const current = getDailyCount();
    localStorage.setItem(getTodayKey(), String(current + 1));
  };

  const createDeviceId = () => {
    if (globalThis.crypto?.randomUUID) {
      return globalThis.crypto.randomUUID();
    }

    return `device_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  };

  const getDeviceId = () => {
    const storageKey = "qrjam_device_id";
    const existingDeviceId = localStorage.getItem(storageKey);

    if (existingDeviceId) {
      return existingDeviceId;
    }

    const newDeviceId = createDeviceId();
    localStorage.setItem(storageKey, newDeviceId);
    return newDeviceId;
  };

  const isMissingOptionalColumnError = (error: {
    code?: string;
    message?: string;
  }) => {
    const lowerMessage = (error.message || "").toLowerCase();

    return (
      error.code === "42703" ||
      error.code === "PGRST204" ||
      lowerMessage.includes("column") ||
      lowerMessage.includes("schema cache")
    );
  };

  useEffect(() => {
    loadSettings();
    fetchSongs();

    const settingsChannel = supabase
      .channel("settings-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "settings" },
        () => loadSettings()
      )
      .subscribe();

    const songsChannel = supabase
      .channel("songs-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "songs" },
        () => fetchSongs()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(settingsChannel);
      supabase.removeChannel(songsChannel);
    };
  }, []);

  useEffect(() => {
    updateCooldown();
    const timer = setInterval(updateCooldown, 1000);

    return () => clearInterval(timer);
  }, [settings.cooldown]);

  const searchYoutube = async () => {
    if (settings.youtube_enabled !== "true") {
      setMessage("YouTube arama şu anda kapalı.");
      return;
    }

    const cleanQuery = query.trim();

    if (!cleanQuery) {
      setMessage("Önce şarkı adı yaz 🎵");
      return;
    }

    if (hasBlacklistedWord(cleanQuery)) {
      setMessage("Bu aramada yasaklı kelime var.");
      return;
    }

    setIsSearching(true);
    setMessage("YouTube’da aranıyor...");
    setSelectedVideo(null);
    setSongMessage("");

    try {
      const response = await fetch(
        `/api/youtube-search?q=${encodeURIComponent(cleanQuery)}`
      );

      const data = await response.json();

      if (data.error) {
        setMessage("YouTube aramasında hata oldu.");
        console.log("YOUTUBE HATA:", data.error);
        return;
      }

      setVideos(data.videos || []);

      if (!data.videos || data.videos.length === 0) {
        setMessage("Sonuç bulunamadı.");
      } else {
        setMessage("Aşağıdan şarkını seç.");
      }
    } catch (error) {
      console.log("ARAMA HATASI:", error);
      setMessage("YouTube araması başarısız oldu.");
    } finally {
      setIsSearching(false);
    }
  };

  const addSong = async () => {
    if (isSubmitting) return;
    if (submitLockRef.current) return;

    submitLockRef.current = true;
    setIsSubmitting(true);
    setSubmitStatus("submitting");

    let shouldResetSubmitStatus = true;

    try {
    const latestSettings = await getSettings();
setSettings(latestSettings);

if (latestSettings.youtube_enabled !== "true") {
  setMessage("🚫 Şu anda istek alamıyoruz.");
  return;
}
    if (!selectedVideo) {
      setMessage("Önce listeden bir YouTube sonucu seç 🎵");
      return;
    }

    if (hasBlacklistedWord(selectedVideo.title, latestSettings)) {
      setMessage("Seçilen şarkıda yasaklı kelime var.");
      return;
    }

    const cleanSongMessage =
      latestSettings.allow_song_messages === "true" ? songMessage.trim() : "";

    if (cleanSongMessage.length > 80) {
      setMessage("Mesaj en fazla 80 karakter olabilir.");
      return;
    }

    if (cleanSongMessage && hasBlacklistedWord(cleanSongMessage, latestSettings)) {
      setMessage("Mesajda yasaklı kelime var.");
      return;
    }

    const dailyLimit = Number(settings.daily_request_limit || "10");

    if (getDailyCount() >= dailyLimit) {
      setMessage(`Bugünkü istek hakkın doldu. Limit: ${dailyLimit}`);
      return;
    }

    const lastRequest = Number(localStorage.getItem("lastRequestTime") || "0");
    const now = Date.now();

    if (now - lastRequest < cooldownMs) {
      setMessage("Yeni şarkı göndermek için biraz bekle ⏳");
      return;
    }

    const { data: existing } = await supabase
      .from("songs")
      .select("*")
      .eq("youtube_url", selectedVideo.url)
      .maybeSingle();

    if (existing && settings.allow_duplicate_songs !== "true") {
      setMessage("Bu şarkı zaten listede. Yanındaki 👍 butonuyla oy verebilirsin.");
      return;
    }

    const newSong: NewSong = {
      name: selectedVideo.title,
      votes: 1,
      status: "pending",
      youtube_url: selectedVideo.url,
      youtube_channel: selectedVideo.channel,
      thumbnail: selectedVideo.thumbnail,
      device_id: getDeviceId(),
    };

    if (cleanSongMessage) {
      newSong.song_message = cleanSongMessage;
    }

    const withoutMessage = { ...newSong };
    delete withoutMessage.song_message;

    const withoutDevice = { ...newSong };
    delete withoutDevice.device_id;

    const withoutOptionalFields = { ...withoutMessage };
    delete withoutOptionalFields.device_id;

    const insertCandidates = [
      {
        song: newSong,
        messageSaved: Boolean(cleanSongMessage),
      },
      {
        song: withoutMessage,
        messageSaved: false,
      },
      {
        song: withoutDevice,
        messageSaved: Boolean(cleanSongMessage),
      },
      {
        song: withoutOptionalFields,
        messageSaved: false,
      },
    ];

    let error = null;
    let messageSaved = Boolean(cleanSongMessage);

    for (const candidate of insertCandidates) {
      const result = await supabase.from("songs").insert([candidate.song]);

      if (!result.error) {
        error = null;
        messageSaved = candidate.messageSaved;
        break;
      }

      error = result.error;

      if (!isMissingOptionalColumnError(result.error)) {
        break;
      }
    }

    if (error) {
      console.log("EKLEME HATASI:", error);
      setSubmitStatus("error");
      setMessage("❌ Bir hata oldu, tekrar dene");
      shouldResetSubmitStatus = false;
      return;
    }

    localStorage.setItem("lastRequestTime", String(now));
    increaseDailyCount();

    setSubmitStatus("success");
    shouldResetSubmitStatus = false;
    setMessage(
      cleanSongMessage && !messageSaved
        ? "Şarkın sıraya alındı 🎧 Mesaj için database migration gerekli."
        : "Şarkın sıraya alındı 🎧"
    );
    setQuery("");
    setVideos([]);
    setSelectedVideo(null);
    setSongMessage("");
    updateCooldown();
    fetchSongs();
    } catch (error) {
      console.log("EKLEME HATASI:", error);
      setSubmitStatus("error");
      setMessage("❌ Bir hata oldu, tekrar dene");
      shouldResetSubmitStatus = false;
    } finally {
      submitLockRef.current = false;
      setIsSubmitting(false);

      if (shouldResetSubmitStatus) {
        setSubmitStatus("idle");
      } else {
        setTimeout(() => setSubmitStatus("idle"), 1800);
      }
    }
  };

  const voteSong = async (song: Song) => {
    if (settings.voting_enabled !== "true") {
      setMessage("Oy sistemi şu anda kapalı.");
      return;
    }

    const votedSongs = JSON.parse(localStorage.getItem("votedSongs") || "[]");

    if (settings.allow_multi_vote !== "true" && votedSongs.includes(song.id)) {
      setMessage("Bu şarkıya zaten oy verdin 👍");
      return;
    }

    const { error } = await supabase
      .from("songs")
      .update({ votes: song.votes + 1 })
      .eq("id", song.id);

    if (error) {
      console.log("OY HATASI:", error);
      setMessage("Oy verilirken hata oldu.");
      return;
    }

    localStorage.setItem("votedSongs", JSON.stringify([...votedSongs, song.id]));
    setMessage("Oyun eklendi 🔥");
    fetchSongs();
  };

  const secondsLeft = Math.ceil(cooldownLeft / 1000);
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const requestsOpen = settings.youtube_enabled === "true";
  const submitButtonDisabled =
    isSubmitting || submitStatus !== "idle" || cooldownLeft > 0;
  const submitButtonText =
    submitStatus === "submitting"
      ? "⏳ Gönderiliyor..."
      : submitStatus === "success"
      ? "✅ Şarkın sıraya alındı"
      : submitStatus === "error"
      ? "❌ Bir hata oldu, tekrar dene"
      : cooldownLeft > 0
      ? `Tekrar göndermek için bekle: ${minutes}:${seconds
          .toString()
          .padStart(2, "0")}`
      : "Seçilen Şarkıyı Gönder";

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          settings.theme_color === "green"
            ? "radial-gradient(circle at top, rgba(34,197,94,0.35), transparent 35%), #050505"
            : settings.theme_color === "gold"
            ? "radial-gradient(circle at top, rgba(245,158,11,0.35), transparent 35%), #050505"
            : settings.theme_color === "red"
            ? "radial-gradient(circle at top, rgba(239,68,68,0.35), transparent 35%), #050505"
            : "radial-gradient(circle at top, rgba(255,0,204,0.25), transparent 35%), radial-gradient(circle at bottom, rgba(124,58,237,0.35), transparent 40%), #050505",
        color: "white",
        padding: 24,
        textAlign: "center",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        {settings.logo_url && requestsOpen && (
          <img
            src={settings.logo_url}
            alt="Logo"
            style={{
              width: 110,
              height: 110,
              objectFit: "cover",
              borderRadius: 22,
              marginBottom: 16,
              border: "1px solid #333",
            }}
          />
        )}

        <h1
          style={{
            fontSize: 46,
            background: "linear-gradient(90deg,#ff00cc,#7c3aed,#22c55e)",
            WebkitBackgroundClip: "text",
            color: "transparent",
            marginBottom: 4,
          }}
        >
          🎧 {settings.dj_name}
        </h1>

        <p style={{ color: "#bbb", fontSize: 16 }}>
          {settings.welcome_message}
        </p>

        {!requestsOpen ? (
          <section
            style={{
              marginTop: 34,
              minHeight: 360,
              padding: 28,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              background:
                "linear-gradient(135deg,rgba(17,17,17,0.96),rgba(31,15,36,0.94))",
              border: "1px solid rgba(244,114,182,0.38)",
              borderRadius: 24,
              boxShadow:
                "0 0 45px rgba(244,114,182,0.22), inset 0 0 36px rgba(124,58,237,0.08)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "radial-gradient(circle at top,rgba(239,68,68,0.20),transparent 34%), radial-gradient(circle at bottom,rgba(124,58,237,0.24),transparent 42%)",
                pointerEvents: "none",
              }}
            />

            <div style={{ position: "relative", zIndex: 1 }}>
              {settings.logo_url && (
                <img
                  src={settings.logo_url}
                  alt="Logo"
                  style={{
                    width: 118,
                    height: 118,
                    objectFit: "cover",
                    borderRadius: 24,
                    marginBottom: 20,
                    border: "1px solid rgba(255,255,255,0.16)",
                    boxShadow: "0 0 28px rgba(124,58,237,0.45)",
                  }}
                />
              )}

              <h2
                style={{
                  margin: 0,
                  color: "white",
                  fontSize: 34,
                  lineHeight: 1.12,
                }}
              >
                🚫 Şu anda istek alınmıyor
              </h2>

              <p
                style={{
                  marginTop: 14,
                  marginBottom: 0,
                  color: "#d1d5db",
                  fontSize: 17,
                }}
              >
                {settings.request_closed_message}
              </p>
            </div>
          </section>
        ) : (
          <>
        <div
          style={{
            marginTop: 28,
            padding: 20,
            background: "rgba(17,17,17,0.9)",
            border: "1px solid #333",
            borderRadius: 20,
            boxShadow: "0 0 30px rgba(124,58,237,0.25)",
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") searchYoutube();
            }}
            placeholder="Şarkı ara..."
            disabled={settings.youtube_enabled !== "true"}
            style={{
              padding: 15,
              width: "100%",
              borderRadius: 14,
              border: "1px solid #333",
              background: "#050505",
              color: "white",
              outline: "none",
              boxSizing: "border-box",
            }}
          />

          <button
            onClick={searchYoutube}
            disabled={isSearching || settings.youtube_enabled !== "true"}
            style={{
              marginTop: 14,
              padding: 15,
              width: "100%",
              borderRadius: 14,
              border: "none",
              background:
                isSearching || settings.youtube_enabled !== "true"
                  ? "#333"
                  : "linear-gradient(90deg,#7c3aed,#22c55e)",
              color: "white",
              fontWeight: "bold",
              cursor:
                isSearching || settings.youtube_enabled !== "true"
                  ? "not-allowed"
                  : "pointer",
              fontSize: 16,
            }}
          >
            {settings.youtube_enabled !== "true"
              ? "YouTube Arama Kapalı"
              : isSearching
              ? "Aranıyor..."
              : "YouTube’da Ara"}
          </button>

          {videos.length > 0 && (
            <div style={{ marginTop: 18 }}>
              {videos.map((video) => (
                <div
                  key={video.videoId}
                  onClick={() => {
                    setSelectedVideo(video);
                    setSongMessage("");
                    setMessage("Şarkı seçildi. Şimdi gönder.");
                  }}
                  style={{
                    marginTop: 12,
                    padding: 12,
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                    background:
                      selectedVideo?.videoId === video.videoId
                        ? "#1f2937"
                        : "#151515",
                    border:
                      selectedVideo?.videoId === video.videoId
                        ? "2px solid #22c55e"
                        : "1px solid #333",
                    borderRadius: 14,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <img
                    src={video.thumbnail}
                    alt={video.title}
                    style={{
                      width: 90,
                      minWidth: 90,
                      height: 68,
                      objectFit: "cover",
                      borderRadius: 10,
                    }}
                  />

                  <div>
                    <strong>{video.title}</strong>
                    <div style={{ color: "#aaa", marginTop: 4 }}>
                      {video.channel}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {selectedVideo && settings.allow_song_messages === "true" && (
            <div
              style={{
                marginTop: 16,
                padding: 14,
                background:
                  "linear-gradient(135deg,rgba(124,58,237,0.16),rgba(34,197,94,0.08))",
                border: "1px solid rgba(167,139,250,0.35)",
                borderRadius: 16,
                textAlign: "left",
                boxShadow: "0 0 22px rgba(124,58,237,0.18)",
              }}
            >
              <label
                style={{
                  display: "block",
                  color: "#a78bfa",
                  fontSize: 13,
                  fontWeight: "bold",
                  marginBottom: 8,
                }}
              >
                Şarkıyla mesaj gönder
              </label>

              <textarea
                value={songMessage}
                onChange={(e) => setSongMessage(e.target.value.slice(0, 80))}
                maxLength={80}
                placeholder="Damada gelsin ❤️"
                style={{
                  width: "100%",
                  minHeight: 76,
                  padding: 12,
                  background: "#050505",
                  color: "white",
                  border: "1px solid #333",
                  borderRadius: 12,
                  outline: "none",
                  resize: "vertical",
                  boxSizing: "border-box",
                }}
              />

              <div
                style={{
                  marginTop: 8,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  color: "#aaa",
                  fontSize: 12,
                }}
              >
                <span>Opsiyonel</span>
                <span>{songMessage.length}/80</span>
              </div>
            </div>
          )}

          <button
            onClick={addSong}
            disabled={submitButtonDisabled}
            style={{
              marginTop: 16,
              padding: 15,
              width: "100%",
              borderRadius: 14,
              border: "none",
              background:
                submitButtonDisabled
                  ? "#333"
                  : "linear-gradient(90deg,#7c3aed,#6d28d9)",
              color: "white",
              fontWeight: "bold",
              cursor: submitButtonDisabled ? "not-allowed" : "pointer",
              fontSize: 16,
            }}
          >
            {submitButtonText}
          </button>

          {message && (
            <p style={{ marginTop: 14, color: "#22c55e", fontWeight: "bold" }}>
              {message}
            </p>
          )}
        </div>

        <div style={{ marginTop: 34 }}>
          <h2>🔥 Canlı İstekler</h2>

          {songs.length === 0 && (
            <p style={{ color: "#777" }}>Henüz istek yok.</p>
          )}

          {songs.map((song, index) => (
            <div
              key={song.id}
              style={{
                marginTop: 12,
                padding: 14,
                borderRadius: 16,
                background:
                  song.status === "played"
                    ? "#0b0b0b"
                    : index === 0
                    ? "linear-gradient(90deg,#231942,#111)"
                    : "#111",
                border: index === 0 ? "1px solid #7c3aed" : "1px solid #333",
                opacity: song.status === "played" ? 0.55 : 1,
                textAlign: "left",
              }}
            >
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                {song.thumbnail && (
                  <img
                    src={song.thumbnail}
                    alt={song.name}
                    style={{
                      width: 80,
                      minWidth: 80,
                      height: 60,
                      objectFit: "cover",
                      borderRadius: 10,
                    }}
                  />
                )}

                <div>
                  <strong>{song.name}</strong>
                  {song.youtube_channel && (
                    <div style={{ color: "#aaa", marginTop: 3 }}>
                      {song.youtube_channel}
                    </div>
                  )}
                  {song.status === "played" && <span>✅ Çalındı</span>}
                </div>
              </div>

              {settings.voting_enabled === "true" && (
                <button
                  onClick={() => voteSong(song)}
                  disabled={song.status === "played"}
                  style={{
                    marginTop: 10,
                    padding: "9px 14px",
                    borderRadius: 12,
                    border: "none",
                    background:
                      song.status === "played"
                        ? "#333"
                        : "linear-gradient(90deg,#16a34a,#22c55e)",
                    color: "white",
                    cursor: song.status === "played" ? "not-allowed" : "pointer",
                    fontWeight: "bold",
                  }}
                >
                  👍 {song.votes}
                </button>
              )}
            </div>
          ))}
        </div>
          </>
        )}
      </div>
    </main>
  );
}
