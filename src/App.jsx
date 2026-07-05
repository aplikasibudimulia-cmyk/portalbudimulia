import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useEffect } from 'react'
import { supabase } from './supabaseClient'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Admin from './pages/Admin'
import LoginAdmin from './pages/LoginAdmin'
import DashboardGuru from './pages/DashboardGuru'
import DashboardOrangTua from './pages/DashboardOrangTua'
import Impersonate from './pages/Impersonate'
import PresensiTV from './pages/PresensiTV'
import LaporanPengumuman from './pages/LaporanPengumuman'
import PresensiManualSiswa from './pages/PresensiManualSiswa'

function App() {
  useEffect(() => {
    const fetchTheme = async () => {
      const { data } = await supabase.from('pengaturan_sekolah').select('setting_value').eq('setting_key', 'tema_warna').maybeSingle()
      if (data && data.setting_value) {
        document.documentElement.setAttribute('data-theme', data.setting_value)
      }
    }
    fetchTheme()
  }, [])

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/dashboard-orang-tua" element={<DashboardOrangTua />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/login-admin" element={<LoginAdmin />} />
        <Route path="/dashboard-guru" element={<DashboardGuru />} />
        <Route path="/impersonate" element={<Impersonate />} />
        <Route path="/presensi-tv" element={<PresensiTV />} />
        <Route path="/laporan-pengumuman/:typeId" element={<LaporanPengumuman />} />
        <Route path="/presensi-manual-siswa" element={<PresensiManualSiswa />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
