"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

type Song = {
  id: number;
  name: string;
  votes: number;
  status: string;
};

export default function Home() {
  const [input, setInput] = useState("");
  const [songs, setSongs] = useState<Song[]>([]);

  // 🔹 Şarkıları çek
  const fetchSongs = async () => {
  const { data, error } = await supabase
    .from("songs")
    .select("*");

  if (error) {
    console.log("HATA:", error);
    return;
  }

  if (data) {
    const sorted = data.sort((a, b) => {
      // pending olanlar üstte
      if (a.status === "pending" && b.status === "played") return -1;
      if (a.status === "played" && b.status === "pending") return 1;

      // ikisi de pending ise oyuna göre sırala
      return b.votes - a.votes;
    });

    setSongs(sorted);
  }
};

useEffect(() => {
  fetchSongs();

  const channel = supabase
    .channel("songs-realtime")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "songs",
      },
      () => {
        fetchSongs();
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, []);
  // 🔹 Şarkı ekle / oy ver
  const addSong = async () => {
    if (input.trim() === "") return;

    const { data: existing } = await supabase
      .from("songs")
      .select("*")
      .ilike("name", input)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("songs")
        .update({ votes: existing.votes + 1 })
        .eq("id", existing.id);
    } else {
      await supabase
        .from("songs")
       .insert([{ name: input, votes: 1, status: "pending" }]);
    }

    setInput("");
    fetchSongs();
  };

  return (
    <main style={{ padding: 40, textAlign: "center" }}>
      <h1>🎧 QRJam</h1>
      <p>Tara. İste. Hisset.</p>

      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Şarkı adı veya link"
        style={{ padding: 10, marginTop: 20, width: 300 }}
      />

      <br />

      <button
        onClick={addSong}
        style={{ marginTop: 20, padding: 10 }}
      >
        Gönder
      </button>

      <div style={{ marginTop: 40 }}>
        <h2>İstekler</h2>

{songs.map((song) => (
  <div key={song.id} style={{ marginTop: 10 }}>
    🎵 {song.name} — 👍 {song.votes}
    {song.status === "played" && (
      <span style={{ marginLeft: 10 }}>
        ✅ Çalındı
      </span>
    )}
  </div>
))}
      </div>
    </main>
  );
}