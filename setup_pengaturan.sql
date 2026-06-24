create table if not exists public.pengaturan_sekolah (
  id serial primary key,
  setting_key text unique not null,
  setting_value text,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

insert into public.pengaturan_sekolah (setting_key, setting_value)
values 
('tema_warna', 'indigo'),
('pengumuman_teks', 'Selamat datang di Sistem Informasi Kelulusan SMP Budi Mulia Jakarta.')
on conflict (setting_key) do nothing;
