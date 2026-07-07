-- Migration: Tambahkan akses_level ke tabel role_fitur untuk mendukung akses 3-level (Nonaktif, Read Only, Edit Penuh)
ALTER TABLE public.role_fitur 
ADD COLUMN IF NOT EXISTS akses_level TEXT NOT NULL DEFAULT 'edit' 
CHECK (akses_level IN ('read', 'edit'));
