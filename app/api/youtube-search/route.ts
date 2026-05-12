import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");

  if (!query) {
    return NextResponse.json({ videos: [] });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  console.log("KEY:", process.env.YOUTUBE_API_KEY);

  if (!apiKey) {
    return NextResponse.json(
      { error: "YouTube API key bulunamadı." },
      { status: 500 }
    );
  }

  const url =
    `https://www.googleapis.com/youtube/v3/search` +
    `?part=snippet` +
    `&type=video` +
    `&maxResults=6` +
    `&safeSearch=strict` +
    `&q=${encodeURIComponent(query + " official audio music")}` +
    `&key=${apiKey}`;

  const response = await fetch(url);
  const data = await response.json();

  const videos =
    data.items?.map((item: any) => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      channel: item.snippet.channelTitle,
      thumbnail: item.snippet.thumbnails.medium?.url,
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
    })) || [];

  return NextResponse.json({ videos });
}