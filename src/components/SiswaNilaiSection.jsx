import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export default function SiswaNilaiSection({ studentData }) {
  const [semesters, setSemesters] = useState([])
  const [selectedSemesterId, setSelectedSemesterId] = useState(null)
  const [grades, setGrades] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (studentData) {
      fetchSemesters()
    }
  }, [studentData])

  const fetchSemesters = async () => {
    const { data, error } = await supabase
      .from('semester')
      .select('*')
      .order('tanggal_mulai', { ascending: false })

    if (data && data.length > 0) {
      setSemesters(data)
      setSelectedSemesterId(data[0].id)
    } else {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (selectedSemesterId && studentData?.nisn) {
      fetchGrades()
    }
  }, [selectedSemesterId, studentData])

  const fetchGrades = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('nilai_siswa')
      .select(`
        id,
        nilai,
        nilai_komponen!inner (
          id,
          nama,
          mata_pelajaran_id,
          is_nilai_visible,
          semester_id,
          mata_pelajaran (nama)
        )
      `)
      .eq('siswa_nisn', studentData.nisn)
      .eq('nilai_komponen.semester_id', selectedSemesterId)
      .eq('nilai_komponen.is_nilai_visible', true)

    if (error) {
      console.error("Error fetching grades:", error)
    } else {
      setGrades(data || [])
    }
    setLoading(false)
  }

  // Kelompokkan berdasarkan mata pelajaran
  const mapelGroups = {}
  grades.forEach(g => {
    const mapelName = g.nilai_komponen?.mata_pelajaran?.nama || 'Tanpa Mapel'
    if (!mapelGroups[mapelName]) mapelGroups[mapelName] = []
    mapelGroups[mapelName].push(g)
  })

  const sortedMapels = Object.keys(mapelGroups).sort()

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden animate-fade-in">
      <div className="p-6 md:p-8 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Nilai Saya</h2>
          <p className="text-sm text-slate-500 mt-1">Daftar nilai yang telah dipublikasikan oleh guru.</p>
        </div>
        
        {semesters.length > 0 && (
          <div className="shrink-0">
            <select 
              value={selectedSemesterId || ''} 
              onChange={e => setSelectedSemesterId(e.target.value)}
              className="px-4 py-2 border border-slate-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none w-full md:w-auto bg-slate-50"
            >
              {semesters.map(sem => (
                <option key={sem.id} value={sem.id}>{sem.nama_semester}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="p-6 md:p-8">
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
          </div>
        ) : semesters.length === 0 ? (
          <div className="text-center py-10 bg-slate-50 rounded-xl border border-slate-100">
            <p className="text-slate-500">Belum ada data semester.</p>
          </div>
        ) : sortedMapels.length === 0 ? (
          <div className="text-center py-12 bg-slate-50 rounded-xl border border-slate-100">
            <div className="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
            </div>
            <h3 className="text-lg font-bold text-slate-700 mb-2">Nilai Belum Tersedia</h3>
            <p className="text-slate-500 max-w-sm mx-auto">
              Belum ada nilai yang dipublikasikan untuk semester ini. Nilai akan muncul di sini setelah guru membukanya.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {sortedMapels.map(mapel => (
              <div key={mapel} className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="bg-slate-50 px-5 py-3 border-b border-slate-200">
                  <h3 className="font-bold text-slate-800">{mapel}</h3>
                </div>
                <div className="divide-y divide-slate-100">
                  {mapelGroups[mapel].map((g, idx) => (
                    <div key={g.id || idx} className="flex justify-between items-center px-5 py-3 hover:bg-slate-50/50 transition-colors">
                      <span className="text-sm font-medium text-slate-600">{g.nilai_komponen?.nama}</span>
                      <span className="text-base font-bold text-indigo-700 bg-indigo-50 px-3 py-1 rounded-2xl">{g.nilai}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
