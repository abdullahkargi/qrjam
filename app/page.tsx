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
};

const COOLDOWN_MS = 3 * 60 * 1000;

export default function Home() {
  const [input, setInput] = useState("");
  const [songs, setSongs] = useState<Song[]>([]);
  const [message, setMessage] = useState("");
  const [cooldownLeft, setCooldownLeft] = useState(0);

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

  const addSong = async () => {
    const cleanInput = input.trim();

    if (cleanInput === "") {
      setMessage("Önce şarkı adı veya link yaz 🎵");
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
      .ilike("name", cleanInput)
      .maybeSingle();

    if (existing) {
      setMessage("Bu şarkı zaten listede. Yanındaki 👍 butonuyla oy verebilirsin.");
      return;
    }

    const { error } = await supabase.from("songs").insert([
      {
        name: cleanInput,
        votes: 1,
        status: "pending",
      },
    ]);

    if (error) {
      console.log("EKLEME HATASI:", error);
      setMessage("Bir hata oldu, tekrar dene.");
      return;
    }

    localStorage.setItem("lastRequestTime", String(now));
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
          "radial-gradient(circle at top, rgba(124,58,237,0.35), transparent 35%), #050505",
        color: "white",
        padding: 30,
        textAlign: "center",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <h1
        style={{
          fontSize: 44,
          marginBottom: 5,
          background: "linear-gradient(90deg,#ff00cc,#7c3aed,#22c55e)",
          WebkitBackgroundClip: "text",
          color: "transparent",
        }}
      >
        🎧 QRJam
      </h1>

      <p style={{ color: "#aaa" }}>Şarkını gönder, geceye yön ver.</p>

      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Şarkı adı veya link"
        style={{
          padding: 14,
          marginTop: 25,
          width: "90%",
          maxWidth: 420,
          borderRadius: 12,
          border: "1px solid #333",
          background: "#111",
          color: "white",
          outline: "none",
        }}
      />

      <br />

      <button
        onClick={addSong}
        disabled={cooldownLeft > 0}
        style={{
          marginTop: 18,
          padding: 13,
          width: "90%",
          maxWidth: 420,
          borderRadius: 12,
          border: "none",
          background:
            cooldownLeft > 0
              ? "#333"
              : "linear-gradient(90deg,#7c3aed,#6d28d9)",
          color: "white",
          fontWeight: "bold",
          cursor: cooldownLeft > 0 ? "not-allowed" : "pointer",
        }}
      >
        {cooldownLeft > 0
          ? `Bekle: ${minutes}:${seconds.toString().padStart(2, "0")}`
          : "Gönder"}
      </button>

      {message && (
        <p style={{ marginTop: 18, color: "#22c55e", fontWeight: "bold" }}>
          {message}
        </p>
      )}

      <div style={{ marginTop: 40 }}>
        <h2>İstekler</h2>

        {songs.length === 0 && <p style={{ color: "#777" }}>Henüz istek yok.</p>}

        {songs.map((song) => (
          <div
            key={song.id}
            style={{
              marginTop: 12,
              padding: 15,
              borderRadius: 14,
              background: "#111",
              border: "1px solid #333",
            }}
          >
            <div>
              🎵 {song.name}
              {song.status === "played" && <span> ✅ Çalındı</span>}
            </div>

            <button
              onClick={() => voteSong(song)}
              disabled={song.status === "played"}
              style={{
                marginTop: 10,
                padding: "8px 12px",
                borderRadius: 10,
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
    </main>
  );
}