function docxBasename(filename: string): string {
  const normalized = filename.replace(/\\/g, '/')
  const slash = normalized.lastIndexOf('/')
  return slash >= 0 ? normalized.slice(slash + 1) : normalized
}

function bytesToHex(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes)
  return Array.from(view, b => b.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return bytesToHex(digest)
}

export async function fingerprintDocx(
  filename: string,
  docx: ArrayBuffer,
): Promise<{ filename: string; hash: string }> {
  return {
    filename: docxBasename(filename),
    hash: await sha256Hex(docx),
  }
}

export function fingerprintMismatch(
  job: { sourceFilename?: string | null; sourceHash?: string | null },
  local: { filename: string; hash: string },
): boolean {
  const jobHash = (job.sourceHash ?? '').trim()
  if (jobHash) {
    return jobHash !== local.hash
  }
  const jobName = (job.sourceFilename ?? '').trim()
  if (!jobName) {
    return false
  }
  return jobName.toLowerCase() !== local.filename.trim().toLowerCase()
}
