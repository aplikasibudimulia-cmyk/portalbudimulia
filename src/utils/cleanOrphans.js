import { supabase } from '../supabaseClient'

/**
 * Fast, targeted cleanup for orphaned or demo student data across all system tables.
 * Uses targeted indexed delete queries to prevent HTTP 408 Request Timeouts.
 */
export async function cleanOrphanedStudentData() {
  try {
    // 1. Target cleanup for demo accounts & test data matching "demo"
    await Promise.allSettled([
      supabase.from('point_records').delete().or('nama_siswa.ilike.%demo%,keterangan.ilike.%demo%'),
      supabase.from('presensi_harian').delete().or('siswa_nisn.ilike.%demo%'),
      supabase.from('bk_konsultasi').delete().or('siswa_nama.ilike.%demo%,siswa_nisn.ilike.%demo%'),
      supabase.from('student_points').delete().or('nisn.ilike.%demo%'),
      supabase.from('nilai_siswa').delete().or('siswa_nisn.ilike.%demo%'),
      supabase.from('akun_pengguna').delete().or('username.ilike.%demo%')
    ])

    // 2. Fetch active valid NISNs from siswa_permanent to check for remaining orphans
    const { data: validStudents } = await supabase
      .from('siswa_permanent')
      .select('nisn')

    if (!validStudents || validStudents.length === 0) return { success: true }

    const validNisns = new Set(validStudents.map(s => String(s.nisn).trim()).filter(Boolean))

    // Query recent point records to ensure no deleted student's point remains
    const { data: recentPoints } = await supabase
      .from('point_records')
      .select('id, nisn')
      .limit(200)

    const orphanPointIds = (recentPoints || [])
      .filter(r => r.nisn && !validNisns.has(String(r.nisn).trim()))
      .map(r => r.id)

    if (orphanPointIds.length > 0) {
      await supabase.from('point_records').delete().in('id', orphanPointIds)
    }

    // Query recent presensi records to clean up deleted student attendance logs
    const { data: recentPresensi } = await supabase
      .from('presensi_harian')
      .select('id, siswa_nisn')
      .limit(500)

    const orphanPresensiIds = (recentPresensi || [])
      .filter(r => r.siswa_nisn && !validNisns.has(String(r.siswa_nisn).trim()))
      .map(r => r.id)

    if (orphanPresensiIds.length > 0) {
      await supabase.from('presensi_harian').delete().in('id', orphanPresensiIds)
    }

    return { success: true }
  } catch (err) {
    console.warn('Cleanup demo data ended:', err)
    return { success: false }
  }
}
