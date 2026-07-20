# TM Collection Part 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship global TM collection (browse/pick) plus project/job attach, detach (−), and delete-own-with-confirm for the default personal TM — per [`2026-07-20-tm-collection-part1-design.md`](../specs/2026-07-20-tm-collection-part1-design.md).

**Architecture:** Presence in `tmAttachments[]` means attached (drop `connected`). One `TmCollectionDialog` with modes `pick` | `browse` and optional `returnTo`. Project/job dialogs show only attached cards; **+** opens pick; full list from pick returns to the context dialog. Jobs use a localStorage stub until Part 2 API.

**Tech Stack:** Vue 3 + TypeScript, IndexedDB (`idb` / `tmIdb`), Vitest, vue-i18n, existing dialog SCSS patterns (`CreateSharedWorkDialog`).

## Global Constraints

- No auto-attach of default TM to new projects (empty `tmAttachments` on create).
- Delete own default personal TM = `clearTmUnits()` + detach everywhere locally; **keep** `personal-tm` in catalog.
- No Create/Import/Clone UI; no server `job_tm_attachments`; no Export/Clone ACL.
- Match existing dialog z-index (~86) and i18n key namespaces (`projects.*`, `jobs.*`, `tmCollection.*`).
- Prefer small pure helpers in `src/tm/` with unit tests before UI wiring.

## File map

| File | Responsibility |
|------|----------------|
| `src/types/project.ts` | `ProjectTmAttachment` without `connected` |
| `src/tm/projectAttachments.ts` | Normalize/migrate, attach, detach, patch R/W, detach-all, canRead/Write |
| `src/tm/tmCollection.ts` | Catalog + ensure default + deleteOwnPersonalTm (clear + detach projects/jobs) |
| `src/tm/jobAttachments.ts` | localStorage stub: get/set/attach/detach/patch for a jobId |
| `src/components/TmCollectionDialog.vue` | `pick` \| `browse`, returnTo, attach click, delete confirm |
| `src/components/ProjectTmBasesDialog.vue` | Attached-only; − / R/W / + → emit openPick |
| `src/components/ProjectListItem.vue` | Chips = attached; stack: bases ↔ pick ↔ browse |
| `src/pages/ProjectsPage.vue` | Button opens collection browse |
| `src/components/JobMemoriesPanel.vue` | Same attach UX via job stub |
| `src/i18n/locales/{ru,en}.ts` | New strings |
| `tests/tm/projectAttachments.test.ts` | Normalize/attach/detach |
| `tests/tm/tmCollection.test.ts` | deleteOwn (mocked idb) |
| `tests/tm/jobAttachments.test.ts` | Stub CRUD |
| `tests/components/JobMemoriesPanel.test.ts` | Update expectations |

---

### Task 1: Drop `connected` — types + normalize + attach/detach helpers

**Files:**
- Modify: `src/types/project.ts`
- Modify: `src/tm/projectAttachments.ts`
- Create: `tests/tm/projectAttachments.test.ts`
- Modify: `src/pages/EditorPage.vue` (only if helpers signatures change — keep `canReadPersonalTm` / `canWritePersonalTm` names)

**Interfaces:**
- Consumes: `ProjectMeta`, existing `listProjects`/`getProject`/`saveProject` later
- Produces:
  - `normalizeProjectTmAttachments(meta): ProjectTmAttachment[]` — only entries that are attached after migrate
  - `attachProjectTm(meta, id, perms?): ProjectTmAttachment[]`
  - `detachProjectTm(meta, id): ProjectTmAttachment[]`
  - `updateProjectTmAttachment(meta, id, patch): ProjectTmAttachment[]`
  - `canReadPersonalTm(meta): boolean` / `canWritePersonalTm(meta): boolean` — true iff personal-tm present and flag

- [ ] **Step 1: Write failing tests**

Create `tests/tm/projectAttachments.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  PERSONAL_TM_ATTACHMENT_ID,
  attachProjectTm,
  detachProjectTm,
  normalizeProjectTmAttachments,
  canReadPersonalTm,
  canWritePersonalTm,
} from '../../src/tm/projectAttachments'
import type { ProjectMeta } from '../../src/types/project'

function meta(partial: Partial<ProjectMeta> = {}): ProjectMeta {
  return {
    id: 'p1',
    name: 'P',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    segmentCount: 0,
    doneCount: 0,
    ...partial,
  }
}

describe('normalizeProjectTmAttachments', () => {
  it('returns empty when missing', () => {
    expect(normalizeProjectTmAttachments(meta())).toEqual([])
  })

  it('migrates connected:true to presence and drops connected:false', () => {
    const out = normalizeProjectTmAttachments(
      meta({
        tmAttachments: [
          { id: PERSONAL_TM_ATTACHMENT_ID, connected: true, canRead: true, canWrite: false } as never,
        ],
      }),
    )
    expect(out).toEqual([
      { id: PERSONAL_TM_ATTACHMENT_ID, canRead: true, canWrite: false },
    ])
  })

  it('drops connected:false entries', () => {
    const out = normalizeProjectTmAttachments(
      meta({
        tmAttachments: [
          { id: PERSONAL_TM_ATTACHMENT_ID, connected: false, canRead: true, canWrite: true } as never,
        ],
      }),
    )
    expect(out).toEqual([])
  })
})

describe('attach / detach', () => {
  it('attach is idempotent with default R+W', () => {
    const once = attachProjectTm(meta(), PERSONAL_TM_ATTACHMENT_ID)
    const twice = attachProjectTm({ ...meta(), tmAttachments: once }, PERSONAL_TM_ATTACHMENT_ID)
    expect(once).toEqual([{ id: PERSONAL_TM_ATTACHMENT_ID, canRead: true, canWrite: true }])
    expect(twice).toEqual(once)
  })

  it('detach removes entry', () => {
    const attached = attachProjectTm(meta(), PERSONAL_TM_ATTACHMENT_ID)
    expect(detachProjectTm({ ...meta(), tmAttachments: attached }, PERSONAL_TM_ATTACHMENT_ID)).toEqual([])
  })
})

describe('canRead / canWrite personal', () => {
  it('false when not attached', () => {
    expect(canReadPersonalTm(meta())).toBe(false)
    expect(canWritePersonalTm(meta())).toBe(false)
  })

  it('respects flags when attached', () => {
    const m = meta({
      tmAttachments: [{ id: PERSONAL_TM_ATTACHMENT_ID, canRead: true, canWrite: false }],
    })
    expect(canReadPersonalTm(m)).toBe(true)
    expect(canWritePersonalTm(m)).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx vitest run tests/tm/projectAttachments.test.ts`

Expected: FAIL (missing `attachProjectTm` / `detachProjectTm` or `connected` still required)

- [ ] **Step 3: Implement types + helpers**

In `src/types/project.ts` replace attachment type:

```ts
export type ProjectTmAttachmentId = 'personal-tm'

export interface ProjectTmAttachment {
  id: ProjectTmAttachmentId
  canRead: boolean
  canWrite: boolean
}
```

Replace `src/tm/projectAttachments.ts` with:

```ts
import type { ProjectMeta, ProjectTmAttachment, ProjectTmAttachmentId } from '@/types/project'

export const PERSONAL_TM_ATTACHMENT_ID: ProjectTmAttachmentId = 'personal-tm'

export type TmAttachmentCatalogItem = {
  id: ProjectTmAttachmentId
  label: string
  color: string
  glyph: 'tm'
}

export const TM_ATTACHMENT_CATALOG: TmAttachmentCatalogItem[] = [
  {
    id: PERSONAL_TM_ATTACHMENT_ID,
    label: 'Personal TM',
    color: '#5ea8ff',
    glyph: 'tm',
  },
]

type LegacyAttachment = ProjectTmAttachment & { connected?: boolean }

export function normalizeProjectTmAttachments(meta: ProjectMeta): ProjectTmAttachment[] {
  const raw = (meta.tmAttachments ?? []) as LegacyAttachment[]
  const out: ProjectTmAttachment[] = []
  for (const item of raw) {
    if (!TM_ATTACHMENT_CATALOG.some(c => c.id === item.id)) continue
    if (item.connected === false) continue
    // connected === true | undefined with presence → attached
    out.push({
      id: item.id,
      canRead: item.canRead ?? true,
      canWrite: item.canWrite ?? true,
    })
  }
  // de-dupe by id (last wins)
  const map = new Map(out.map(x => [x.id, x]))
  return [...map.values()]
}

export function attachProjectTm(
  meta: ProjectMeta,
  id: ProjectTmAttachmentId,
  perms: { canRead?: boolean; canWrite?: boolean } = {},
): ProjectTmAttachment[] {
  const current = normalizeProjectTmAttachments(meta)
  if (current.some(x => x.id === id)) return current
  return [
    ...current,
    {
      id,
      canRead: perms.canRead ?? true,
      canWrite: perms.canWrite ?? true,
    },
  ]
}

export function detachProjectTm(meta: ProjectMeta, id: ProjectTmAttachmentId): ProjectTmAttachment[] {
  return normalizeProjectTmAttachments(meta).filter(x => x.id !== id)
}

export function updateProjectTmAttachment(
  meta: ProjectMeta,
  id: ProjectTmAttachmentId,
  patch: Partial<Pick<ProjectTmAttachment, 'canRead' | 'canWrite'>>,
): ProjectTmAttachment[] {
  return normalizeProjectTmAttachments(meta).map(item =>
    item.id === id ? { ...item, ...patch } : item,
  )
}

export function canReadPersonalTm(meta: ProjectMeta): boolean {
  const item = normalizeProjectTmAttachments(meta).find(x => x.id === PERSONAL_TM_ATTACHMENT_ID)
  return Boolean(item?.canRead)
}

export function canWritePersonalTm(meta: ProjectMeta): boolean {
  const item = normalizeProjectTmAttachments(meta).find(x => x.id === PERSONAL_TM_ATTACHMENT_ID)
  return Boolean(item?.canWrite)
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run tests/tm/projectAttachments.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/types/project.ts src/tm/projectAttachments.ts tests/tm/projectAttachments.test.ts
git commit -m "refactor: TM attach presence replaces connected flag"
```

---

### Task 2: Job attachments stub (localStorage)

**Files:**
- Create: `src/tm/jobAttachments.ts`
- Create: `tests/tm/jobAttachments.test.ts`

**Interfaces:**
- Consumes: `ProjectTmAttachment`, `ProjectTmAttachmentId`, normalize helpers from Task 1
- Produces:
  - `listJobTmAttachments(jobId: string): ProjectTmAttachment[]`
  - `setJobTmAttachments(jobId: string, items: ProjectTmAttachment[]): void`
  - `attachJobTm(jobId, id, perms?): ProjectTmAttachment[]`
  - `detachJobTm(jobId, id): ProjectTmAttachment[]`
  - `updateJobTmAttachment(jobId, id, patch): ProjectTmAttachment[]`
  - `detachJobTmEverywhere(id): number` — count of jobs touched
  - storage key: `tr_principle.job_tm_attachments.v1`

- [ ] **Step 1: Write failing tests**

```ts
import { afterEach, describe, expect, it } from 'vitest'
import {
  PERSONAL_TM_ATTACHMENT_ID,
  attachJobTm,
  detachJobTm,
  listJobTmAttachments,
  detachJobTmEverywhere,
} from '../../src/tm/jobAttachments'

const KEY = 'tr_principle.job_tm_attachments.v1'

afterEach(() => {
  localStorage.removeItem(KEY)
})

describe('jobAttachments stub', () => {
  it('starts empty', () => {
    expect(listJobTmAttachments('job-1')).toEqual([])
  })

  it('attach and detach', () => {
    expect(attachJobTm('job-1', PERSONAL_TM_ATTACHMENT_ID)).toEqual([
      { id: PERSONAL_TM_ATTACHMENT_ID, canRead: true, canWrite: true },
    ])
    expect(listJobTmAttachments('job-1')).toHaveLength(1)
    expect(detachJobTm('job-1', PERSONAL_TM_ATTACHMENT_ID)).toEqual([])
  })

  it('detachJobTmEverywhere removes from all jobs', () => {
    attachJobTm('a', PERSONAL_TM_ATTACHMENT_ID)
    attachJobTm('b', PERSONAL_TM_ATTACHMENT_ID)
    expect(detachJobTmEverywhere(PERSONAL_TM_ATTACHMENT_ID)).toBe(2)
    expect(listJobTmAttachments('a')).toEqual([])
    expect(listJobTmAttachments('b')).toEqual([])
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run tests/tm/jobAttachments.test.ts`

- [ ] **Step 3: Implement `src/tm/jobAttachments.ts`**

```ts
import type { ProjectTmAttachment, ProjectTmAttachmentId } from '@/types/project'
import {
  attachProjectTm,
  detachProjectTm,
  normalizeProjectTmAttachments,
  updateProjectTmAttachment,
} from '@/tm/projectAttachments'

const KEY = 'tr_principle.job_tm_attachments.v1'

type Store = Record<string, ProjectTmAttachment[]>

function readStore(): Store {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Store
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeStore(store: Store) {
  localStorage.setItem(KEY, JSON.stringify(store))
}

export function listJobTmAttachments(jobId: string): ProjectTmAttachment[] {
  return normalizeProjectTmAttachments({
    id: jobId,
    name: '',
    createdAt: '',
    updatedAt: '',
    segmentCount: 0,
    doneCount: 0,
    tmAttachments: readStore()[jobId],
  })
}

export function setJobTmAttachments(jobId: string, items: ProjectTmAttachment[]) {
  const store = readStore()
  store[jobId] = normalizeProjectTmAttachments({
    id: jobId,
    name: '',
    createdAt: '',
    updatedAt: '',
    segmentCount: 0,
    doneCount: 0,
    tmAttachments: items,
  })
  writeStore(store)
}

export function attachJobTm(
  jobId: string,
  id: ProjectTmAttachmentId,
  perms?: { canRead?: boolean; canWrite?: boolean },
) {
  const next = attachProjectTm(
    {
      id: jobId,
      name: '',
      createdAt: '',
      updatedAt: '',
      segmentCount: 0,
      doneCount: 0,
      tmAttachments: listJobTmAttachments(jobId),
    },
    id,
    perms,
  )
  setJobTmAttachments(jobId, next)
  return next
}

export function detachJobTm(jobId: string, id: ProjectTmAttachmentId) {
  const next = detachProjectTm(
    {
      id: jobId,
      name: '',
      createdAt: '',
      updatedAt: '',
      segmentCount: 0,
      doneCount: 0,
      tmAttachments: listJobTmAttachments(jobId),
    },
    id,
  )
  setJobTmAttachments(jobId, next)
  return next
}

export function updateJobTmAttachment(
  jobId: string,
  id: ProjectTmAttachmentId,
  patch: Partial<Pick<ProjectTmAttachment, 'canRead' | 'canWrite'>>,
) {
  const next = updateProjectTmAttachment(
    {
      id: jobId,
      name: '',
      createdAt: '',
      updatedAt: '',
      segmentCount: 0,
      doneCount: 0,
      tmAttachments: listJobTmAttachments(jobId),
    },
    id,
    patch,
  )
  setJobTmAttachments(jobId, next)
  return next
}

export function detachJobTmEverywhere(id: ProjectTmAttachmentId): number {
  const store = readStore()
  let touched = 0
  for (const jobId of Object.keys(store)) {
    const before = listJobTmAttachments(jobId)
    if (!before.some(x => x.id === id)) continue
    detachJobTm(jobId, id)
    touched += 1
  }
  return touched
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run tests/tm/jobAttachments.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/tm/jobAttachments.ts tests/tm/jobAttachments.test.ts
git commit -m "feat: add localStorage stub for job TM attachments"
```

---

### Task 3: Delete own personal TM (clear + detach everywhere)

**Files:**
- Create: `src/tm/tmCollection.ts`
- Create: `tests/tm/tmCollection.test.ts`

**Interfaces:**
- Consumes: `clearTmUnits`, `listProjects`, `getProject`, `saveProject`, `detachProjectTm`, `detachJobTmEverywhere`, `TM_ATTACHMENT_CATALOG`
- Produces:
  - `ensureDefaultTmInCatalog(): TmAttachmentCatalogItem[]` — returns catalog (always includes personal-tm)
  - `deleteOwnPersonalTm(): Promise<{ unitCountCleared: number; projectsDetached: number; jobsDetached: number }>`

- [ ] **Step 1: Write failing test** (mock modules)

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/storage/tmIdb', () => ({
  listTmUnits: vi.fn(),
  clearTmUnits: vi.fn(),
}))
vi.mock('../../src/storage/idb', () => ({
  listProjects: vi.fn(),
  getProject: vi.fn(),
  saveProject: vi.fn(),
}))
vi.mock('../../src/tm/jobAttachments', () => ({
  detachJobTmEverywhere: vi.fn(() => 1),
}))

import { listTmUnits, clearTmUnits } from '../../src/storage/tmIdb'
import { listProjects, getProject, saveProject } from '../../src/storage/idb'
import { detachJobTmEverywhere } from '../../src/tm/jobAttachments'
import { PERSONAL_TM_ATTACHMENT_ID } from '../../src/tm/projectAttachments'
import { deleteOwnPersonalTm, ensureDefaultTmInCatalog } from '../../src/tm/tmCollection'

describe('tmCollection', () => {
  beforeEach(() => {
    vi.mocked(listTmUnits).mockResolvedValue([{ id: 'u1' } as never, { id: 'u2' } as never])
    vi.mocked(clearTmUnits).mockResolvedValue(undefined)
    vi.mocked(listProjects).mockResolvedValue([
      { id: 'p1', tmAttachments: [{ id: PERSONAL_TM_ATTACHMENT_ID, canRead: true, canWrite: true }] } as never,
      { id: 'p2', tmAttachments: [] } as never,
    ])
    vi.mocked(getProject).mockImplementation(async id => {
      if (id === 'p1') {
        return {
          meta: {
            id: 'p1',
            name: 'A',
            createdAt: '',
            updatedAt: '',
            segmentCount: 0,
            doneCount: 0,
            tmAttachments: [{ id: PERSONAL_TM_ATTACHMENT_ID, canRead: true, canWrite: true }],
          },
          segments: [],
          docx: new ArrayBuffer(0),
        }
      }
      return undefined
    })
    vi.mocked(saveProject).mockResolvedValue(undefined)
    vi.mocked(detachJobTmEverywhere).mockReturnValue(1)
  })

  it('ensureDefault includes personal-tm', () => {
    expect(ensureDefaultTmInCatalog().some(x => x.id === PERSONAL_TM_ATTACHMENT_ID)).toBe(true)
  })

  it('deleteOwnPersonalTm clears units and detaches projects/jobs', async () => {
    const result = await deleteOwnPersonalTm()
    expect(clearTmUnits).toHaveBeenCalled()
    expect(saveProject).toHaveBeenCalled()
    expect(detachJobTmEverywhere).toHaveBeenCalledWith(PERSONAL_TM_ATTACHMENT_ID)
    expect(result).toEqual({ unitCountCleared: 2, projectsDetached: 1, jobsDetached: 1 })
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run tests/tm/tmCollection.test.ts`

- [ ] **Step 3: Implement `src/tm/tmCollection.ts`**

```ts
import { getProject, listProjects, saveProject } from '@/storage/idb'
import { clearTmUnits, listTmUnits } from '@/storage/tmIdb'
import { detachJobTmEverywhere } from '@/tm/jobAttachments'
import {
  PERSONAL_TM_ATTACHMENT_ID,
  TM_ATTACHMENT_CATALOG,
  detachProjectTm,
  type TmAttachmentCatalogItem,
} from '@/tm/projectAttachments'

export function ensureDefaultTmInCatalog(): TmAttachmentCatalogItem[] {
  return [...TM_ATTACHMENT_CATALOG]
}

export async function deleteOwnPersonalTm(): Promise<{
  unitCountCleared: number
  projectsDetached: number
  jobsDetached: number
}> {
  const units = await listTmUnits()
  await clearTmUnits()

  let projectsDetached = 0
  const metas = await listProjects()
  for (const m of metas) {
    const attached = (m.tmAttachments ?? []).some(x => x.id === PERSONAL_TM_ATTACHMENT_ID)
    if (!attached) continue
    const record = await getProject(m.id)
    if (!record) continue
    record.meta.tmAttachments = detachProjectTm(record.meta, PERSONAL_TM_ATTACHMENT_ID)
    record.meta.updatedAt = new Date().toISOString()
    await saveProject(record)
    projectsDetached += 1
  }

  const jobsDetached = detachJobTmEverywhere(PERSONAL_TM_ATTACHMENT_ID)
  return { unitCountCleared: units.length, projectsDetached, jobsDetached }
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run tests/tm/tmCollection.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/tm/tmCollection.ts tests/tm/tmCollection.test.ts
git commit -m "feat: clear personal TM and detach it from local projects/jobs"
```

---

### Task 4: i18n strings

**Files:**
- Modify: `src/i18n/locales/ru.ts`
- Modify: `src/i18n/locales/en.ts`

- [ ] **Step 1: Add keys** under `projects` / new `tmCollection` / `jobs` as needed:

**en**

```ts
// projects
tmBasesTitle: 'Project memories',
tmBasesHint: 'Bases attached to this project. Minus removes without deleting the base.',
tmBasesClose: 'Close',
tmBasesEmpty: 'No bases attached. Use + to attach from your collection.',
tmDetach: 'Remove from project',
tmOpenPicker: 'Attach base',
tmUnitsStat: '{n} units',
tmPersonalBase: 'Personal TM',
tmConnected: 'Attached', // keep if referenced; prefer not using "Connected" switch

// tmCollection (top-level namespace)
tmCollection: {
  title: 'Translation memories',
  hint: 'Your bases. Attach them to projects and shared works from those screens.',
  pickTitle: 'Attach a base',
  pickHint: 'Click a square to attach. Already attached bases are marked.',
  openFull: 'Open full list',
  close: 'Close',
  attached: 'Attached',
  delete: 'Delete for me',
  deleteConfirmTitle: 'Delete this base for you?',
  deleteConfirmBody:
    '“{name}” — {units} units. It will be detached from {projects} local projects and {jobs} works. The default Personal TM stays in the list empty.',
  deleteConfirmOk: 'Delete for me',
  deleteConfirmCancel: 'Cancel',
  openFromProjects: 'TM bases',
},

// jobs
memoriesAttach: 'Attach base',
memoriesDetach: 'Remove from work',
memoriesEmptyAttached: 'No bases attached. Use + to attach from your collection.',
```

**ru** — matching translations (natural Russian, same keys).

- [ ] **Step 2: Commit**

```bash
git add src/i18n/locales/ru.ts src/i18n/locales/en.ts
git commit -m "i18n: TM collection and project/job attach copy"
```

---

### Task 5: `TmCollectionDialog` (pick + browse + returnTo)

**Files:**
- Create: `src/components/TmCollectionDialog.vue`

**Interfaces:**
- Props:
  - `open: boolean`
  - `mode: 'pick' | 'browse'`
  - `returnTo?: 'project' | 'job' | null`
  - `attachedIds: ProjectTmAttachmentId[]` — for pick marking
  - `contextLabel?: string` — optional subtitle
- Emits:
  - `close` — user dismissed; parent decides return stack
  - `attach: [id: ProjectTmAttachmentId]`
  - `deleted` — after successful deleteOwn
  - `open-full` — pick → parent should switch mode to browse with returnTo

- [ ] **Step 1: Implement dialog** following `CreateSharedWorkDialog` backdrop pattern.

Structure:

```vue
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import EditorGlyph from '@/components/EditorGlyph.vue'
import { listTmUnits } from '@/storage/tmIdb'
import {
  PERSONAL_TM_ATTACHMENT_ID,
  TM_ATTACHMENT_CATALOG,
  type TmAttachmentCatalogItem,
} from '@/tm/projectAttachments'
import { deleteOwnPersonalTm, ensureDefaultTmInCatalog } from '@/tm/tmCollection'
import type { ProjectTmAttachmentId } from '@/types/project'

const props = defineProps<{
  open: boolean
  mode: 'pick' | 'browse'
  returnTo?: 'project' | 'job' | null
  attachedIds: ProjectTmAttachmentId[]
}>()

const emit = defineEmits<{
  close: []
  attach: [id: ProjectTmAttachmentId]
  deleted: []
  'open-full': []
  error: [message: string]
}>()

const { t } = useI18n()
const busy = ref(false)
const unitCount = ref(0)
const confirmDelete = ref(false)
const catalog = computed(() => ensureDefaultTmInCatalog())

watch(
  () => props.open,
  async open => {
    if (!open) {
      confirmDelete.value = false
      return
    }
    try {
      unitCount.value = (await listTmUnits()).length
    } catch {
      unitCount.value = 0
    }
  },
  { immediate: true },
)

function isAttached(id: ProjectTmAttachmentId) {
  return props.attachedIds.includes(id)
}

function onCardClick(item: TmAttachmentCatalogItem) {
  if (props.mode !== 'pick') return
  if (isAttached(item.id)) return
  emit('attach', item.id)
}

async function onConfirmDelete() {
  if (busy.value) return
  busy.value = true
  emit('error', '')
  try {
    await deleteOwnPersonalTm()
    unitCount.value = 0
    confirmDelete.value = false
    emit('deleted')
  } catch (err) {
    emit('error', err instanceof Error ? err.message : String(err))
  } finally {
    busy.value = false
  }
}
</script>
```

Template rules:

- `mode === 'pick'`: compact grid; click → `attach`; footer button `t('tmCollection.openFull')` → `emit('open-full')`; close → `emit('close')`.
- `mode === 'browse'`: larger cards; show unit stat; Delete button → `confirmDelete` panel with `deleteConfirmBody` interpolating name/units/projects/jobs — for Part 1 projects/jobs counts can be loaded via `listProjects` + job store scan inside confirm open, or show units only and generic wording from i18n if counts expensive; prefer loading counts when opening confirm.
- Backdrop `@click.self` → `emit('close')` (parent handles returnTo).

- [ ] **Step 2: Manual smoke after Task 6** (wired). For now commit shell + styles.

- [ ] **Step 3: Commit**

```bash
git add src/components/TmCollectionDialog.vue
git commit -m "feat: add TmCollectionDialog pick/browse modes"
```

---

### Task 6: Refactor `ProjectTmBasesDialog` + stack in `ProjectListItem`

**Files:**
- Modify: `src/components/ProjectTmBasesDialog.vue`
- Modify: `src/components/ProjectListItem.vue`

**Behavior:**

`ProjectTmBasesDialog`:

- List only `normalizeProjectTmAttachments(project)` (attached).
- Each card: icon, name, units stat (personal), R/W toggles, **−** button → `detachProjectTm` via get/save.
- Empty state: `tmBasesEmpty`.
- Header **+** → `emit('open-pick')` (not inline collection).
- Remove Connected switch.

`ProjectListItem` stack state:

```ts
const basesOpen = ref(false)
const collectionOpen = ref(false)
const collectionMode = ref<'pick' | 'browse'>('pick')
const collectionReturnTo = ref<'project' | null>(null)

function openBases() { basesOpen.value = true }
function openPick() {
  collectionMode.value = 'pick'
  collectionReturnTo.value = 'project'
  collectionOpen.value = true
}
function openFullFromPick() {
  collectionMode.value = 'browse'
  collectionReturnTo.value = 'project'
}
function onCollectionClose() {
  collectionOpen.value = false
  if (collectionReturnTo.value === 'project') {
    basesOpen.value = true
  }
  collectionReturnTo.value = null
}
function onAttach(id: ProjectTmAttachmentId) {
  // attachProjectTm + save; keep pick open or close pick — prefer close pick, keep bases open
}
```

Chip strip: `normalizeProjectTmAttachments` (all are attached); click chip → detach; **+** → `openBases()` (opens bases dialog first; user hits + inside for pick) **OR** **+** on strip opens bases dialog. Spec: strip **+** opens project bases dialog.

When opening browse from Projects page later, `returnTo` is null so close does not reopen bases.

- [ ] **Step 1: Implement dialog + list item wiring**

- [ ] **Step 2: Run `npx vue-tsc --noEmit`** — expect clean

- [ ] **Step 3: Commit**

```bash
git add src/components/ProjectTmBasesDialog.vue src/components/ProjectListItem.vue
git commit -m "feat: project TM dialog attach-only with collection pick stack"
```

---

### Task 7: Projects page — open full collection

**Files:**
- Modify: `src/pages/ProjectsPage.vue`

- [ ] **Step 1: Add state + button near `<h1>{{ t('projects.title') }}</h1>`**

```vue
<IconButton :title="t('tmCollection.openFromProjects')" @click="collectionOpen = true">
  <EditorGlyph name="tm" />
</IconButton>
<TmCollectionDialog
  :open="collectionOpen"
  mode="browse"
  :attached-ids="[]"
  @close="collectionOpen = false"
  @deleted="refresh"
  @error="error = $event"
/>
```

`refresh` = existing projects reload function. No `returnTo`. Attach emit unused in browse-from-page (ignore or no-op).

- [ ] **Step 2: Commit**

```bash
git add src/pages/ProjectsPage.vue
git commit -m "feat: open TM collection from projects page"
```

---

### Task 8: Job memories panel — same attach UX (stub)

**Files:**
- Modify: `src/components/JobMemoriesPanel.vue`
- Modify: `tests/components/JobMemoriesPanel.test.ts`
- Optionally reuse `ProjectTmBasesDialog` pattern inline or small `JobTmBasesDialog` — prefer extending panel with squares + wiring `TmCollectionDialog` to avoid third dialog file unless copy gets large. If >150 lines of template duplication, extract `TmAttachedBasesGrid.vue` shared child. YAGNI: duplicate lightly first in `JobMemoriesPanel`, extract only if painful.

- [ ] **Step 1: Update test** — empty attached + button to attach; no job-tm pool toggles; after attach personal shows R/W.

```ts
it('can attach personal TM via pick flow', async () => {
  // mount, click [data-testid="job-tm-add"], click personal card in pick
  // expect personal label + R/W controls
})
```

- [ ] **Step 2: Implement panel using `jobAttachments` stub + stack like Task 6**

- [ ] **Step 3: Run**

Run: `npx vitest run tests/components/JobMemoriesPanel.test.ts tests/tm/`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/JobMemoriesPanel.vue tests/components/JobMemoriesPanel.test.ts
git commit -m "feat: job memories attach/detach via local stub and collection pick"
```

---

### Task 9: Fix call sites still using `connected` + verification

**Files:**
- Grep: `connected` in `src/` related to tmAttachments
- Modify: `ProjectListItem.vue`, `ProjectTmBasesDialog.vue`, any leftovers
- Run full tests + `vue-tsc`

- [ ] **Step 1: Grep and fix**

```bash
rg "connected" src/tm src/components/Project src/components/Tm src/types/project.ts
```

- [ ] **Step 2: Verify**

```bash
npx vitest run tests/tm tests/components/JobMemoriesPanel.test.ts
npx vue-tsc --noEmit
```

Expected: all PASS / exit 0

- [ ] **Step 3: Manual checklist (dev server)**

1. Projects → TM bases button → browse shows Personal TM + delete confirm clears units.
2. Project card **+** → bases dialog empty → **+** → pick → click Personal → appears with R/W; **−** removes; units remain in collection.
3. From pick → Full list → close → back to project bases dialog.
4. Job hub Memories → same attach/detach.
5. New project has no chips until attach.

- [ ] **Step 4: Commit** (if any fixups)

```bash
git commit -m "fix: finish TM collection Part 1 call-site cleanup"
```

- [ ] **Step 5: Mark spec status Approved** in design doc header if still Draft.

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Default personal TM in catalog | 3 (`ensureDefaultTmInCatalog`) |
| Browse from Projects page | 7 |
| Project/job attached-only + R/W + − | 6, 8 |
| + → pick → click attach | 5, 6, 8 |
| Full list from pick + returnTo | 5, 6 |
| Delete own + confirm; keep empty personal | 3, 5 |
| Drop `connected`; migrate | 1 |
| No auto-attach new projects | 1 (empty default) + 9 manual |
| Job stub not API | 2, 8 |

## Self-review notes

- No TBD placeholders in tasks.
- `canReadPersonalTm` semantics changed from `connected && canRead` to presence && canRead — EditorPage keeps working without dual-write changes.
- Job stub key versioned `v1` for Part 2 migration later.
