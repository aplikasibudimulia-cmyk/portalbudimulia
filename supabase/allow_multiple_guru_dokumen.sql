-- Script Migration: Membuka batasan 1 file per kategori pada guru_document_uploads
-- Menghapus constraint UNIQUE (requirement_id, guru_id) agar guru bisa mengunggah lebih dari 1 file per kategori dokumen.

ALTER TABLE public.guru_document_uploads
DROP CONSTRAINT IF EXISTS guru_document_uploads_requirement_id_guru_id_key;

-- Catatan: RLS Policy tetap aktif untuk allow read/write bagi pengguna portal
