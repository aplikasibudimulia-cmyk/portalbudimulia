import { getTodayWIB, getCurrentTimeWIB, getServerNow, getDayIndexWIB } from './dateUtils'

/**
 * Utilitas Evaluasi Sesi Presensi (Single Source of Truth)
 * Menentukan status aktif sesi Masuk, sesi Pulang, dan Jadwal Otomatis secara akurat
 * berbasis waktu resmi server WIB.
 */

export function evaluatePresensiSession({
  settings = [],
  sesiPresensiRow = null,
  dateNow = null
}) {
  const now = dateNow || getServerNow()
  const todayStr = getTodayWIB(now)
  const currentDow = getDayIndexWIB(now) // 0: Minggu, 1: Senin, ..., 6: Sabtu
  const jamSekarang = getCurrentTimeWIB(now)

  // Ekstrak helper settings dari array [{ setting_key, setting_value }] atau object map
  const getSetting = (key, fallback = '') => {
    if (Array.isArray(settings)) {
      const found = settings.find(s => s.setting_key === key)
      return found?.setting_value ?? fallback
    }
    return settings?.[key] ?? fallback
  }

  const autActSetting = getSetting('jadwal_otomatis_aktif')
  // Resilient fallback: Jika settings belum sempat termuat (array kosong / timeout), default ke true di hari sekolah
  const autAct = autActSetting !== '' 
    ? (autActSetting === 'true' || autActSetting === '1')
    : true

  const har = getSetting('hari_aktif_presensi', '1,2,3,4,5')
  const jamMulaiMasuk = getSetting('jam_mulai_presensi', '04:25')
  const jamBatasHadir = getSetting('jam_batas_hadir', '06:55')
  const jamMulaiPulang = getSetting('jam_mulai_pulang', '11:00')
  const jamBatasPulang = getSetting('jam_batas_pulang', '19:00')

  // Cek apakah presensi hari ini sudah diakhiri manual oleh Petugas Piket / Guru
  const isSesiSelesaiManual = getSetting(`sesi_selesai_${todayStr}`) === 'true'

  // Cek apakah sesi pulang diaktifkan manual oleh Petugas Piket / Admin
  // KRUSIAL: Harus bertanggal hari ini agar tidak menggantung ke esok harinya!
  const pulAktifVal = getSetting('presensi_pulang_aktif') === 'true' || getSetting('presensi_pulang_aktif') === '1'
  const pulTanggalVal = getSetting('presensi_pulang_tanggal')
  const isPulangManualAktif = pulAktifVal && (!pulTanggalVal || pulTanggalVal === todayStr)

  // Cek apakah sesi masuk diaktifkan manual oleh Petugas Piket / Admin via tabel sesi_presensi
  const isMasukManualAktif = !!sesiPresensiRow && sesiPresensiRow.tanggal === todayStr && !isSesiSelesaiManual

  // Evaluasi jadwal hari aktif (Senin - Jumat vs Libur)
  const activeDays = har.split(',').map(Number)
  const isHariAktif = autAct ? activeDays.includes(currentDow) : true

  // Evaluasi waktu sekarang terhadap batas jam
  const [currentH, currentM] = jamSekarang.split(':').map(Number)
  const [mh, mm] = jamMulaiMasuk.split(':').map(Number)
  const [mph, mpm] = jamMulaiPulang.split(':').map(Number)
  const [bh, bm] = jamBatasPulang.split(':').map(Number)
  const [th, tm] = jamBatasHadir.split(':').map(Number)

  const isSudahMulaiMasuk = currentH > mh || (currentH === mh && currentM >= (mm || 0))
  const isSudahWaktuPulang = currentH > mph || (currentH === mph && currentM >= (mpm || 0))
  const isSudahLewatBatasSelesai = currentH > bh || (currentH === bh && currentM >= (bm || 0))
  const isLewatBatasHadir = currentH > th || (currentH === th && currentM > (tm || 0))

  // Jadwal otomatis:
  // Sesi masuk aktif dari jam_mulai_masuk sampai jam_batas_pulang pada hari aktif
  const isAutoMasukActive = autAct && isHariAktif && isSudahMulaiMasuk && !isSudahLewatBatasSelesai
  
  // Sesi pulang aktif otomatis dari jam_mulai_pulang sampai jam_batas_pulang pada hari aktif
  const isAutoPulangActive = autAct && isHariAktif && isSudahWaktuPulang && !isSudahLewatBatasSelesai

  // Status Final Sesi:
  // Sesi Masuk aktif jika: (Otomatis Aktif) ATAU (Manual dibuka oleh Piket/Admin)
  const isSesiMasukAktif = isAutoMasukActive || isMasukManualAktif

  // Sesi Pulang aktif jika: (Otomatis Pulang Aktif) ATAU (Manual dibuka oleh Piket/Admin untuk hari ini)
  const isSesiPulangAktif = isAutoPulangActive || isPulangManualAktif

  // Presensi ditutup jika:
  // - Sudah lewat jam batas selesai pulang pada jadwal otomatis, ATAU
  // - Diakhiri manual ketika jadwal otomatis tidak aktif
  const isPresensiDitutup = (autAct && isHariAktif && isSudahLewatBatasSelesai) || (!autAct && isSesiSelesaiManual)
  const isBelumMulai = autAct && isHariAktif && !isSudahMulaiMasuk && !isMasukManualAktif

  return {
    todayStr,
    todayDow: currentDow,
    currentDow,
    jamSekarang,
    autAct,
    isHariAktif,
    isBelumMulai,
    isPresensiDitutup,
    isSesiAktif: isSesiMasukAktif || isSesiPulangAktif,
    isSesiMasukAktif,
    isSesiPulangAktif,
    isAutoMasukActive,
    isAutoPulangActive,
    isMasukManualAktif,
    isPulangManualAktif,
    isSesiSelesaiManual,
    isLewatBatasHadir,
    jamMulaiMasuk,
    jamBatasHadir,
    jamMulaiPulang,
    jamBatasPulang
  }
}
