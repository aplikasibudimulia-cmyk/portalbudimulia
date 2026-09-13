import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { saveAs } from 'file-saver'
import * as XLSX from 'xlsx'

/**
 * Convert Blob or ArrayBuffer to base64 string
 */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const res = reader.result
      if (typeof res === 'string') {
        const base64 = res.includes(',') ? res.split(',')[1] : res
        resolve(base64)
      } else {
        reject(new Error('Failed to convert blob to base64 string'))
      }
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * Universal File Downloader
 * Supports Web (browser download) & Native Android/iOS (Filesystem + Native Share/Open sheet)
 * 
 * @param {Blob|ArrayBuffer|Uint8Array|string} data - File data
 * @param {string} filename - Desired filename with extension (e.g. 'rekap.xlsx')
 * @param {string} [mimeType='application/octet-stream'] - MIME type
 */
export async function downloadFile(data, filename, mimeType = 'application/octet-stream') {
  let blob
  if (data instanceof Blob) {
    blob = data
  } else if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
    blob = new Blob([data], { type: mimeType })
  } else if (typeof data === 'string') {
    blob = new Blob([data], { type: mimeType })
  } else {
    throw new Error('Unsupported data format for downloadFile')
  }

  // If on Web Browser, use file-saver
  if (!Capacitor.isNativePlatform()) {
    saveAs(blob, filename)
    return
  }

  // Native Android / iOS
  try {
    const base64 = await blobToBase64(blob)

    // Save to Cache directory first (guaranteed writable without special runtime permissions)
    const writeResult = await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Cache,
      recursive: true
    })

    // Also attempt saving to Documents directory as a backup
    try {
      await Filesystem.writeFile({
        path: filename,
        data: base64,
        directory: Directory.Documents,
        recursive: true
      })
    } catch {
      // Documents write may fail on some Android versions if permission is restricted, ignore
    }

    // Open Native Share / Save / Open / Print dialog
    await Share.share({
      title: filename,
      files: [writeResult.uri],
      url: writeResult.uri,
      dialogTitle: `Buka, Cetak, atau Simpan ${filename}`
    })
  } catch (err) {
    console.error('[fileDownloader] Native share/save error, fallback to saveAs:', err)
    saveAs(blob, filename)
  }
}

/**
 * Helper to download an XLSX workbook
 * @param {Object} workbook - XLSX workbook object
 * @param {string} filename - Desired filename (e.g. 'data.xlsx')
 */
export async function downloadWorkbook(workbook, filename) {
  const mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  await downloadFile(buffer, filename, mimeType)
}

/**
 * Helper to download a jsPDF document
 * @param {Object} doc - jsPDF instance
 * @param {string} filename - Desired filename (e.g. 'surat.pdf')
 */
export async function downloadPdf(doc, filename) {
  const mimeType = 'application/pdf'
  if (Capacitor.isNativePlatform()) {
    const arrayBuffer = doc.output('arraybuffer')
    await downloadFile(arrayBuffer, filename, mimeType)
  } else {
    doc.save(filename)
  }
}
