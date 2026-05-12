"use client";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

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

const COOLDOWN_MS = 3 * 60 * 1000;

export default function Home() {
  const [query, setQuery] = useState("");
  const [videos, setVideos] = useState<YoutubeVideo[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<YoutubeVideo | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [message, setMessage] = useState("");
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [isSearching, setIsSearching] = useState(false);

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
    const left = Math.max(0, COOLDOWN_MS - (now - lastRequest));
    setCooldownLeft(left);
  };

  useEffect(() => {
    fetchSongs();
    updateCooldown();

    const timer = setInterval(updateCooldown, 1000);

    const channel = supabase
      .channel("songs-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "songs" },
        () => fetchSongs()
      )
      .subscribe();

    return () => {
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, []);

  const searchYoutube = async () => {
    const cleanQuery = query.trim();

    if (!cleanQuery) {
      setMessage("Önce şarkı adı yaz 🎵");
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

    const lastRequest = Number(localStorage.getItem("lastRequestTime") || "0");
    const now = Date.now();

    if (now - lastRequest < COOLDOWN_MS) {
      setMessage("Yeni şarkı göndermek için biraz bekle ⏳");
      return;
    }

    const { data: existing } = await supabase
      .from("songs")
      .select("*")
      .eq("youtube_url", selectedVideo.url)
      .maybeSingle();

    if (existing) {
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
    setMessage("Şarkın sıraya alındı 🎧");
    setQuery("");
    setVideos([]);
    setSelectedVideo(null);
    updateCooldown();
    fetchSongs();
  };

  const voteSong = async (song: Song) => {
    const votedSongs = JSON.parse(localStorage.getItem("votedSongs") || "[]");

    if (votedSongs.includes(song.id)) {
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
          "radial-gradient(circle at top, rgba(255,0,204,0.25), transparent 35%), radial-gradient(circle at bottom, rgba(124,58,237,0.35), transparent 40%), #050505",
        color: "white",
        padding: 24,
        textAlign: "center",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <h1
          style={{
            fontSize: 46,
            background: "linear-gradient(90deg,#ff00cc,#7c3aed,#22c55e)",
            WebkitBackgroundClip: "text",
            color: "transparent",
            marginBottom: 4,
          }}
        >
          🎧 DJ Barkın Falakacılar
        </h1>

        <p style={{ color: "#bbb", fontSize: 16 }}>
          YouTube’dan şarkını seç, kalabalık oylasın.
        </p>

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
            disabled={isSearching}
            style={{
              marginTop: 14,
              padding: 15,
              width: "100%",
              borderRadius: 14,
              border: "none",
              background: isSearching
                ? "#333"
                : "linear-gradient(90deg,#7c3aed,#22c55e)",
              color: "white",
              fontWeight: "bold",
              cursor: isSearching ? "not-allowed" : "pointer",
              fontSize: 16,
            }}
          >
            {isSearching ? "Aranıyor..." : "YouTube’da Ara"}
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
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}