alter table public.songs
  add column if not exists song_message text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'songs_song_message_length_check'
  ) then
    alter table public.songs
      add constraint songs_song_message_length_check
      check (song_message is null or char_length(song_message) <= 80);
  end if;
end $$;

insert into public.settings (key, value)
select 'allow_song_messages', 'true'
where not exists (
  select 1
  from public.settings
  where key = 'allow_song_messages'
);
