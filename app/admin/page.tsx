"use client";
import { useEffect, useRef, useState } from "react";
import QRCode from "react-qr-code";
import { supabase } from "../../lib/supabase";
import {
  AppSettings,
  defaultSettings,
  getSettings,
  updateSetting,
} from "../../lib/settings";

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
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const previousIds = useRef<number[]>([]);
  const customerUrl = "https://qrjam.vercel.app";

  const loadSettings = async () => {
    const loadedSettings = await getSettings();
    setSettings(loadedSettings);
  };

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

      if (
        previousIds.current.length > 0 &&
        newItem &&
        settings.new_request_animation === "true"
      ) {
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
    loadSettings();
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
    if (password === settings.admin_password) {
      setAuthorized(true);
    } else {
      alert("Yanlış şifre");
    }
  };

  const saveSetting = async (key: keyof AppSettings, value: string) => {
    setSettings((old) => ({ ...old, [key]: value }));
    await updateSetting(key, value);
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

    if (settings.clear_history_on_reset === "true") {
      await supabase.from("songs").delete().neq("id", 0);
    } else {
      await supabase.from("songs").delete().eq("status", "pending");
    }

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

  const copyCustomerLink = async () => {
    try {
      await navigator.clipboard.writeText(customerUrl);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = customerUrl;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }

    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 1800);
  };

  const downloadQrPng = () => {
    const svg = document.getElementById("customer-qr-code");
    if (!(svg instanceof SVGSVGElement)) return;

    const serializer = new XMLSerializer();
    const svgBlob = new Blob([serializer.serializeToString(svg)], {
      type: "image/svg+xml;charset=utf-8",
    });
    const objectUrl = URL.createObjectURL(svgBlob);
    const image = new Image();

    image.onload = () => {
      const canvas = document.createElement("canvas");
      const size = 1024;
      const padding = 96;
      canvas.width = size;
      canvas.height = size;

      const context = canvas.getContext("2d");
      if (!context) {
        URL.revokeObjectURL(objectUrl);
        return;
      }

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, size, size);
      context.drawImage(
        image,
        padding,
        padding,
        size - padding * 2,
        size - padding * 2
      );

      URL.revokeObjectURL(objectUrl);

      const pngUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = pngUrl;
      link.download = "qrjam-musteri-qr.png";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    image.onerror = () => URL.revokeObjectURL(objectUrl);
    image.src = objectUrl;
  };

  const getThemeBackground = () => {
    if (settings.theme_color === "green") {
      return "radial-gradient(circle at top, rgba(34,197,94,0.35), transparent 35%), radial-gradient(circle at bottom right, rgba(124,58,237,0.25), transparent 35%), #050505";
    }

    if (settings.theme_color === "gold") {
      return "radial-gradient(circle at top, rgba(245,158,11,0.35), transparent 35%), radial-gradient(circle at bottom right, rgba(255,0,200,0.20), transparent 35%), #050505";
    }

    if (settings.theme_color === "red") {
      return "radial-gradient(circle at top, rgba(239,68,68,0.35), transparent 35%), radial-gradient(circle at bottom right, rgba(124,58,237,0.25), transparent 35%), #050505";
    }

    return "radial-gradient(circle at top, rgba(124,58,237,0.35), transparent 35%), radial-gradient(circle at bottom right, rgba(34,197,94,0.25), transparent 35%), #050505";
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
          <h2>🔒 Admin Girişi</h2>

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
        background: getThemeBackground(),
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
            marginRight: 10,
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

        <button
          onClick={() => setShowSettings(!showSettings)}
          style={{
            padding: "10px 14px",
            background: "#222",
            color: "white",
            border: "1px solid #444",
            borderRadius: 10,
            cursor: "pointer",
          }}
        >
          ⚙️ Ayarlar
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
        🎧 {settings.dj_name}
      </h1>

      <p style={{ color: "#aaa" }}>{settings.welcome_message}</p>

      {settings.logo_url && (
        <img
          src={settings.logo_url}
          alt="DJ Logo"
          style={{
            width: 110,
            height: 110,
            objectFit: "cover",
            borderRadius: 20,
            marginTop: 15,
            border: "1px solid #333",
          }}
        />
      )}

      {showSettings && (
        <section
          style={{
            marginTop: 25,
            padding: 24,
            background: "linear-gradient(135deg,#111,#181818)",
            border: "1px solid #333",
            borderRadius: 22,
            boxShadow: "0 0 30px rgba(124,58,237,0.25)",
          }}
        >
          <h2 style={{ marginBottom: 6, fontSize: 28 }}>⚙️ Panel Ayarları</h2>

          <p style={{ color: "#aaa", marginBottom: 22 }}>
            DJ adı, şifre, tema ve istek kurallarını buradan yönet.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 16,
            }}
          >
            {Object.entries(settings).map(([key, value]) => (
              <div
                key={key}
                style={{
                  padding: 16,
                  background: "#0b0b0b",
                  border: "1px solid #2a2a2a",
                  borderRadius: 16,
                }}
              >
                <label
                  style={{
                    display: "block",
                    color: "#a78bfa",
                    marginBottom: 8,
                    fontWeight: "bold",
                    textTransform: "uppercase",
                    fontSize: 12,
                    letterSpacing: 0.5,
                  }}
                >
                  {key}
                </label>

{key === "blacklist" ? (
  <textarea
    value={value}
    onChange={(e) =>
      setSettings((old) => ({
        ...old,
        [key]: e.target.value,
      }))
    }
    
    style={{
      width: "100%",
      minHeight: 90,
      padding: 12,
      background: "#050505",
      color: "white",
      border: "1px solid #333",
      borderRadius: 12,
      resize: "vertical",
    }}
  />
) : key === "theme_color" ? (
  <select
    value={value}
    onChange={(e) => {
      setSettings((old) => ({
        ...old,
        [key]: e.target.value,
      }));
      saveSetting(key as keyof AppSettings, e.target.value);
    }}
    style={{
      width: "100%",
      padding: 12,
      background: "#050505",
      color: "white",
      border: "1px solid #333",
      borderRadius: 12,
    }}
  >
    <option value="purple">Mor Neon</option>
    <option value="green">Yeşil Neon</option>
    <option value="gold">Gold</option>
    <option value="red">Kırmızı</option>
  </select>
) : key === "safe_search" ? (
  <select
    value={value}
    onChange={(e) => {
      setSettings((old) => ({
        ...old,
        [key]: e.target.value,
      }));
      saveSetting(key as keyof AppSettings, e.target.value);
    }}
    style={{
      width: "100%",
      padding: 12,
      background: "#050505",
      color: "white",
      border: "1px solid #333",
      borderRadius: 12,
    }}
  >
    <option value="strict">Strict</option>
    <option value="moderate">Moderate</option>
    <option value="none">None</option>
  </select>
) : value === "true" || value === "false" ? (
  <select
    value={value}
    onChange={(e) => {
      setSettings((old) => ({
        ...old,
        [key]: e.target.value,
      }));
      saveSetting(key as keyof AppSettings, e.target.value);
    }}
    style={{
      width: "100%",
      padding: 12,
      background: "#050505",
      color: "white",
      border: "1px solid #333",
      borderRadius: 12,
    }}
  >
    <option value="true">Açık</option>
    <option value="false">Kapalı</option>
  </select>
) : (
  <input
    value={value}
    onChange={(e) =>
      setSettings((old) => ({
        ...old,
        [key]: e.target.value,
      }))
    }
    
    style={{
      width: "100%",
      padding: 12,
      background: "#050505",
      color: "white",
      border: "1px solid #333",
      borderRadius: 12,
    }}
  />
)}

                <small style={{ color: "#777", display: "block", marginTop: 8 }}>
                  {key === "dj_name" && "DJ adı"}
                  {key === "admin_password" && "Admin giriş şifresi"}
                  {key === "cooldown" && "180 = 3 dakika"}
                  {key === "theme_color" && "purple / green / gold / red"}
                  {key === "blacklist" && "Virgülle ayır"}
                  {key === "welcome_message" && "Karşılama mesajı"}
                  {key === "voting_enabled" && "true / false"}
                  {key === "youtube_enabled" && "YouTube açık mı"}
                  {key === "allow_duplicate_songs" && "Aynı şarkı tekrar"}
                  {key === "allow_multi_vote" && "Çoklu oy"}
                  {key === "new_request_animation" && "Yeni istek efekti"}
                  {key === "logo_url" && "Logo linki"}
                  {key === "daily_request_limit" && "Günlük limit"}
                  {key === "clear_history_on_reset" && "Geçmiş de silinsin"}
                  {key === "safe_search" && "strict önerilir"}
                </small>
              </div>
            ))}
          </div>

<button
  onClick={async () => {
    for (const [key, value] of Object.entries(settings)) {
      await saveSetting(key as keyof AppSettings, value);
    }

await loadSettings();
alert("Ayarlar kaydedildi ✅");
  }}
  style={{
    marginTop: 22,
    padding: "14px 18px",
    width: "100%",
    background: "linear-gradient(90deg,#16a34a,#22c55e)",
    color: "white",
    border: "none",
    borderRadius: 14,
    fontWeight: "bold",
    cursor: "pointer",
    fontSize: 16,
  }}
>
  💾 Kaydet ve Sayfayı Yenile
</button>
        </section>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 14,
          marginTop: 24,
        }}
      >
        <div
          style={{
            padding: 16,
            background: "#111",
            border: "1px solid #333",
            borderRadius: 14,
          }}
        >
          <div style={{ color: "#aaa" }}>Toplam İstek</div>
          <strong style={{ fontSize: 26 }}>{songs.length}</strong>
        </div>

        <div
          style={{
            padding: 16,
            background: "#111",
            border: "1px solid #333",
            borderRadius: 14,
          }}
        >
          <div style={{ color: "#aaa" }}>Bekleyen</div>
          <strong style={{ fontSize: 26 }}>{pendingSongs.length}</strong>
        </div>

        <div
          style={{
            padding: 16,
            background: "#111",
            border: "1px solid #333",
            borderRadius: 14,
          }}
        >
          <div style={{ color: "#aaa" }}>Çalınan</div>
          <strong style={{ fontSize: 26 }}>{playedSongs.length}</strong>
        </div>

        <div
          style={{
            padding: 16,
            background: "#111",
            border: "1px solid #333",
            borderRadius: 14,
          }}
        >
          <div style={{ color: "#aaa" }}>En Çok Oy</div>
          <strong style={{ fontSize: 26 }}>{maxVotes}</strong>
        </div>
      </div>

      <section
        style={{
          marginTop: 28,
          padding: 26,
          background:
            "linear-gradient(135deg,rgba(17,17,17,0.96),rgba(31,31,31,0.94))",
          borderRadius: 20,
          border: "1px solid rgba(167,139,250,0.35)",
          boxShadow:
            "0 0 34px rgba(124,58,237,0.28), inset 0 0 28px rgba(34,197,94,0.04)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "260px 1fr",
            gap: 26,
            alignItems: "center",
          }}
        >
          <div
            style={{
              padding: 18,
              background: "#fff",
              borderRadius: 18,
              boxShadow: "0 0 28px rgba(34,197,94,0.35)",
            }}
          >
            <QRCode
              id="customer-qr-code"
              value={customerUrl}
              size={224}
              level="H"
              bgColor="#ffffff"
              fgColor="#050505"
              style={{
                display: "block",
                height: "auto",
                maxWidth: "100%",
                width: "100%",
              }}
              viewBox="0 0 256 256"
            />
          </div>

          <div>
            <h2
              style={{
                margin: 0,
                color: "#a78bfa",
                fontSize: 28,
              }}
            >
              QR Code Generator
            </h2>

            <div
              style={{
                marginTop: 14,
                padding: 14,
                background: "#090909",
                border: "1px solid #2a2a2a",
                borderRadius: 14,
                color: "#e5e7eb",
                wordBreak: "break-all",
              }}
            >
              {customerUrl}
            </div>

            <div
              style={{
                display: "flex",
                gap: 12,
                flexWrap: "wrap",
                marginTop: 18,
              }}
            >
              <button
                onClick={downloadQrPng}
                style={{
                  padding: "13px 17px",
                  background: "linear-gradient(90deg,#7c3aed,#22c55e)",
                  color: "white",
                  border: "none",
                  borderRadius: 12,
                  fontWeight: "bold",
                  cursor: "pointer",
                  boxShadow: "0 0 18px rgba(124,58,237,0.35)",
                }}
              >
                QR İndir (PNG)
              </button>

              <button
                onClick={copyCustomerLink}
                style={{
                  padding: "13px 17px",
                  background: copiedLink
                    ? "linear-gradient(90deg,#16a34a,#22c55e)"
                    : "#181818",
                  color: "white",
                  border: copiedLink
                    ? "1px solid #22c55e"
                    : "1px solid #444",
                  borderRadius: 12,
                  fontWeight: "bold",
                  cursor: "pointer",
                }}
              >
                {copiedLink ? "Kopyalandı" : "Linki Kopyala"}
              </button>
            </div>
          </div>
        </div>
      </section>

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
        <h2 style={{ color: "#22c55e", marginBottom: 12 }}>
  🔥 En Son Çalan
</h2>
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
