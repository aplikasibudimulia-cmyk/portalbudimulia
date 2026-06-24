-- ========== TABEL GURU ==========
CREATE TABLE guru (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  kode TEXT NOT NULL UNIQUE,
  nama_guru TEXT NOT NULL,
  user_name TEXT NOT NULL UNIQUE,
  kode_akses TEXT NOT NULL,
  foto_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ========== TABEL ROLES ==========
CREATE TABLE roles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nama TEXT NOT NULL UNIQUE,
  deskripsi TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ========== GURU ↔ ROLE (many-to-many) ==========
CREATE TABLE guru_role (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  guru_id UUID REFERENCES guru(id) ON DELETE CASCADE,
  role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
  UNIQUE(guru_id, role_id)
);

-- ========== GURU ↔ KELAS (per tahun ajaran) ==========
CREATE TABLE guru_kelas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  guru_id UUID REFERENCES guru(id) ON DELETE CASCADE,
  kelas TEXT NOT NULL,
  tahun_ajaran_id UUID REFERENCES tahun_ajaran(id) ON DELETE CASCADE,
  UNIQUE(guru_id, kelas, tahun_ajaran_id)
);

-- ========== FITUR PER ROLE ==========
CREATE TABLE role_fitur (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
  fitur TEXT NOT NULL,
  UNIQUE(role_id, fitur)
);

-- ========== LOG AKTIVITAS ==========
CREATE TABLE activity_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  aktor TEXT NOT NULL,           
  aksi TEXT NOT NULL,            
  detail TEXT,                   
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ========== RLS POLICIES ==========
ALTER TABLE guru ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE guru_role ENABLE ROW LEVEL SECURITY;
ALTER TABLE guru_kelas ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_fitur ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all" ON guru FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON roles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON guru_role FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON guru_kelas FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON role_fitur FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON activity_log FOR ALL USING (true) WITH CHECK (true);

-- ========== INSERT DEFAULT ROLE ==========
INSERT INTO roles (nama, deskripsi) VALUES ('Guru', 'Role default untuk guru pengajar');
