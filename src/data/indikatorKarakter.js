// ─── Data Master Indikator & Elemen Penilaian Karakter (Afektif) SMP Budi Mulia ───

export const ELEMEN_KARAKTER = [
  {
    id: 'keimanan',
    nomor: 1,
    nama: 'Keimanan dan Ketakwaan',
    deskripsiSingkat: 'Sikap spiritual, ketaatan beribadah, integritas kejujuran dan kepedulian sesama.',
    subIndikator: [
      { id: 'berdoa_bersyukur', kode: 'a', nama: 'Berdoa dan Bersyukur', defaultContoh: 'Murid berdoa dengan khidmat dan bersyukur saat mengawali serta mengakhiri kegiatan pembelajaran.' },
      { id: 'peduli', kode: 'b', nama: 'Peduli', defaultContoh: 'Murid menunjukkan sikap peduli dengan membantu rekan yang mengalami kesulitan belajar.' },
      { id: 'jujur', kode: 'c', nama: 'Jujur', defaultContoh: 'Murid menunjukkan sikap jujur dalam mengerjakan tugas, asesmen, dan pelaporan hasil kerja.' }
    ]
  },
  {
    id: 'kewargaan',
    nomor: 2,
    nama: 'Kewargaan',
    deskripsiSingkat: 'Kecintaan terhadap bangsa, penghargaan atas perbedaan, dan ketaatan tata tertib.',
    subIndikator: [
      { id: 'nasionalisme', kode: 'a', nama: 'Nasionalisme', defaultContoh: 'Murid menunjukkan rasa cinta tanah air dan bangga menggunakan bahasa Indonesia yang baik.' },
      { id: 'berkebhinekaan', kode: 'b', nama: 'Berkebhinekaan', defaultContoh: 'Murid menghargai perbedaan pendapat dan latar belakang saat berinteraksi di kelas.' },
      { id: 'menaati_peraturan', kode: 'c', nama: 'Menaati Peraturan Pembelajaran', defaultContoh: 'Murid tertib mematuhi tata tertib pembelajaran dan menjaga suasana belajar yang kondusif.' }
    ]
  },
  {
    id: 'kolaborasi',
    nomor: 3,
    nama: 'Kolaborasi',
    deskripsiSingkat: 'Kemampuan bersinergi, gotong royong, dan membangun relasi positif dalam kelompok.',
    subIndikator: [
      { id: 'kerja_sama', kode: 'a', nama: 'Kerja Sama', defaultContoh: 'Murid aktif bekerja sama membagi peran dan menyelesaikan tugas kelompok dengan baik.' },
      { id: 'gotong_royong', kode: 'b', nama: 'Gotong Royong', defaultContoh: 'Murid memiliki semangat gotong royong dalam merapikan fasilitas kelas dan membantu sesama.' },
      { id: 'rasa_empati', kode: 'c', nama: 'Rasa Empati', defaultContoh: 'Murid mendengarkan dan menghargai pandangan rekan sekelas saat berdiskusi kelompok.' }
    ]
  },
  {
    id: 'kemandirian',
    nomor: 4,
    nama: 'Kemandirian',
    deskripsiSingkat: 'Tanggung jawab pribadi, kedisiplinan kerja, dan inisiatif tanpa selalu diarahkan.',
    subIndikator: [
      { id: 'bertanggung_jawab', kode: 'a', nama: 'Bertanggung Jawab', defaultContoh: 'Murid bertanggung jawab menyelesaikan tugas individu dengan tuntas.' },
      { id: 'disiplin', kode: 'b', nama: 'Disiplin', defaultContoh: 'Murid menunjukkan kedisiplinan dalam mengumpulkan tugas sesuai batas waktu.' },
      { id: 'inisiatif', kode: 'c', nama: 'Inisiatif', defaultContoh: 'Murid berinisiatif mencari referensi belajar mandiri untuk memperdalam pemahaman.' }
    ]
  },
  {
    id: 'komunikasi',
    nomor: 5,
    nama: 'Komunikasi',
    deskripsiSingkat: 'Keberanian berbicara, kejelasan menyampaikan pendapat, dan kesantunan berbahasa.',
    subIndikator: [
      { id: 'partisipasi_aktif', kode: 'a', nama: 'Partisipasi Aktif', defaultContoh: 'Murid berpartisipasi aktif dalam sesi tanya jawab dan diskusi kelas.' },
      { id: 'percaya_diri', kode: 'b', nama: 'Percaya Diri', defaultContoh: 'Murid percaya diri ketika mempresentasikan hasil pekerjaannya di hadapan teman sekelas.' },
      { id: 'santun', kode: 'c', nama: 'Santun', defaultContoh: 'Murid berkomunikasi secara sopan dan santun kepada guru serta teman sekelas.' }
    ]
  },
  {
    id: 'kesehatan',
    nomor: 6,
    nama: 'Kesehatan',
    deskripsiSingkat: 'Kebersihan diri dan lingkungan serta keaktifan fisik dalam kegiatan belajar.',
    subIndikator: [
      { id: 'menjaga_kebersihan', kode: 'a', nama: 'Menjaga kebersihan', defaultContoh: 'Murid senantiasa menjaga kebersihan area meja belajar dan membuang sampah pada tempatnya.' },
      { id: 'bergerak_aktif', kode: 'b', nama: 'Bergerak Aktif', defaultContoh: 'Murid bersemangat dan bergerak aktif mengikuti setiap aktivitas pembelajaran di kelas.' }
    ]
  },
  {
    id: 'kreativitas',
    nomor: 7,
    nama: 'Kreativitas',
    deskripsiSingkat: 'Kesiapan menghasilkan gagasan baru, orisinalitas ide, dan keberanian mencoba.',
    subIndikator: [
      { id: 'memberikan_ide', kode: 'a', nama: 'Memberikan ide', defaultContoh: 'Murid memberikan ide-ide kreatif dan inovatif dalam penyelesaian tugas.' },
      { id: 'berani_mencoba', kode: 'b', nama: 'Berani mencoba', defaultContoh: 'Murid berani mencoba pendekatan dan gagasan baru tanpa ragu.' }
    ]
  },
  {
    id: 'penalaran_kritis',
    nomor: 8,
    nama: 'Penalaran Kritis',
    deskripsiSingkat: 'Kemampuan menganalisis informasi, membedakan fakta/opini, dan berpikir logis.',
    subIndikator: [
      { id: 'mencari_solusi', kode: 'a', nama: 'Mencari Solusi', defaultContoh: 'Murid mampu menganalisis masalah dan merumuskan solusi secara tepat.' },
      { id: 'fakta_opini', kode: 'b', nama: 'Membedakan fakta dan opini', defaultContoh: 'Murid cermat membedakan data faktual dan opini dalam materi pembelajaran.' },
      { id: 'berpikir_logis', kode: 'c', nama: 'Berpikir logis, matematis', defaultContoh: 'Murid menunjukkan alur berpikir yang logis dan sistematis dalam menarik kesimpulan.' }
    ]
  }
]

// ─── Tabel B: Rentang Penilaian Sikap (Afektif) ───
export const RENTANG_NILAI_KARAKTER = [
  {
    predikat: 'A',
    rentang: '92 - 100',
    min: 92,
    max: 100,
    kriteria: 'Sangat Baik',
    deskripsiKriteria: 'Menunjukkan dan konsisten untuk bersikap (membudaya)',
    bgBadge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    badgeDark: 'bg-emerald-600 text-white'
  },
  {
    predikat: 'B',
    rentang: '83 - 91',
    min: 83,
    max: 91,
    kriteria: 'Baik',
    deskripsiKriteria: 'Menunjukkan, ada usaha untuk bersikap namun tidak konsisten',
    bgBadge: 'bg-sky-50 text-sky-700 border-sky-200',
    badgeDark: 'bg-sky-600 text-white'
  },
  {
    predikat: 'C',
    rentang: '75 - 82',
    min: 75,
    max: 82,
    kriteria: 'Cukup',
    deskripsiKriteria: 'Sudah menunjukkan usaha untuk bersikap',
    bgBadge: 'bg-amber-50 text-amber-700 border-amber-200',
    badgeDark: 'bg-amber-600 text-white'
  },
  {
    predikat: 'D',
    rentang: '65 - 74',
    min: 65,
    max: 74,
    kriteria: 'Kurang',
    deskripsiKriteria: 'Sama sekali tidak bersikap',
    bgBadge: 'bg-rose-50 text-rose-700 border-rose-200',
    badgeDark: 'bg-rose-600 text-white'
  }
]

/**
 * Mendapatkan predikat sikap berdasarkan nilai angka (0 - 100)
 */
export function getPredikatKarakter(nilai) {
  if (nilai === undefined || nilai === null || nilai === '' || isNaN(Number(nilai))) return null
  const num = Math.round(Number(nilai))
  if (num >= 92) return RENTANG_NILAI_KARAKTER[0]
  if (num >= 83) return RENTANG_NILAI_KARAKTER[1]
  if (num >= 75) return RENTANG_NILAI_KARAKTER[2]
  return RENTANG_NILAI_KARAKTER[3]
}

/**
 * Format string penyimpanan deskripsi karakter
 * Format standar: [Elemen: X | Indikator: Y] Keterangan Observasi
 */
export function formatKarakterDeskripsi(elemenNama, subIndikatorNama, catatanObservasi) {
  const elem = (elemenNama || '').trim()
  const ind = (subIndikatorNama || '').trim()
  const cat = (catatanObservasi || '').trim()

  if (elem && ind) {
    return `[${elem} - ${ind}] ${cat}`
  } else if (elem) {
    return `[${elem}] ${cat}`
  }
  return cat
}

/**
 * Parsing teks deskripsi karakter untuk memisahkan Elemen, Sub-Indikator, dan Catatan Observasi
 */
export function parseKarakterDeskripsi(rawDeskripsi) {
  if (!rawDeskripsi || typeof rawDeskripsi !== 'string') {
    return { elemenNama: '', subIndikatorNama: '', catatan: '', raw: '' }
  }

  const str = rawDeskripsi.trim()

  // Format 1: [Elemen - SubIndikator] Catatan
  const match1 = str.match(/^\[([^\]\-]+)\s*-\s*([^\]]+)\]\s*(.*)$/i)
  if (match1) {
    return {
      elemenNama: match1[1].trim(),
      subIndikatorNama: match1[2].trim(),
      catatan: match1[3].trim(),
      raw: str
    }
  }

  // Format 2: [Elemen] Catatan
  const match2 = str.match(/^\[([^\]]+)\]\s*(.*)$/i)
  if (match2) {
    const header = match2[1].trim()
    const foundElem = ELEMEN_KARAKTER.find(e => e.nama.toLowerCase() === header.toLowerCase())
    if (foundElem) {
      return {
        elemenNama: foundElem.nama,
        subIndikatorNama: '',
        catatan: match2[2].trim(),
        raw: str
      }
    }
  }

  // Fallback: cari apakah ada nama elemen atau sub-indikator di dalam teks
  for (const elem of ELEMEN_KARAKTER) {
    for (const sub of elem.subIndikator) {
      if (str.toLowerCase().includes(sub.nama.toLowerCase())) {
        return {
          elemenNama: elem.nama,
          subIndikatorNama: sub.nama,
          catatan: str,
          raw: str
        }
      }
    }
    if (str.toLowerCase().includes(elem.nama.toLowerCase())) {
      return {
        elemenNama: elem.nama,
        subIndikatorNama: '',
        catatan: str,
        raw: str
      }
    }
  }

  return {
    elemenNama: '',
    subIndikatorNama: '',
    catatan: str,
    raw: str
  }
}

/**
 * Mengetahui elemen/indikator apa saja yang sudah digunakan di BAB-BAB lain
 */
export function getUsedKarakterInSubject(komponenList = [], currentBab = '', isKarakterKomponenFn) {
  const used = []
  komponenList.forEach(k => {
    const isKar = isKarakterKomponenFn ? isKarakterKomponenFn(k.nama) : (k.nama || '').toUpperCase().includes('KARAKTER')
    if (isKar && k.bab_nama && k.bab_nama !== currentBab) {
      const parsed = parseKarakterDeskripsi(k.deskripsi)
      if (parsed.elemenNama || parsed.subIndikatorNama) {
        used.push({
          bab_nama: k.bab_nama,
          elemenNama: parsed.elemenNama,
          subIndikatorNama: parsed.subIndikatorNama
        })
      }
    }
  })
  return used
}
