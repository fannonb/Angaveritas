/** Inspect file bytes, independent of the browser's claimed Content-Type. */
export function uploadProblem(mime: string, declaredSize: number, actualSize: number, head: Uint8Array) {
  const limit = mime.startsWith('video/') ? 200 * 1024 * 1024 : 50 * 1024 * 1024
  if (actualSize < 1 || actualSize > limit || actualSize !== declaredSize) return 'The stored file size does not match the upload or exceeds the limit.'
  const bytes = Buffer.from(head)
  const ascii = bytes.subarray(0, 32).toString('latin1')
  const hex = bytes.subarray(0, 12).toString('hex')
  const signatures: Record<string, boolean> = {
    'image/jpeg': hex.startsWith('ffd8ff'),
    'image/png': hex.startsWith('89504e470d0a1a0a'),
    'image/webp': ascii.startsWith('RIFF') && ascii.slice(8,12) === 'WEBP',
    'image/heic': ascii.slice(4,8) === 'ftyp' && /hei[csx]|mif1/.test(ascii.slice(8)),
    'image/heif': ascii.slice(4,8) === 'ftyp' && /hei[csx]|mif1/.test(ascii.slice(8)),
    'video/mp4': ascii.slice(4,8) === 'ftyp',
    'video/quicktime': ascii.slice(4,8) === 'ftyp' || ['moov','mdat','wide'].includes(ascii.slice(4,8)),
    'video/webm': hex.startsWith('1a45dfa3'),
    'application/pdf': ascii.startsWith('%PDF-'),
    'application/msword': hex.startsWith('d0cf11e0a1b11ae1'),
    'application/vnd.ms-excel': hex.startsWith('d0cf11e0a1b11ae1'),
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': hex.startsWith('504b0304'),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': hex.startsWith('504b0304'),
    'text/plain': !bytes.includes(0),
    'text/csv': !bytes.includes(0),
  }
  if (!signatures[mime]) return 'The file content does not match its declared type.'
  return null
}
