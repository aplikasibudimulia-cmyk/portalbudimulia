-- Migration: Add akses_level to role_fitur table
ALTER TABLE role_fitur 
ADD COLUMN IF NOT EXISTS akses_level TEXT NOT NULL DEFAULT 'edit' 
CHECK (akses_level IN ('read', 'edit'));
