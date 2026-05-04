"use client";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Song = {
  id: number;
  name: string;
  votes: number;
  status: string;
};

const COOLDOWN_MS = 3 * 60 * 1000;

function getLinkInfo(text: string) {
  if (!text.startsWith("http")) return null;
  if (text.includes("youtube.com") || text.includes("youtu.be")) return { label: "YouTube", emoji: "▶️" };
  if (text.includes("spotify.com")) return { label: "Spotify", emoji: "🟢" };
  return { label: "Link", emoji: "🔗" };
}

export default function Home() {
  const [input, setInput] = useState("");
  const [songs, setSongs] = useState<Song[]>([]);
  const [message, setMessage] = useState("");
  const [cooldownLeft, setCooldownLeft] = useState(0);

  const fetchSongs = async () => {
    const { data } = await supabase.from("songs").select("*");
    if (data) {
      setSongs(
        data.sort((a, b) => {
          if (a.status === "pending" && b.status === "played") return -1;
          if (a.status === "played" && b.status === "pending") return 1;
          return b.votes - a.votes;
        })
      );
    }
  };

  const updateCooldown = () => {
    const last = Number(localStorage.getItem("lastRequestTime") || "0");
    setCooldownLeft(Math.max(0, COOLDOWN_MS - (Date.now() - last)));
  };

  useEffect(() => {
    fetchSongs();
    updateCooldown();

    const timer = setInterval(updateCooldown, 1000);

    const channel = supabase
      .channel("songs-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "songs" }, fetchSongs)
      .subscribe();

    return () => {
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, []);

  const addSong = async () => {
    const cleanInput = input.trim();

    if (!cleanInput) {
      setMessage("Önce şarkı adı veya link yaz 🎵");
      return;
    }

    const last = Number(localStorage.getItem("lastRequestTime") || "0");

    if (Date.now() - last < COOLDOWN_MS) {
      setMessage("Yeni şarkı göndermek için biraz bekle ⏳");
      return;
    }

    const { data: existing } = await supabase
      .from("songs")
      .select("*")
      .ilike("name", cleanInput)
      .maybeSingle();

    if (existing) {
      setMessage("Bu şarkı zaten listede. 👍 ile oy verebilirsin.");
      return;
    }

    await supabase.from("songs").insert([{ name: cleanInput, votes: 1, status: "pending" }]);

    localStorage.setItem("lastRequestTime", String(Date.now()));
    setMessage("Şarkın sıraya alındı 🎧");
    setInput("");
    updateCooldown();
    fetchSongs();
  };

  const voteSong = async (song: Song) => {
    const votedSongs = JSON.parse(localStorage.getItem("votedSongs") || "[]");

    if (votedSongs.includes(song.id)) {
      setMessage("Bu şarkıya zaten oy verdin 👍");
      return;
    }

    await supabase.from("songs").update({ votes: song.votes + 1 }).eq("id", song.id);

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
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        <h1
          style={{
            fontSize: 46,
            background: "linear-gradient(90deg,#ff00cc,#7c3aed,#22c55e)",
            WebkitBackgroundClip: "text",
            color: "transparent",
            marginBottom: 4,
          }}
        >
          🎧 DJ Larry Laffer
        </h1>

        <p style={{ color: "#bbb", fontSize: 16 }}>
          Şarkını gönder, kalabalık oylasın, geceyi birlikte yönetelim.
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
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Şarkı adı veya YouTube / Spotify linki"
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
            onClick={addSong}
            disabled={cooldownLeft > 0}
            style={{
              marginTop: 14,
              padding: 15,
              width: "100%",
              borderRadius: 14,
              border: "none",
              background:
                cooldownLeft > 0
                  ? "#333"
                  : "linear-gradient(90deg,#7c3aed,#22c55e)",
              color: "white",
              fontWeight: "bold",
              cursor: cooldownLeft > 0 ? "not-allowed" : "pointer",
              fontSize: 16,
            }}
          >
            {cooldownLeft > 0
              ? `Tekrar göndermek için bekle: ${minutes}:${seconds.toString().padStart(2, "0")}`
              : "Şarkı Gönder"}
          </button>

          {message && (
            <p style={{ marginTop: 14, color: "#22c55e", fontWeight: "bold" }}>
              {message}
            </p>
          )}
        </div>

        <div style={{ marginTop: 34 }}>
          <h2>🔥 Canlı İstekler</h2>

          {songs.length === 0 && <p style={{ color: "#777" }}>Henüz istek yok.</p>}

          {songs.map((song, index) => {
            const linkInfo = getLinkInfo(song.name);

            return (
              <div
                key={song.id}
                style={{
                  marginTop: 12,
                  padding: 16,
                  borderRadius: 16,
                  background:
                    song.status === "played"
                      ? "#0b0b0b"
                      : index === 0
                      ? "linear-gradient(90deg,#231942,#111)"
                      : "#111",
                  border: index === 0 ? "1px solid #7c3aed" : "1px solid #333",
                  opacity: song.status === "played" ? 0.55 : 1,
                }}
              >
                <div style={{ fontWeight: "bold" }}>
                  {linkInfo ? (
                    <a href={song.name} target="_blank" rel="noopener noreferrer" style={{ color: "white" }}>
                      {linkInfo.emoji} {linkInfo.label} isteği
                    </a>
                  ) : (
                    <>🎵 {song.name}</>
                  )}

                  {song.status === "played" && <span> ✅ Çalındı</span>}
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
            );
          })}
        </div>
      </div>
    </main>
  );
}