import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useEffect } from 'react'
import { supabase } from './supabaseClient'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Admin from './pages/Admin'
import LoginAdmin from './pages/LoginAdmin'
import DashboardGuru from './pages/DashboardGuru'
import Impersonate from './pages/Impersonate'
import PresensiTV from './pages/PresensiTV'

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
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/login-admin" element={<LoginAdmin />} />
        <Route path="/dashboard-guru" element={<DashboardGuru />} />
        <Route path="/impersonate" element={<Impersonate />} />
        <Route path="/presensi-tv" element={<PresensiTV />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
