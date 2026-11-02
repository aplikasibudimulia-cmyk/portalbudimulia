import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { getSecuritySessionId, submitIntruderReply } from '../utils/geoTracker'

export default function SecurityInterventionModal() {
  const [activeAlert, setActiveAlert] = useState(null)
  const [replyText, setReplyText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const sId = getSecuritySessionId()
    if (!sId) return

    // 1. Cek apakah sesi ini memiliki pesan intervensi dari admin di database
    const checkIntervention = async () => {
      try {
        const { data, error } = await supabase
          .from('admin_access_logs')
          .select('id, admin_message, city, region, isp, ip_address, device, hacker_reply, status')
          .eq('session_id', sId)
          .not('admin_message', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (data && data.admin_message && !dismissed) {
          setActiveAlert(data)
          if (data.hacker_reply) {
            setSubmitted(true)
          }
        }
      } catch (err) {
        // silent fail
      }
    }

    checkIntervention()

    // 2. Realtime listener: jika admin mengirim pesan baru saat penyusup masih online
    const channel = supabase.channel(`security-intercept-${sId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'admin_access_logs',
        filter: `session_id=eq.${sId}`
      }, (payload) => {
        const updated = payload.new
        if (updated && updated.admin_message) {
          setActiveAlert(updated)
          setDismissed(false)
          if (updated.hacker_reply) {
            setSubmitted(true)
          }
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [dismissed])

  if (!activeAlert || dismissed) return null

  const handleSendReply = async (e) => {
    e.preventDefault()
    if (!replyText.trim()) return

    setSubmitting(true)
    const res = await submitIntruderReply(replyText.trim())
    setSubmitting(false)

    if (res.ok) {
      setSubmitted(true)
    }
  }

  return (
    <div className="fixed inset-0 z-[999999] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-fade-in font-sans">
      <div className="bg-white rounded-3xl border-2 border-red-500 shadow-2xl max-w-lg w-full overflow-hidden flex flex-col relative animate-scale-up">
        
        {/* Header Merah Keamanan */}
        <div className="bg-gradient-to-r from-red-600 to-rose-700 text-white p-5 flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center text-2xl shrink-0">
            🛡️
          </div>
          <div>
            <span className="text-[10px] font-black tracking-widest uppercase bg-white/20 px-2 py-0.5 rounded-full">
              PERINGATAN SISTEM KEAMANAN
            </span>
            <h3 className="text-base font-black tracking-wide mt-1">
              SMP BUDI MULIA JAKARTA
            </h3>
            <p className="text-xs text-red-100 mt-0.5">
              Pemberitahuan Khusus Pemantauan Akses Administrator
            </p>
          </div>
        </div>

        {/* Isi Modal */}
        <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-900 leading-relaxed">
            <p className="font-bold mb-1">⚠️ Perangkat &amp; Lokasi Anda Telah Tercatat:</p>
            <ul className="space-y-1 text-slate-700 list-disc list-inside">
              <li><strong>Lokasi:</strong> {activeAlert.city || 'Jakarta'}, {activeAlert.region || 'DKI Jakarta'} ({activeAlert.isp || 'Penyedia Jaringan'})</li>
              <li><strong>Alamat IP:</strong> <span className="font-mono">{activeAlert.ip_address || 'Tercatat di server'}</span></li>
              <li><strong>Perangkat:</strong> {activeAlert.device || 'Browser Siswa'}</li>
            </ul>
          </div>

          {/* Pesan dari Administrator */}
          <div className="bg-slate-900 text-slate-100 rounded-2xl p-4 border border-slate-800 shadow-inner">
            <span className="text-[10px] font-bold tracking-wider text-rose-400 uppercase block mb-1">
              PESAN LANGSUNG DARI ADMINISTRATOR SEKOLAH:
            </span>
            <p className="text-sm font-semibold italic text-white leading-relaxed">
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
                <p className="text-xs italic bg-white p-2.5 rounded-xl border border-emerald-100 text-slate-700 mt-2">
                  "{activeAlert.hacker_reply}"
                </p>
              )}
              <button
                onClick={() => setDismissed(true)}
                className="mt-3 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
              >
                Tutup Jendela Ini
              </button>
            </div>
          ) : (
            <form onSubmit={handleSendReply} className="space-y-3">
              <label className="block text-xs font-bold text-slate-700">
                Kirim Balasan / Klarifikasi ke Administrator:
              </label>
              <textarea
                rows={3}
                required
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Tulis pesan atau alasan Anda di sini (akan langsung terbaca oleh Admin)..."
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:bg-white resize-none"
              />
              <div className="flex items-center justify-between gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setDismissed(true)}
                  className="px-4 py-2.5 text-xs text-slate-500 hover:text-slate-700 font-semibold transition"
                >
                  Tutup Sementara
                </button>
                <button
                  type="submit"
                  disabled={submitting || !replyText.trim()}
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white text-xs font-bold rounded-xl transition shadow-md active:scale-95"
                >
                  {submitting ? 'Mengirim...' : 'Kirim Balasan ke Admin ✈️'}
                </button>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  )
}
