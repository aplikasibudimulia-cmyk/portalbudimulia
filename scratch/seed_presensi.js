import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

const nisn = "0117023562"
const kelas = "9D"
const tahun_ajaran_id = "4e1ae0ff-a398-488c-a940-14dc69f337d9"

const dummyData = []
const statuses = ['H', 'H', 'H', 'T', 'S', 'I']
const getRandomStatus = () => statuses[Math.floor(Math.random() * statuses.length)]

// Bikin data 5 hari ke belakang
for (let i = 1; i <= 5; i++) {
  const d = new Date()
  d.setDate(d.getDate() - i)
  
  // Skip weekend (Sabtu/Minggu)
  if (d.getDay() === 0 || d.getDay() === 6) continue

  const tglStr = d.toISOString().split('T')[0]
  const statusMasuk = getRandomStatus()
  
  // Data Masuk
  dummyData.push({
    tanggal: tglStr,
    tahun_ajaran_id,
    kelas,
    siswa_nisn: nisn,
    status: statusMasuk,
    waktu: statusMasuk === 'T' ? "07:15:00" : "06:30:00",
    metode: "qr_scan",
    tipe: "masuk",
    selfie_url: "https://i.pravatar.cc/300?img=" + (i * 2)
  })

  // Data Pulang (Jika masuknya bukan S, I, A)
  if (['H', 'T'].includes(statusMasuk)) {
    dummyData.push({
      tanggal: tglStr,
      tahun_ajaran_id,
      kelas,
      siswa_nisn: nisn,
      status: "H",
      waktu: "15:30:00",
      metode: "qr_scan",
      tipe: "pulang",
      selfie_url: "https://i.pravatar.cc/300?img=" + (i * 2 + 1)
    })
  }
}

async function seed() {
  console.log("Menyuntikkan data dummy presensi...")
  const { error } = await supabase.from('presensi_harian').insert(dummyData)
  if (error) {
    console.error("Error inserting data:", error)
  } else {
    console.log("Berhasil menambahkan " + dummyData.length + " data presensi percobaan!")
  }
}

seed()
