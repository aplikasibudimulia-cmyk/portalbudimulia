-- SQL Migration: Menambahkan unique constraint pada cbt_whitelist_user
-- Agar aman dari duplikasi di level database

-- 1. Index unik untuk siswa (berdasarkan nisn dan role)
CREATE UNIQUE INDEX IF NOT EXISTS uq_cbt_whitelist_siswa 
ON public.cbt_whitelist_user (nisn, role) 
WHERE nisn IS NOT NULL;

-- 2. Index unik untuk guru (berdasarkan user_id dan role)
CREATE UNIQUE INDEX IF NOT EXISTS uq_cbt_whitelist_guru 
ON public.cbt_whitelist_user (user_id, role) 
WHERE user_id IS NOT NULL;
