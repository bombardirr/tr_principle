export interface EditorScrollSnapshot {
  pageY: number
  /** Scroll of translation (result) preview. */
  previewY: number
  /** Scroll of source (original) preview — independent of previewY. */
  previewSourceY: number
  activeSegmentId: string | null
}

const PREFIX = 'appzac-editor-scroll:'

function storageKey(projectId: string): string {
  return `${PREFIX}${projectId}`
}

const emptySnapshot = (): EditorScrollSnapshot => ({
  pageY: 0,
  previewY: 0,
  previewSourceY: 0,
  activeSegmentId: null,
})

export function readEditorScroll(projectId: string): EditorScrollSnapshot | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(storageKey(projectId))
    if (!raw) return null
    const data = JSON.parse(raw) as Partial<EditorScrollSnapshot>
    return {
      pageY: typeof data.pageY === 'number' ? data.pageY : 0,
      previewY: typeof data.previewY === 'number' ? data.previewY : 0,
      previewSourceY: typeof data.previewSourceY === 'number' ? data.previewSourceY : 0,
      activeSegmentId: typeof data.activeSegmentId === 'string' ? data.activeSegmentId : null,
    }
  } catch {
    return null
  }
}

export function writeEditorScroll(
  projectId: string,
  patch: Partial<EditorScrollSnapshot>,
): void {
  if (typeof sessionStorage === 'undefined') return
  const prev = readEditorScroll(projectId) ?? emptySnapshot()
  sessionStorage.setItem(storageKey(projectId), JSON.stringify({ ...prev, ...patch }))
}

export function restoreWindowScroll(y: number): void {
  const apply = () => window.scrollTo({ top: y, left: 0, behavior: 'instant' })
  apply()
  requestAnimationFrame(() => {
    apply()
    requestAnimationFrame(apply)
  })
}
