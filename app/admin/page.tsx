"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

const PASSWORD = "qrjam2026";

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

export default function AdminPage() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [nowPlaying, setNowPlaying] = useState<Song | null>(null);
  const [password, setPassword] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [newSongId, setNewSongId] = useState<number | null>(null);

  const previousIds = useRef<number[]>([]);

  const fetchSongs = async () => {
    const { data, error } = await supabase
      .from("songs")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) return;

    if (data) {
      const currentIds = data.map((song) => song.id);
      const newItem = data.find(
        (song) =>
          !previousIds.current.includes(song.id) && song.status === "pending"
      );

      if (previousIds.current.length > 0 && newItem) {
        setNewSongId(newItem.id);
        setTimeout(() => setNewSongId(null), 3000);
      }

      previousIds.current = currentIds;
      setSongs(data);

      const latestPlayed = data
        .filter((s) => s.status === "played" && s.played_at)
        .sort(
          (a, b) =>
            new Date(b.played_at || "").getTime() -
            new Date(a.played_at || "").getTime()
        )[0];

      setNowPlaying(latestPlayed || null);
    }
  };

  useEffect(() => {
    fetchSongs();

    const channel = supabase
      .channel("admin-realtime")
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

  const markPlayed = async (song: Song) => {
    const playedAt = new Date().toISOString();

    const updatedSong: Song = {
      ...song,
      status: "played",
      played_at: playedAt,
    };

    setNowPlaying(updatedSong);

    setSongs((currentSongs) =>
      currentSongs.map((item) => (item.id === song.id ? updatedSong : item))
    );

    await supabase
      .from("songs")
      .update({
        status: "played",
        played_at: playedAt,
      })
      .eq("id", song.id);

    fetchSongs();
  };

  const undoPlayed = async (song: Song) => {
    await supabase
      .from("songs")
      .update({
        status: "pending",
        played_at: null,
      })
      .eq("id", song.id);

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
    setSongs([]);
    setNowPlaying(null);
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
          <h2>🔒 DJ Barkın Girişi</h2>

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

  const playedSongs = songs
    .filter((s) => s.status === "played")
    .sort(
      (a, b) =>
        new Date(b.played_at || "").getTime() -
        new Date(a.played_at || "").getTime()
    );

  const maxVotes =
    songs.length > 0 ? Math.max(...songs.map((song) => song.votes)) : 0;

  const SongCard = ({
    song,
    index,
    isNew,
    compact = false,
  }: {
    song: Song;
    index?: number;
    isNew?: boolean;
    compact?: boolean;
  }) => (
    <div
      style={{
        marginTop: 14,
        padding: compact ? 12 : index !== undefined && index < 3 ? 22 : 16,
        fontSize: compact ? 14 : index !== undefined && index < 3 ? 20 : 16,
        background: isNew
          ? "linear-gradient(90deg,#7c3aed,#16a34a)"
          : index === 0
          ? "linear-gradient(90deg,#231942,#151515)"
          : "#151515",
        borderRadius: 16,
        border: isNew
          ? "2px solid #22c55e"
          : index === 0
          ? "1px solid #7c3aed"
          : "1px solid #2a2a2a",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 15,
        boxShadow: isNew
          ? "0 0 35px rgba(34,197,94,0.9)"
          : index === 0
          ? "0 0 22px rgba(124,58,237,0.35)"
          : "none",
        transform: isNew ? "scale(1.03)" : "scale(1)",
        transition: "all 0.3s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {song.thumbnail && (
          <img
            src={song.thumbnail}
            alt={song.name}
            style={{
              width: compact ? 70 : 96,
              height: compact ? 52 : 72,
              objectFit: "cover",
              borderRadius: 12,
            }}
          />
        )}

        <div>
          <strong>
            {isNew ? "🆕 " : ""}
            {index !== undefined ? `${index + 1}. ` : ""}
            {song.youtube_url ? (
              <a
                href={song.youtube_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "white", textDecoration: "none" }}
              >
                ▶️ {song.name}
              </a>
            ) : (
              <>🎵 {song.name}</>
            )}
          </strong>

          {song.youtube_channel && (
            <div style={{ color: "#aaa", marginTop: 4 }}>
              {song.youtube_channel}
            </div>
          )}

          <div style={{ color: "#aaa", marginTop: 6 }}>👍 {song.votes} oy</div>
        </div>
      </div>

      {!compact && (
        <div>
          <button
            onClick={() => markPlayed(song)}
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
      )}

      {compact && (
        <button
          onClick={() => undoPlayed(song)}
          style={{
            padding: "8px 12px",
            background: "#333",
            color: "white",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          Geri Al
        </button>
      )}
    </div>
  );

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
        🎧 DJ Barkın Falakacılar
      </h1>

      <p style={{ color: "#aaa" }}>YouTube istekleri canlı yönetim paneli</p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 14,
          marginTop: 24,
        }}
      >
        <div style={{ padding: 16, background: "#111", border: "1px solid #333", borderRadius: 14 }}>
          <div style={{ color: "#aaa" }}>Toplam İstek</div>
          <strong style={{ fontSize: 26 }}>{songs.length}</strong>
        </div>

        <div style={{ padding: 16, background: "#111", border: "1px solid #333", borderRadius: 14 }}>
          <div style={{ color: "#aaa" }}>Bekleyen</div>
          <strong style={{ fontSize: 26 }}>{pendingSongs.length}</strong>
        </div>

        <div style={{ padding: 16, background: "#111", border: "1px solid #333", borderRadius: 14 }}>
          <div style={{ color: "#aaa" }}>Çalınan</div>
          <strong style={{ fontSize: 26 }}>{playedSongs.length}</strong>
        </div>

        <div style={{ padding: 16, background: "#111", border: "1px solid #333", borderRadius: 14 }}>
          <div style={{ color: "#aaa" }}>En Çok Oy</div>
          <strong style={{ fontSize: 26 }}>{maxVotes}</strong>
        </div>
      </div>

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
          <SongCard song={nowPlaying} compact />
        ) : (
          <p style={{ color: "#777" }}>Henüz çalan şarkı yok.</p>
        )}
      </section>

      <div
        style={{
          marginTop: 40,
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gap: 24,
          alignItems: "start",
        }}
      >
        <section>
          <h2 style={{ color: "#a78bfa" }}>⏭️ Sıradakiler</h2>

          {pendingSongs.length === 0 && (
            <p style={{ color: "#777" }}>Bekleyen istek yok.</p>
          )}

          {pendingSongs.map((song, index) => (
            <SongCard
              key={song.id}
              song={song}
              index={index}
              isNew={song.id === newSongId}
            />
          ))}
        </section>

        <section>
          <h2 style={{ color: "#f472b6" }}>✅ Çalınan Geçmişi</h2>

          {playedSongs.length === 0 && (
            <p style={{ color: "#777" }}>Henüz çalınan yok.</p>
          )}

          {playedSongs.map((song) => (
            <SongCard key={song.id} song={song} compact />
          ))}
        </section>
      </div>
    </main>
  );
}