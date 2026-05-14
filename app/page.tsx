"use client";
import { useEffect, useState } from "react";
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
};

type YoutubeVideo = {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
  url: string;
};

export default function Home() {
  const [query, setQuery] = useState("");
  const [videos, setVideos] = useState<YoutubeVideo[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<YoutubeVideo | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [message, setMessage] = useState("");
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);

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

  const hasBlacklistedWord = (text: string) => {
    const blacklist = settings.blacklist
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
    if (!selectedVideo) {
      setMessage("Önce listeden bir YouTube sonucu seç 🎵");
      return;
    }

    if (hasBlacklistedWord(selectedVideo.title)) {
      setMessage("Seçilen şarkıda yasaklı kelime var.");
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

    const { error } = await supabase.from("songs").insert([
      {
        name: selectedVideo.title,
        votes: 1,
        status: "pending",
        youtube_url: selectedVideo.url,
        youtube_channel: selectedVideo.channel,
        thumbnail: selectedVideo.thumbnail,
      },
    ]);

    if (error) {
      console.log("EKLEME HATASI:", error);
      setMessage("Bir hata oldu, tekrar dene.");
      return;
    }

    localStorage.setItem("lastRequestTime", String(now));
    increaseDailyCount();

    setMessage("Şarkın sıraya alındı 🎧");
    setQuery("");
    setVideos([]);
    setSelectedVideo(null);
    updateCooldown();
    fetchSongs();
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
        {settings.logo_url && (
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

{settings.youtube_enabled !== "true" && (
  <div
    style={{
      marginTop: 25,
      padding: 18,
      background: "linear-gradient(90deg,#7f1d1d,#111)",
      border: "1px solid #ef4444",
      borderRadius: 16,
      color: "white",
      fontWeight: "bold",
    }}
  >
    🚫 Şu anda istek alamıyoruz.
  </div>
)}
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

          <button
            onClick={addSong}
            disabled={cooldownLeft > 0}
            style={{
              marginTop: 16,
              padding: 15,
              width: "100%",
              borderRadius: 14,
              border: "none",
              background:
                cooldownLeft > 0
                  ? "#333"
                  : "linear-gradient(90deg,#7c3aed,#6d28d9)",
              color: "white",
              fontWeight: "bold",
              cursor: cooldownLeft > 0 ? "not-allowed" : "pointer",
              fontSize: 16,
            }}
          >
            {cooldownLeft > 0
              ? `Tekrar göndermek için bekle: ${minutes}:${seconds
                  .toString()
                  .padStart(2, "0")}`
              : "Seçilen Şarkıyı Gönder"}
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
      </div>
    </main>
  );
}