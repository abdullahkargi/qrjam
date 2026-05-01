"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

const PASSWORD = "qrjam2026";

type Song = {
  id: number;
  name: string;
  votes: number;
  status: string;
  created_at?: string;
};

export default function AdminPage() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [password, setPassword] = useState("");
  const [authorized, setAuthorized] = useState(false);

  const fetchSongs = async () => {
    const { data, error } = await supabase
      .from("songs")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.log("HATA:", error);
      return;
    }

    if (data) setSongs(data);
  };

  useEffect(() => {
    fetchSongs();

    const channel = supabase
      .channel("admin-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "songs" },
        () => {
          fetchSongs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleLogin = () => {
    if (password === PASSWORD) {
      setAuthorized(true);
    } else {
      alert("Yanlış şifre");
    }
  };

  const markPlayed = async (id: number) => {
    await supabase.from("songs").update({ status: "played" }).eq("id", id);
    fetchSongs();
  };

  const deleteSong = async (id: number) => {
    await supabase.from("songs").delete().eq("id", id);
    fetchSongs();
  };

  const resetNight = async () => {
    const confirmReset = confirm("Tüm şarkılar silinsin mi?");
    if (!confirmReset) return;

    await supabase.from("songs").delete().neq("id", 0);
    fetchSongs();
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  if (!authorized) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "radial-gradient(circle, #111, #000)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            padding: 30,
            borderRadius: 20,
            background: "#111",
            width: 320,
            textAlign: "center",
            boxShadow: "0 0 30px rgba(124,58,237,0.6)",
            border: "1px solid #333",
          }}
        >
          <h2>🔒 DJ Larry Girişi</h2>

          <input
            type="password"
            placeholder="Şifre"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleLogin();
            }}
            style={{
              width: "100%",
              padding: 12,
              marginTop: 20,
              borderRadius: 10,
              border: "1px solid #333",
              background: "#000",
              color: "white",
            }}
          />

          <button
            onClick={handleLogin}
            style={{
              marginTop: 20,
              padding: 12,
              width: "100%",
              background: "linear-gradient(90deg,#7c3aed,#22c55e)",
              color: "white",
              border: "none",
              borderRadius: 10,
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            Giriş
          </button>
        </div>
      </main>
    );
  }

  const pendingSongs = songs
    .filter((s) => s.status === "pending")
    .sort((a, b) => b.votes - a.votes);

  const playedSongs = songs.filter((s) => s.status === "played");
  const nowPlaying = playedSongs.sort((a, b) => b.id - a.id)[0];

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top, rgba(124,58,237,0.35), transparent 35%), radial-gradient(circle at bottom right, rgba(34,197,94,0.25), transparent 35%), #050505",
        color: "white",
        padding: 30,
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div style={{ position: "fixed", top: 20, right: 20, zIndex: 10 }}>
        <button
          onClick={toggleFullscreen}
          style={{
            marginRight: 10,
            padding: "10px 14px",
            background: "#181818",
            color: "white",
            border: "1px solid #444",
            borderRadius: 10,
            cursor: "pointer",
          }}
        >
          ⛶ Fullscreen
        </button>

        <button
          onClick={resetNight}
          style={{
            padding: "10px 14px",
            background: "linear-gradient(90deg,#991b1b,#ef4444)",
            color: "white",
            border: "none",
            borderRadius: 10,
            fontWeight: "bold",
            cursor: "pointer",
          }}
        >
          🔥 Geceyi Sıfırla
        </button>
      </div>

      <h1
        style={{
          fontSize: 42,
          marginBottom: 5,
          background: "linear-gradient(90deg,#ff00cc,#7c3aed,#22c55e)",
          WebkitBackgroundClip: "text",
          color: "transparent",
        }}
      >
        🎧 DJ Larry Laffer
      </h1>

      <p style={{ color: "#aaa" }}>QRJam canlı istek paneli</p>

      <section
        style={{
          marginTop: 35,
          padding: 28,
          background: "linear-gradient(135deg,#111,#1f1f1f)",
          borderRadius: 20,
          border: "1px solid #333",
          boxShadow: "0 0 35px rgba(255,0,200,0.25)",
        }}
      >
        <h2 style={{ color: "#22c55e", marginBottom: 12 }}>🔥 Şu An Çalan</h2>

        {nowPlaying ? (
          <div style={{ fontSize: 32, fontWeight: "bold" }}>
            🎵 {nowPlaying.name}
          </div>
        ) : (
          <p style={{ color: "#777" }}>Henüz çalan şarkı yok.</p>
        )}
      </section>

      <section style={{ marginTop: 40 }}>
        <h2 style={{ color: "#a78bfa" }}>⏭️ Sıradakiler</h2>

        {pendingSongs.length === 0 && (
          <p style={{ color: "#777" }}>Bekleyen istek yok.</p>
        )}

        {pendingSongs.map((song, index) => (
          <div
            key={song.id}
            style={{
              marginTop: 14,
              padding: index < 3 ? 22 : 16,
              fontSize: index < 3 ? 22 : 16,
              background:
                index === 0
                  ? "linear-gradient(90deg,#231942,#151515)"
                  : "#151515",
              borderRadius: 16,
              border: index === 0 ? "1px solid #7c3aed" : "1px solid #2a2a2a",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 15,
              boxShadow:
                index === 0 ? "0 0 22px rgba(124,58,237,0.35)" : "none",
            }}
          >
            <div>
              <strong>
                {index + 1}. 🎵 {song.name}
              </strong>
              <div style={{ color: "#aaa", marginTop: 6 }}>
                👍 {song.votes} oy
              </div>
            </div>

            <div>
              <button
                onClick={() => markPlayed(song.id)}
                style={{
                  padding: "10px 15px",
                  background: "linear-gradient(90deg,#16a34a,#22c55e)",
                  color: "white",
                  border: "none",
                  borderRadius: 10,
                  fontWeight: "bold",
                  cursor: "pointer",
                }}
              >
                Çal
              </button>

              <button
                onClick={() => deleteSong(song.id)}
                style={{
                  marginLeft: 10,
                  padding: "10px 15px",
                  background: "linear-gradient(90deg,#dc2626,#ef4444)",
                  color: "white",
                  border: "none",
                  borderRadius: 10,
                  fontWeight: "bold",
                  cursor: "pointer",
                }}
              >
                Sil
              </button>
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}