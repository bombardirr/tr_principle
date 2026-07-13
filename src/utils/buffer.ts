export function copyArrayBuffer(buf: ArrayBuffer): ArrayBuffer {
  const out = new ArrayBuffer(buf.byteLength)
  new Uint8Array(out).set(new Uint8Array(buf))
  return out
}

export function toArrayBuffer(data: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (data instanceof ArrayBuffer) return copyArrayBuffer(data)
  const out = new ArrayBuffer(data.byteLength)
  new Uint8Array(out).set(data)
  return out
}
