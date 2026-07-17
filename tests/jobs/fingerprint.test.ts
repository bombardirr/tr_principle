import { describe, expect, it } from 'vitest'
import { fingerprintDocx, fingerprintMismatch } from '@/jobs/fingerprint'

describe('fingerprintMismatch', () => {
  it('returns true when job hash differs from local hash', () => {
    expect(
      fingerprintMismatch(
        { sourceHash: 'abc', sourceFilename: 'manual.docx' },
        { hash: 'def', filename: 'manual.docx' },
      ),
    ).toBe(true)
  })

  it('returns false when job hash matches local hash', () => {
    expect(
      fingerprintMismatch(
        { sourceHash: 'abc', sourceFilename: 'other.docx' },
        { hash: 'abc', filename: 'manual.docx' },
      ),
    ).toBe(false)
  })

  it('returns true when job has no hash and filenames differ case-insensitively', () => {
    expect(
      fingerprintMismatch(
        { sourceHash: null, sourceFilename: 'Manual.docx' },
        { hash: 'any', filename: 'other.docx' },
      ),
    ).toBe(true)
  })

  it('returns false when job has no hash and filenames match case-insensitively', () => {
    expect(
      fingerprintMismatch(
        { sourceHash: '', sourceFilename: 'Manual.DOCX' },
        { hash: 'different', filename: 'manual.docx' },
      ),
    ).toBe(false)
  })

  it('returns false when job has neither hash nor filename', () => {
    expect(
      fingerprintMismatch(
        { sourceHash: null, sourceFilename: null },
        { hash: 'abc', filename: 'manual.docx' },
      ),
    ).toBe(false)
  })
})

describe('fingerprintDocx', () => {
  it('returns basename from nested path', async () => {
    const docx = new ArrayBuffer(0)
    const result = await fingerprintDocx('folder/sub/manual.docx', docx)
    expect(result.filename).toBe('manual.docx')
    expect(result.hash).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
  })

  it('strips windows path separators to basename', async () => {
    const docx = new ArrayBuffer(0)
    const result = await fingerprintDocx(String.raw`C:\Users\work\source.docx`, docx)
    expect(result.filename).toBe('source.docx')
    expect(result.hash).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
  })

  it('hashes non-empty bytes', async () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04])
    const docx = bytes.buffer
    const result = await fingerprintDocx('file.docx', docx)
    expect(result.filename).toBe('file.docx')
    expect(result.hash).toBe('8dcc7e601606217f3b754766511182a916b17e9a26a94c9d887104eba92e9bb2')
  })
})
