alter table public.songs
  add column if not exists device_id text;

create index if not exists songs_device_id_idx
  on public.songs (device_id);
