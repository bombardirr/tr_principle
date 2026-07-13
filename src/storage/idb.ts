import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { ProjectMeta, ProjectRecord } from '@/types/project'
import { countDoneSegments } from '@/utils/segmentStatus'
import { copyArrayBuffer } from '@/utils/buffer'

interface CatDb extends DBSchema {
  projects: {
    key: string
    value: ProjectRecord
    indexes: { 'by-updated': string }
  }
}

const DB_NAME = 'translation-tool'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<CatDb>> | null = null

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<CatDb>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore('projects', { keyPath: 'meta.id' })
        store.createIndex('by-updated', 'meta.updatedAt')
      },
    })
  }
  return dbPromise
}

/** Plain clone safe for IndexedDB (strips Vue proxies). */
export function cloneProjectRecord(record: ProjectRecord): ProjectRecord {
  const docx = copyArrayBuffer(record.docx)

  return {
    meta: {
      id: record.meta.id,
      name: record.meta.name,
      createdAt: record.meta.createdAt,
      updatedAt: record.meta.updatedAt,
      sourceLang: record.meta.sourceLang,
      targetLang: record.meta.targetLang,
      segmentCount: record.meta.segmentCount,
      doneCount: record.meta.doneCount,
    },
    segments: record.segments.map((s) => ({
      id: s.id,
      storyKey: s.storyKey,
      storyFile: s.storyFile,
      paraIndex: s.paraIndex,
      source: s.source,
      target: s.target,
      status: s.status,
      inTable: s.inTable,
      inTextbox: s.inTextbox ?? false,
      inCaption: s.inCaption ?? false,
      spans: s.spans.map((sp) => ({
        runIndices: [...sp.runIndices],
        fingerprint: sp.fingerprint,
        text: sp.text,
      })),
    })),
    docx,
  }
}

export async function listProjects(): Promise<ProjectMeta[]> {
  const db = await getDb()
  const all = await db.getAllFromIndex('projects', 'by-updated')
  return all.map((p) => ({ ...p.meta })).reverse()
}

export async function getProject(id: string): Promise<ProjectRecord | undefined> {
  const db = await getDb()
  const row = await db.get('projects', id)
  return row ? cloneProjectRecord(row) : undefined
}

export async function saveProject(record: ProjectRecord): Promise<void> {
  const db = await getDb()
  const clone = cloneProjectRecord(record)
  clone.meta.updatedAt = new Date().toISOString()
  clone.meta.segmentCount = clone.segments.length
  clone.meta.doneCount = countDoneSegments(clone.segments)

  // keep caller in sync with recount
  record.meta.updatedAt = clone.meta.updatedAt
  record.meta.segmentCount = clone.meta.segmentCount
  record.meta.doneCount = clone.meta.doneCount

  try {
    await db.put('projects', clone)
  } catch (e) {
    const name = e instanceof DOMException ? e.name : ''
    if (name === 'QuotaExceededError') {
      throw new Error('QUOTA')
    }
    throw e
  }
}

export async function deleteProject(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('projects', id)
}

export function createProjectId(): string {
  return crypto.randomUUID()
}
