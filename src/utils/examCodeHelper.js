/**
 * examCodeHelper.js
 * Utility untuk menghitung nomor urut kelas (absen), nomor urut sekolah se-angkatan/se-sekolah,
 * serta mengevaluasi formula pola kode ujian fleksibel untuk Kartu Peserta Ujian SMP Budi Mulia.
 */

export const DEFAULT_EXAM_CODE_PATTERN = '{KELAS}{ABSEN:2}{URUT_SEKOLAH:3}'

export const EXAM_CODE_TOKENS = [
  { token: '{KELAS}', label: 'Kelas (misal: 9A)', desc: 'Nama kelas singkat tanpa spasi' },
  { token: '{TINGKAT}', label: 'Tingkat (misal: 9)', desc: 'Digit tingkat kelas (7, 8, atau 9)' },
  { token: '{INDEX_ROMBEL:2}', label: 'Urutan Rombel 2-Digit (9A=01, 9B=02)', desc: 'Nomor urut kelas/rombel dalam angkatannya' },
  { token: '{URUT_TINGKAT:3}', label: 'Urut Se-Tingkat 3-Digit (9A: 001-032, 9B: 033-064)', desc: 'Nomor urut siswa se-tingkat kelas 7/8/9 (lanjut terus, tidak reset per rombel)' },
  { token: '{URUT_TINGKAT:4}', label: 'Urut Se-Tingkat 4-Digit (misal: 0034)', desc: 'Nomor urut siswa se-tingkat 4-digit' },
  { token: '{ABSEN:2}', label: 'Absen 2-Digit (misal: 01)', desc: 'Nomor urut absen siswa di kelasnya' },
  { token: '{ABSEN:1}', label: 'Absen Asli (misal: 1)', desc: 'Nomor absen tanpa awalan angka nol' },
  { token: '{URUT_ROMBEL:2}', label: 'No. Urut Siswa per Rombel 2-Digit (01 s.d. 32)', desc: 'Nomor urut siswa dalam rombelnya (reset per kelas)' },
  { token: '{URUT_ROMBEL:3}', label: 'No. Urut Siswa per Rombel 3-Digit (001 s.d. 032)', desc: 'Nomor urut siswa dalam rombelnya 3-digit' },
  { token: '{URUT_SEKOLAH:3}', label: 'Urut Sekolah 3-Digit (misal: 002)', desc: 'Nomor urut se-sekolah dari 7A s.d. 9D' },
  { token: '{URUT_SEKOLAH:4}', label: 'Urut Sekolah 4-Digit (misal: 0002)', desc: 'Nomor urut se-sekolah 4 digit' },
  { token: '{NISN_AKHIR:3}', label: 'NISN 3-Digit Akhir', desc: '3 digit angka paling belakang dari NISN' },
  { token: '{NISN_AKHIR:4}', label: 'NISN 4-Digit Akhir', desc: '4 digit angka paling belakang dari NISN' },
  { token: '{NISN}', label: 'NISN Lengkap', desc: 'Nomor Induk Siswa Nasional lengkap' },
  { token: '{NIPD}', label: 'NIPD / NIS', desc: 'Nomor Induk Peserta Didik sekolah' },
  { token: '{TAHUN}', label: 'Tahun Singkat (misal: 26)', desc: '2 digit tahun ajaran aktif' },
  { token: '{TAHUN_FULL}', label: 'Tahun Lengkap (misal: 2026)', desc: '4 digit tahun kalender' }
]

/**
 * Ekstrak tingkat dan paralel kelas dari teks string (misal "Kelas 9D", "9D", "9-D", "VII A")
 */
export const parseClassComponents = (className = '') => {
  const str = String(className || '').toUpperCase().trim()
  if (!str || str === '-') return { grade: 99, section: 'Z', clean: '-' }

  const cleanStr = str.replace(/\b(KELAS|TINGKAT|RUANG|SEKSI|ROOM)\b/gi, '').trim()

  let grade = 99
  if (/\bIX\b|^IX/i.test(cleanStr) || /\b9\b|^9/i.test(cleanStr)) grade = 9
  else if (/\bVIII\b|^VIII/i.test(cleanStr) || /\b8\b|^8/i.test(cleanStr)) grade = 8
  else if (/\bVII\b|^VII/i.test(cleanStr) || /\b7\b|^7/i.test(cleanStr)) grade = 7
  else {
    const num = cleanStr.match(/\d+/)
    if (num) grade = parseInt(num[0], 10)
  }

  // Hapus angka dan angka Romawi untuk mengisolasi huruf paralel kelas (A, B, C, D)
  const withoutGrade = cleanStr.replace(/\b(VII|VIII|IX|[0-9])\b/gi, '').replace(/[0-9]/g, '').trim()
  const sectionMatch = withoutGrade.match(/[A-Z]/)
  const section = sectionMatch ? sectionMatch[0] : 'A'

  const clean = grade < 90 ? `${grade}${section}` : (cleanStr || str)
  return { grade, section, clean }
}

/**
 * Comparator untuk mengurutkan kelas secara hierarki (7A..7D, 8A..8D, 9A..9D)
 */
export const compareClassNames = (classA, classB) => {
  const a = parseClassComponents(classA)
  const b = parseClassComponents(classB)
  if (a.grade !== b.grade) return a.grade - b.grade
  return a.section.localeCompare(b.section)
}

/**
 * Evaluasi token formula menjadi teks kode ujian sesungguhnya
 */
export const resolveExamCode = (pattern, studentContext = {}) => {
  if (!pattern) return ''
  let result = pattern

  const {
    kelas = '',
    tingkat = '',
    paralel = '',
    absen = 1,
    urutRombel = 1,
    urutKelas = 1,
    urutTingkat = 1,
    urutSekolah = 1,
    indexRombel = 1,
    nisn = '',
    nipd = '',
    tahun = '26',
    tahunFull = '2026'
  } = studentContext || {}

  const cleanNisn = String(nisn || '').replace(/\D/g, '')
  const nisnAkhir3 = cleanNisn.length >= 3 ? cleanNisn.slice(-3) : cleanNisn.padStart(3, '0')
  const nisnAkhir4 = cleanNisn.length >= 4 ? cleanNisn.slice(-4) : cleanNisn.padStart(4, '0')

  // Replacements
  result = result.replace(/\{KELAS\}/g, String(kelas || ''))
  result = result.replace(/\{TINGKAT\}/g, String(tingkat || ''))
  result = result.replace(/\{PARALEL\}/g, String(paralel || ''))

  // Nomor Urutan Rombel itu sendiri (misal 9A = 01, 9B = 02, 9C = 03)
  const idxRombel = Number(indexRombel || 1)
  result = result.replace(/\{(?:INDEX_ROMBEL|NO_ROMBEL):3\}/g, String(idxRombel).padStart(3, '0'))
  result = result.replace(/\{(?:INDEX_ROMBEL|NO_ROMBEL):2\}/g, String(idxRombel).padStart(2, '0'))
  result = result.replace(/\{(?:INDEX_ROMBEL|NO_ROMBEL)(?::1)?\}/g, String(idxRombel))

  // Nomor Urut Siswa Se-Tingkat / Angkatan (9A: 001-032, 9B: 033-064, dst - TIDAK reset tiap kelas)
  const tingkatNum = Number(urutTingkat || urutSekolah || 1)
  result = result.replace(/\{URUT_TINGKAT:4\}/g, String(tingkatNum).padStart(4, '0'))
  result = result.replace(/\{URUT_TINGKAT:3\}/g, String(tingkatNum).padStart(3, '0'))
  result = result.replace(/\{URUT_TINGKAT:2\}/g, String(tingkatNum).padStart(2, '0'))
  result = result.replace(/\{URUT_TINGKAT(?::1)?\}/g, String(tingkatNum))

  // No. Urut Siswa per Rombel (nomor urut siswa 1 s.d. 32 di dalam kelasnya)
  const rombelNum = Number(urutRombel || urutKelas || absen || 1)
  result = result.replace(/\{(?:URUT_ROMBEL|URUT_KELAS):4\}/g, String(rombelNum).padStart(4, '0'))
  result = result.replace(/\{(?:URUT_ROMBEL|URUT_KELAS):3\}/g, String(rombelNum).padStart(3, '0'))
  result = result.replace(/\{(?:URUT_ROMBEL|URUT_KELAS):2\}/g, String(rombelNum).padStart(2, '0'))
  result = result.replace(/\{(?:URUT_ROMBEL|URUT_KELAS)(?::1)?\}/g, String(rombelNum))

  // Absen formatting
  result = result.replace(/\{ABSEN:2\}/g, String(absen).padStart(2, '0'))
  result = result.replace(/\{ABSEN:3\}/g, String(absen).padStart(3, '0'))
  result = result.replace(/\{ABSEN(?::1)?\}/g, String(absen))

  // Urut sekolah formatting
  result = result.replace(/\{URUT_SEKOLAH:4\}/g, String(urutSekolah).padStart(4, '0'))
  result = result.replace(/\{URUT_SEKOLAH:3\}/g, String(urutSekolah).padStart(3, '0'))
  result = result.replace(/\{URUT_SEKOLAH:2\}/g, String(urutSekolah).padStart(2, '0'))
  result = result.replace(/\{URUT_SEKOLAH(?::1)?\}/g, String(urutSekolah))

  // Identitas
  result = result.replace(/\{NISN_AKHIR:3\}/g, nisnAkhir3)
  result = result.replace(/\{NISN_AKHIR:4\}/g, nisnAkhir4)
  result = result.replace(/\{NISN\}/g, cleanNisn || '-')
  result = result.replace(/\{NIPD\}/g, String(nipd || '-'))

  // Tahun
  result = result.replace(/\{TAHUN\}/g, String(tahun || '26'))
  result = result.replace(/\{TAHUN_FULL\}/g, String(tahunFull || '2026'))

  return result
}

/**
 * Hitung urutan absen kelas dan urutan sekolah secara presisi
 * Mengurutkan siswa:
 * 1. Kelas dari kecil ke besar (7A -> 7D -> 8A -> 8D -> 9A -> 9D)
 * 2. Di dalam kelas, diurutkan menurut nama siswa secara alfabetis (A-Z)
 */
export const calculateStudentExamRanks = (students = [], pattern = DEFAULT_EXAM_CODE_PATTERN, options = {}) => {
  if (!Array.isArray(students) || students.length === 0) return []

  const activeTaName = options.activeTaName || '2026/2027'
  const yearMatch = activeTaName.match(/\b(\d{2,4})\b/)
  const yearFull = yearMatch ? (yearMatch[1].length === 2 ? `20${yearMatch[1]}` : yearMatch[1]) : '2026'
  const yearShort = yearFull.slice(-2)

  // 1. Filter hanya siswa dengan kelas valid
  const validStudents = students.filter(s => {
    const raw = s.rawStudent || s || {}
    const k = String(s.kelas || raw.kelas || '').trim()
    return k && k !== '-' && k !== 'null' && k !== 'undefined'
  })

  // 2. Kelompokkan per kelas
  const groupedByClass = {}
  validStudents.forEach(st => {
    const raw = st.rawStudent || st || {}
    const rawClass = String(st.kelas || raw.kelas || '').trim()
    const { clean } = parseClassComponents(rawClass)
    const classKey = clean || rawClass

    if (!groupedByClass[classKey]) {
      groupedByClass[classKey] = {
        classKey,
        rawClass,
        students: []
      }
    }
    groupedByClass[classKey].students.push(st)
  })

  // 3. Urutkan daftar kelas secara hierarkis (7A, 7B, ..., 8A, ..., 9D)
  const sortedClasses = Object.values(groupedByClass).sort((a, b) => {
    return compareClassNames(a.classKey, b.classKey)
  })

  // 4. Di setiap kelas, urutkan siswa menurut Nama (A-Z)
  let currentSchoolRank = 1
  const rankPerGrade = {}
  const rombelIndexPerGrade = {}
  const rankedResults = []

  sortedClasses.forEach(cls => {
    const classInfo = parseClassComponents(cls.classKey)
    const gr = classInfo.grade < 90 ? classInfo.grade : 'other'

    if (!rankPerGrade[gr]) rankPerGrade[gr] = 1
    if (!rombelIndexPerGrade[gr]) rombelIndexPerGrade[gr] = 1

    const currentRombelIndex = rombelIndexPerGrade[gr]++

    // Urutkan siswa dalam kelas berdasarkan nama lengkap A-Z
    const sortedStudentsInClass = [...cls.students].sort((a, b) => {
      const rawA = a.rawStudent || a || {}
      const rawB = b.rawStudent || b || {}
      const nameA = String(a.nama || rawA.nama_lengkap || rawA.nama || '').trim().toLowerCase()
      const nameB = String(b.nama || rawB.nama_lengkap || rawB.nama || '').trim().toLowerCase()
      return nameA.localeCompare(nameB)
    })

    sortedStudentsInClass.forEach((st, idx) => {
      const raw = st.rawStudent || st || {}
      const noUrutRombel = idx + 1
      const noUrutTingkat = rankPerGrade[gr]++
      const noAbsen = st.no_absen || raw.no_absen || (idx + 1)
      const noUrutSekolah = currentSchoolRank++

      const nisn = String(st.nisn || raw.nisn || '').trim()
      const nipd = String(st.nipd || raw.nipd || raw.nis || '').trim()
      const nama = String(st.nama || raw.nama_lengkap || raw.nama || '').trim()

      const context = {
        kelas: classInfo.clean,
        tingkat: classInfo.grade < 90 ? String(classInfo.grade) : '',
        paralel: classInfo.section || '',
        absen: noAbsen,
        urutRombel: noUrutRombel,
        urutKelas: noUrutRombel,
        urutTingkat: noUrutTingkat,
        urutSekolah: noUrutSekolah,
        indexRombel: currentRombelIndex,
        nisn,
        nipd,
        tahun: yearShort,
        tahunFull: yearFull
      }

      const kodeUjian = resolveExamCode(pattern, context)

      // Kredensial Login Portal Ujian
      // Default username: kodeUjian (atau NISN jika diinginkan)
      const portalUsername = (options.usernameSource === 'nisn' && nisn && nisn !== '-')
        ? nisn
        : kodeUjian

      // Password: kode_akses siswa di DB atau tanggal lahir DDMMYYYY atau custom default
      let portalPassword = options.customPassword || ''
      if (!portalPassword) {
        if (options.passwordSource === 'tgl_lahir' && raw.tanggal_lahir) {
          try {
            const d = new Date(raw.tanggal_lahir)
            const dd = String(d.getDate()).padStart(2, '0')
            const mm = String(d.getMonth() + 1).padStart(2, '0')
            const yyyy = d.getFullYear()
            portalPassword = `${dd}${mm}${yyyy}`
          } catch {
            portalPassword = raw.kode_akses || '123456'
          }
        } else {
          // Bawaan kode_akses dari database siswa
          portalPassword = raw.kode_akses || st.kode_akses || `BM${String(noUrutSekolah).padStart(3, '0')}`
        }
      }

      rankedResults.push({
        ...st,
        rawStudent: raw,
        nisn,
        nipd,
        nama,
        kelas: classInfo.clean,
        rawKelas: cls.rawClass,
        noAbsen,
        noUrutRombel,
        noUrutTingkat,
        noUrutSekolah,
        indexRombel: currentRombelIndex,
        kodeUjian,
        portalUsername,
        portalPassword,
        classComponents: classInfo
      })
    })
  })

  return rankedResults
}
