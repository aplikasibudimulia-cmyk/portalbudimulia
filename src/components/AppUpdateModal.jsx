import { useState, useEffect, useCallback } from 'react'
import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'
import { supabase } from '../supabaseClient'

/**
 * Membandingkan 2 string versi semver (misal '1.7' vs '1.8' atau '1.7.2' vs '1.8.0')
 * Returns:
 *  -1 jika v1 < v2 (butuh update)
 *   0 jika v1 === v2
 *   1 jika v1 > v2
 */
export function compareVersions(v1, v2) {
  if (!v1 || !v2) return 0
  const cleanV1 = String(v1).trim().replace(/^v/i, '')
  const cleanV2 = String(v2).trim().replace(/^v/i, '')
  const parts1 = cleanV1.split('.').map(p => parseInt(p, 10) || 0)
  const parts2 = cleanV2.split('.').map(p => parseInt(p, 10) || 0)
  const maxLen = Math.max(parts1.length, parts2.length)

  for (let i = 0; i < maxLen; i++) {
    const num1 = parts1[i] ?? 0
    const num2 = parts2[i] ?? 0
    if (num1 < num2) return -1
    if (num1 > num2) return 1
  }
  return 0
}

export default function AppUpdateModal() {
  const [isOpen, setIsOpen] = useState(false)
  const [updateData, setUpdateData] = useState({
    currentVersion: '1.0',
    currentBuild: '1',
    latestVersion: '1.0',
    latestBuild: '1',
    minVersion: '1.0',
    isForce: false,
    isIos: false,
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.ebudimulia.portal',
    appStoreUrl: '',
    title: 'Pembaruan Tersedia',
    notes: 'Peningkatan performa dan kestabilan sistem.'
  })

  const checkUpdate = useCallback(async () => {
    try {
      const isNative = Capacitor.isNativePlatform()
      const platform = Capacitor.getPlatform()
      const isIos = platform === 'ios'
      const urlParams = new URLSearchParams(window.location.search)
      const isTestMode = urlParams.get('test_update') === '1'

      // Hanya jalan di native platform Android/iOS atau saat mode pengetesan (?test_update=1)
      if (!isNative && !isTestMode) return

      let curVersion = '1.7'
      let curBuild = '8'

      if (isNative) {
        try {
          const appInfo = await CapApp.getInfo()
          curVersion = appInfo.version || '1.7'
          curBuild = appInfo.build || '8'
        } catch (err) {
          console.warn('[AppUpdateModal] Gagal membaca App.getInfo():', err)
        }
      }

      // Ambil data versi terbaru dari tabel pengaturan_sekolah Supabase
      const { data, error } = await supabase
        .from('pengaturan_sekolah')
        .select('setting_key, setting_value')
        .in('setting_key', [
          'app_latest_version',
          'app_latest_build',
          'app_min_version',
          'app_min_build',
          'app_force_update',
          'app_playstore_url',
          'app_appstore_url',
          'app_ios_latest_version',
          'app_ios_latest_build',
          'app_ios_min_version',
          'app_ios_min_build',
          'app_ios_force_update',
          'app_update_title',
          'app_update_notes'
        ])

      if (error || !data) {
        return
      }

      const settings = {}
      data.forEach(item => {
        settings[item.setting_key] = item.setting_value
      })

      const appStoreUrl = settings.app_appstore_url?.trim() || ''

      // JIKA DI IOS (IPHONE/IPAD):
      // Jika aplikasi belum dirilis di App Store resmi (link App Store belum ada/kosong),
      // JANGAN tampilkan modal update agar tidak memblokir iPhone saat masa development/testing!
      if (isIos && !appStoreUrl && !isTestMode) {
        setIsOpen(false)
        return
      }

      const latestVersion = isIos
        ? (settings.app_ios_latest_version || settings.app_latest_version || curVersion)
        : (settings.app_latest_version || curVersion)
      const latestBuild = isIos
        ? (settings.app_ios_latest_build || settings.app_latest_build || curBuild)
        : (settings.app_latest_build || curBuild)
      const minVersion = isIos
        ? (settings.app_ios_min_version || '1.0')
        : (settings.app_min_version || '1.0')
      const minBuild = isIos
        ? (settings.app_ios_min_build || '1')
        : (settings.app_min_build || '1')
      const forceSetting = isIos
        ? (settings.app_ios_force_update !== undefined ? settings.app_ios_force_update === 'true' : settings.app_force_update === 'true')
        : (settings.app_force_update === 'true')

      const playStoreUrl = settings.app_playstore_url || 'https://play.google.com/store/apps/details?id=com.ebudimulia.portal'
      const title = settings.app_update_title || 'Pembaruan Tersedia'
      const notes = settings.app_update_notes || 'Peningkatan performa dan kestabilan sistem.'

      // Evaluasi apakah butuh update
      const isVersionLower = compareVersions(curVersion, latestVersion) < 0
      const isBuildLower = latestBuild && curBuild && (parseInt(curBuild, 10) < parseInt(latestBuild, 10))
      const hasUpdate = isVersionLower || isBuildLower || (isTestMode && curVersion !== latestVersion)

      if (!hasUpdate) {
        setIsOpen(false)
        return
      }

      // Cek apakah force update (wajib diperbarui)
      const isBelowMin = compareVersions(curVersion, minVersion) < 0
      const isBelowMinBuild = minBuild && curBuild && (parseInt(curBuild, 10) < parseInt(minBuild, 10))
      const isForce = forceSetting || isBelowMin || isBelowMinBuild

      // Jika bukan force update, cek apakah pengguna sudah pernah klik "Nanti Saja" di sesi ini
      if (!isForce) {
        const dismissed = sessionStorage.getItem(`ebm_dismiss_update_${latestVersion}`)
        if (dismissed === 'true' && !isTestMode) {
          return
        }
      }

      setUpdateData({
        currentVersion: curVersion,
        currentBuild: curBuild,
        latestVersion,
        latestBuild,
        minVersion,
        isForce,
        isIos,
        playStoreUrl,
        appStoreUrl,
        title,
        notes
      })

      setIsOpen(true)
    } catch (err) {
      console.warn('[AppUpdateModal] Error saat memeriksa pembaruan:', err)
    }
  }, [])

  useEffect(() => {
    checkUpdate()

    // Dengarkan saat aplikasi kembali aktif dari background di HP
    let appStateListener = null
    if (Capacitor.isNativePlatform()) {
      CapApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          checkUpdate()
        }
      }).then(listener => {
        appStateListener = listener
      }).catch(() => {})
    }

    return () => {
      if (appStateListener?.remove) {
        appStateListener.remove()
      }
    }
  }, [checkUpdate])

  const handleOpenStore = () => {
    if (updateData.isIos) {
      const targetUrl = updateData.appStoreUrl || 'https://apps.apple.com'
      const itmsUrl = targetUrl.replace(/^https?:\/\//i, 'itms-apps://')
      if (Capacitor.isNativePlatform()) {
        try {
          window.location.href = itmsUrl
          setTimeout(() => {
            window.open(targetUrl, '_system')
          }, 600)
        } catch {
          window.open(targetUrl, '_system')
        }
      } else {
        window.open(targetUrl, '_blank')
      }
    } else {
      const targetUrl = updateData.playStoreUrl || 'https://play.google.com/store/apps/details?id=com.ebudimulia.portal'
      const marketUrl = 'market://details?id=com.ebudimulia.portal'

      if (Capacitor.isNativePlatform()) {
        try {
          // market:// langsung memicu aplikasi Google Play Store bawaan Android
          window.location.href = marketUrl
          setTimeout(() => {
            // Cadangan jika market:// tidak merespons
            window.open(targetUrl, '_system')
          }, 600)
        } catch {
          window.open(targetUrl, '_system')
        }
      } else {
        window.open(targetUrl, '_blank')
      }
    }
  }

  const handleDismiss = () => {
    if (updateData.isForce) return
    sessionStorage.setItem(`ebm_dismiss_update_${updateData.latestVersion}`, 'true')
    setIsOpen(false)
  }

  const handleExitApp = async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        await CapApp.exitApp()
      }
    } catch (e) {
      console.warn('[AppUpdateModal] exitApp error:', e)
    }
  }

  if (!isOpen) return null

  // Format catatan rilis baris per baris
  const notesLines = updateData.notes
    ? updateData.notes.split('\n').map(line => line.trim()).filter(Boolean)
    : []

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[999999] flex items-center justify-center p-3 sm:p-4 bg-slate-900/80 backdrop-blur-sm animate-fade-in"
    >
      <div 
        className="w-full max-w-[340px] sm:max-w-[370px] bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden transform transition-all animate-scale-up max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Visual Compact */}
        <div className={`relative px-4 pt-5 pb-4 text-center shrink-0 overflow-hidden ${
          updateData.isForce 
            ? 'bg-gradient-to-br from-amber-500 via-rose-500 to-indigo-600' 
            : 'bg-gradient-to-br from-indigo-600 via-indigo-700 to-emerald-600'
        }`}>
          {/* Ambient Glow */}
          <div className="absolute -top-8 -right-8 w-24 h-24 bg-white/10 rounded-full blur-xl pointer-events-none" />
          <div className="absolute -bottom-8 -left-8 w-24 h-24 bg-white/10 rounded-full blur-xl pointer-events-none" />

          {/* Icon Badge */}
          <div className="relative inline-flex items-center justify-center w-12 h-12 rounded-xl bg-white shadow-lg mb-2.5 border border-white/60">
            <svg className="w-6 h-6 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
              <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
              <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/>
              <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>
            </svg>
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 border border-white"></span>
            </span>
          </div>

          {/* Badge Label */}
          <div className="flex justify-center mb-1.5">
            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
              updateData.isForce 
                ? 'bg-rose-100/95 text-rose-800' 
                : 'bg-emerald-100/95 text-emerald-800'
            }`}>
              {updateData.isForce ? (
                <>
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
                  </svg>
                  Pembaruan Wajib
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                  </svg>
                  Versi Baru Tersedia
                </>
              )}
            </span>
          </div>

          <h3 className="text-base font-bold text-white tracking-tight">
            {updateData.title.replace(/\s*🚀\s*$/, '')}
          </h3>

          {/* Version comparison chip */}
          <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/15 backdrop-blur-md border border-white/20 text-[11px] font-semibold text-white">
            <span className="opacity-80">v{updateData.currentVersion}</span>
            <svg className="w-3 h-3 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
            <span className="text-emerald-300 font-bold">
              v{updateData.latestVersion} ({updateData.isIos ? 'App Store' : 'Play Store'})
            </span>
          </div>
        </div>

        {/* Content Body Compact */}
        <div className="p-4 space-y-3 overflow-y-auto">
          <p className="text-xs text-slate-600 leading-relaxed text-center">
            {updateData.isForce
              ? 'Aplikasi versi ini sudah usang. Silakan perbarui aplikasi ke versi terbaru untuk menjaga kelancaran dan efisiensi data.'
              : updateData.isIos
              ? 'Versi terbaru aplikasi eBudimulia telah rilis di Apple App Store. Dapatkan fitur terbaru dan peningkatan performa sekarang!'
              : 'Versi terbaru aplikasi eBudimulia telah rilis di Google Play Store. Dapatkan fitur terbaru dan peningkatan performa sekarang!'}
          </p>

          {/* Release Notes Box */}
          {notesLines.length > 0 && (
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <svg className="w-3.5 h-3.5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">Apa yang baru:</span>
              </div>
              <ul className="space-y-1 text-xs text-slate-600">
                {notesLines.map((line, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <span className="text-emerald-500 font-bold shrink-0">✓</span>
                    <span>{line.replace(/^[0-9]+[.)]\s*/, '')}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-1 space-y-1.5">
            {/* Primary Button */}
            <button
              onClick={handleOpenStore}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md shadow-emerald-600/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              {updateData.isIos ? (
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.47c.66-.82 1.11-1.95.99-3.08-1 .04-2.15.68-2.82 1.48-.59.68-1.11 1.78-.97 2.87 1.12.09 2.14-.45 2.8-1.27z"/>
                </svg>
              ) : (
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3.609 1.814L13.792 12 3.61 22.186a2.036 2.036 0 0 1-.61-.954V2.768c.11-.377.33-.717.61-.954zm11.242 11.245l2.482-2.482-12.723-7.3a1.597 1.597 0 0 0-.573-.207l10.814 9.989zm0-2.118L4.036 1.777c.18.06.35.15.51.267l12.723 7.3-2.418 1.6zM15.545 12.7l2.418 1.6-12.723 7.3a1.644 1.644 0 0 1-.51.267l10.815-9.167zm1.748-1.077l4.084 2.345a1.235 1.235 0 0 1 0 2.146l-4.084 2.345-2.227-2.227 2.227-2.264z"/>
                </svg>
              )}
              <span>{updateData.isIos ? 'Perbarui di Apple App Store' : 'Perbarui di Google Play Store'}</span>
            </button>

            {/* Secondary Option */}
            {!updateData.isForce ? (
              <button
                onClick={handleDismiss}
                className="w-full py-1.5 px-3 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors rounded-lg"
              >
                Nanti Saja
              </button>
            ) : (
              <button
                onClick={handleExitApp}
                className="w-full py-1 px-3 text-[11px] font-medium text-slate-400 hover:text-rose-600 transition-colors"
              >
                Tutup Aplikasi
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
