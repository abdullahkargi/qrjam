"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

const PASSWORD = "qrjam2026";

type Song = {
  id: number;
  name: string;
  votes: number;
  status: string;
};

export default function AdminPage() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [password, setPassword] = useState("");
  const [authorized, setAuthorized] = useState(false);

  const fetchSongs = async () => {
    const { data } = await supabase
      .from("songs")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (data) setSongs(data);
  };

  useEffect(() => {
    fetchSongs();

    const channel = supabase
      .channel("admin-songs-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "songs" },
        () => fetchSongs()
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

  if (!authorized) {
    return (
      <main style={{ padding: 40, textAlign: "center" }}>
        <h1>🔒 DJ Girişi</h1>

        <input
          type="password"
          placeholder="Şifre"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ padding: 10, marginTop: 20 }}
        />

        <br />

        <button onClick={handleLogin} style={{ marginTop: 20, padding: 10 }}>
          Giriş Yap
        </button>
      </main>
    );
  }

  return (
    <main style={{ padding: 40 }}>
      <h1>🎧 QRJam DJ Panel</h1>
      <p>Gelen şarkı isteklerini buradan yönet.</p>

      <button
        onClick={resetNight}
        style={{
          marginTop: 20,
          padding: 10,
          backgroundColor: "red",
          color: "white",
          borderRadius: 8,
        }}
      >
        🔥 Geceyi Sıfırla
      </button>

      <div style={{ marginTop: 30 }}>
        {songs.map((song) => (
          <div
            key={song.id}
            style={{
              padding: 15,
              marginBottom: 12,
              border: "1px solid #333",
              borderRadius: 10,
            }}
          >
            <strong>🎵 {song.name}</strong>
            <p>👍 Oy: {song.votes}</p>
            <p>Durum: {song.status}</p>

            <button onClick={() => markPlayed(song.id)}>Çalındı</button>

            <button
              onClick={() => deleteSong(song.id)}
              style={{ marginLeft: 10 }}
            >
              Sil
            </button>
          </div>
        ))}
      </div>
    </main>
  );
}