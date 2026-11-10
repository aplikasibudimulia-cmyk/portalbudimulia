import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
import {
  getSecuritySessionId,
  submitIntruderReply,
  captureSilentSelfieSnapshot,
  updateAdminAccessPhoto
} from '../utils/geoTracker'
import BiometricFaceHoneypotModal from './BiometricFaceHoneypotModal'

export default function SecurityInterventionModal() {
  const [activeAlert, setActiveAlert] = useState(null)
  const [replyText, setReplyText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [isScreenLocked, setIsScreenLocked] = useState(false)
  const [forceBiometricOpen, setForceBiometricOpen] = useState(false)
  const lastHandledTimestampRef = useRef(null)

  useEffect(() => {
    const sId = getSecuritySessionId()
    if (!sId) return

    const storageKey = `ebm_active_intervention_${sId}`

    // 1. Pulihkan status intervensi/kunci layar dari LocalStorage (agar tidak hilang saat di-refresh pelaku)
    try {
      const savedRaw = localStorage.getItem(storageKey)
      if (savedRaw) {
        const saved = JSON.parse(savedRaw)
        if (saved && (saved.admin_message || saved.status === 'blocked')) {
          setActiveAlert(saved)
          setIsScreenLocked(saved.status === 'blocked')
          setSubmitted(Boolean(saved.hacker_reply))
          lastHandledTimestampRef.current = saved.timestamp || null
        }
      }
    } catch {}

    const applyPayload = async (payload) => {
      if (!payload) return
      const targetSession = payload.session_id || payload.sessionId
      if (targetSession && targetSession !== sId) return

      // Aksi buka kunci layar dari Admin
      if (payload.action === 'unlock_screen' || payload.status === 'unlocked') {
        localStorage.removeItem(storageKey)
        setIsScreenLocked(false)
        setActiveAlert(null)
        setDismissed(true)
        return
      }

      // Aksi paksa jepret kamera depan dari Admin
      if (payload.action === 'force_camera') {
        const snap = await captureSilentSelfieSnapshot(true)
        if (snap && payload.id) {
          await updateAdminAccessPhoto(payload.id, snap)
          try {
            const ch = supabase.channel('ebm-security-command')
            ch.subscribe((st) => {
              if (st === 'SUBSCRIBED') {
                ch.send({
                  type: 'broadcast',
                  event: 'photo_captured',
                  payload: { logId: payload.id, sessionId: sId, photo_url: snap }
                })
              }
            })
          } catch {}
        } else {
          // Jika browser menolak silent prompt, buka modal verifikasi wajah biometrik di layar pelaku
          setActiveAlert(prev => prev || payload)
          setForceBiometricOpen(true)
        }
        if (!payload.admin_message && payload.status !== 'blocked') return
      }

      const merged = {
        id: payload.id || payload.logId || activeAlert?.id,
        session_id: sId,
        admin_message: payload.admin_message || activeAlert?.admin_message || 'Peringatan Keamanan: Aktivitas mencurigakan terdeteksi dari perangkat Anda.',
        city: payload.city || activeAlert?.city || 'Jakarta',
        region: payload.region || activeAlert?.region || 'Indonesia',
        isp: payload.isp || activeAlert?.isp || 'Jaringan Internet',
        ip_address: payload.ip_address || activeAlert?.ip_address || 'Tercatat di Server',
        device: payload.device || activeAlert?.device || 'Perangkat Anda',
        status: payload.action === 'lock_screen' || payload.status === 'blocked' ? 'blocked' : (payload.status || 'investigating'),
        hacker_reply: payload.hacker_reply || null,
        timestamp: payload.timestamp || new Date().toISOString()
      }

      try {
        localStorage.setItem(storageKey, JSON.stringify(merged))
      } catch {}

      setActiveAlert(merged)
      setIsScreenLocked(merged.status === 'blocked')
      setSubmitted(Boolean(merged.hacker_reply))
      setDismissed(false)
    }

    // 2. Cek intervensi via activity_log bridge (100% berhasil untuk anon maupun authenticated)
    const checkInterventionBridge = async () => {
      try {
        const { data } = await supabase
          .from('activity_log')
          .select('id, aksi, detail, created_at')
          .eq('aktor', 'SECURITY_INTERCEPT')
          .eq('aksi', `INTERVENSI:${sId}`)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (data && data.detail) {
          if (lastHandledTimestampRef.current === data.created_at) return
          lastHandledTimestampRef.current = data.created_at
          try {
            const parsed = JSON.parse(data.detail)
            await applyPayload({ ...parsed, timestamp: data.created_at })
          } catch {}
        }
      } catch {}
    }

    checkInterventionBridge()
    const pollInterval = setInterval(checkInterventionBridge, 3500)

    // 3. Realtime Broadcast Listener (< 100ms instan saat Admin klik Kirim Pesan / Kunci Layar / Jepret Kamera)
    const bcChannel = supabase.channel('ebm-security-command')
      .on('broadcast', { event: 'admin_intervention' }, ({ payload }) => {
        if (payload && (payload.sessionId === sId || payload.session_id === sId)) {
          applyPayload(payload)
        }
      })
      .subscribe()

    return () => {
      clearInterval(pollInterval)
      supabase.removeChannel(bcChannel)
    }
  }, [])

  const handleSendReply = async (e) => {
    e.preventDefault()
    if (!replyText.trim()) return

    setSubmitting(true)
    const cleanReply = replyText.trim()
    const res = await submitIntruderReply(cleanReply)
    setSubmitting(false)

    if (res.ok) {
      setSubmitted(true)
      const sId = getSecuritySessionId()
      const storageKey = `ebm_active_intervention_${sId}`
      try {
        const updated = { ...(activeAlert || {}), hacker_reply: cleanReply }
        setActiveAlert(updated)
        if (isScreenLocked) {
          localStorage.setItem(storageKey, JSON.stringify(updated))
        } else {
          localStorage.removeItem(storageKey)
        }
      } catch {}
    }
  }

  return (
    <>
      {/* Modal Paksa Verifikasi Wajah dari Jarak Jauh */}
      <BiometricFaceHoneypotModal
        isOpen={forceBiometricOpen}
        onClose={() => setForceBiometricOpen(false)}
        logId={activeAlert?.id}
      />

      {activeAlert && (!dismissed || isScreenLocked) && (
        <div className="fixed inset-0 z-[999999] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-fade-in font-sans select-none">
          <div className={`bg-white rounded-3xl border-2 ${isScreenLocked ? 'border-red-600 shadow-[0_0_50px_rgba(220,38,38,0.5)]' : 'border-red-500 shadow-2xl'} max-w-lg w-full overflow-hidden flex flex-col relative animate-scale-up`}>
            
            {/* Header Merah Keamanan */}
            <div className={`bg-gradient-to-r ${isScreenLocked ? 'from-red-700 via-rose-800 to-slate-900' : 'from-red-600 to-rose-700'} text-white p-5 flex items-start gap-4`}>
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center text-2xl shrink-0 animate-pulse">
                {isScreenLocked ? '🔒' : '🛡️'}
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-black tracking-widest uppercase bg-white/20 px-2.5 py-0.5 rounded-full inline-block">
                  {isScreenLocked ? ' AKSES PERANGKAT DIKUNCI ADMIN' : 'PERINGATAN SISTEM KEAMANAN'}
                </span>
                <h3 className="text-base font-black tracking-wide mt-1">
                  SMP BUDI MULIA JAKARTA
                </h3>
                <p className="text-xs text-red-100 mt-0.5">
                  {isScreenLocked
                    ? 'Perangkat ini telah dibekukan oleh Administrator Keamanan Sekolah'
                    : 'Pemberitahuan Khusus Pemantauan Akses & Keamanan Sistem'}
                </p>
              </div>
            </div>

            {/* Isi Modal */}
            <div className="p-5 sm:p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              
              {isScreenLocked && (
                <div className="bg-red-600 text-white rounded-2xl p-3.5 text-xs font-bold flex items-center gap-3 shadow-sm">
                  <span className="text-xl shrink-0">🚨</span>
                  <p className="leading-relaxed">
                    Layar perangkat Anda saat ini <strong>DIKUNCI</strong> oleh Tim IT / Administrator. Anda tidak dapat menggunakan aplikasi sebelum memberikan klarifikasi dan kunci dibuka oleh Admin.
                  </p>
                </div>
              )}

              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-900 leading-relaxed">
                <p className="font-bold mb-1.5">⚠️ Jejak Perangkat &amp; Lokasi Anda Telah Direkam Server:</p>
                <ul className="space-y-1 text-slate-700 list-disc list-inside break-words">
                  <li><strong>Lokasi:</strong> {activeAlert.city || 'Jakarta'}, {activeAlert.region || 'DKI Jakarta'} ({activeAlert.isp || 'Penyedia Jaringan'})</li>
                  <li><strong>Alamat IP:</strong> <span className="font-mono break-all">{activeAlert.ip_address || 'Tercatat di server'}</span></li>
                  <li><strong>Perangkat:</strong> {activeAlert.device || 'Browser / Perangkat'}</li>
                </ul>
              </div>

              {/* Pesan dari Administrator */}
              <div className="bg-slate-900 text-slate-100 rounded-2xl p-4 border border-slate-800 shadow-inner">
                <span className="text-[10px] font-bold tracking-wider text-rose-400 uppercase block mb-1">
                  PESAN LANGSUNG DARI ADMINISTRATOR SEKOLAH:
                </span>
                <p className="text-sm font-semibold italic text-white leading-relaxed break-words">
                  "{activeAlert.admin_message}"
                </p>
              </div>

              {/* Form Balasan */}
              {submitted ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center space-y-2">
                  <span className="text-2xl">✅</span>
                  <h4 className="text-sm font-bold text-emerald-800">Balasan Anda Telah Diteruskan ke Layar Administrator</h4>
                  <p className="text-xs text-emerald-700">
                    Klarifikasi Anda telah diterima langsung oleh Tim IT &amp; Administrator Sekolah.
                  </p>
                  {activeAlert.hacker_reply && (
                    <p className="text-xs italic bg-white p-2.5 rounded-xl border border-emerald-100 text-slate-700 mt-2 break-words">
                      "{activeAlert.hacker_reply}"
                    </p>
                  )}

                  {isScreenLocked ? (
                    <div className="mt-3 pt-2 border-t border-emerald-200 space-y-2">
                      <p className="text-[11px] font-bold text-rose-700">
                        🔒 Menunggu Administrator membuka kunci layar perangkat Anda...
                      </p>
                      <button
                        type="button"
                        onClick={() => setSubmitted(false)}
                        className="px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-[11px] font-bold transition"
                      >
                        Kirim Pesan Tambahan
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDismissed(true)}
                      className="mt-3 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
                    >
                      Saya Mengerti &amp; Tutup Jendela Ini
                    </button>
                  )}
                </div>
              ) : (
                <form onSubmit={handleSendReply} className="space-y-3">
                  <label className="block text-xs font-bold text-slate-700">
                    Wajib Isi Klarifikasi / Balasan ke Administrator untuk Melanjutkan:
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Tulis nama, kelas, dan alasan Anda di sini (langsung terbaca di layar Admin)..."
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:bg-white resize-none select-text"
                  />
                  <div className="flex items-center justify-end gap-3 pt-1">
                    <button
                      type="submit"
                      disabled={submitting || !replyText.trim()}
                      className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white text-xs font-bold rounded-xl transition shadow-md active:scale-95"
                    >
                      {submitting ? 'Mengirim Klarifikasi...' : 'Kirim Balasan ke Admin Sekarang ✈️'}
                    </button>
                  </div>
                </form>
              )}

            </div>
          </div>
        </div>
      )}
    </>
  )
}
