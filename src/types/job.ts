export type JobRole = 'owner' | 'translator' | 'viewer'

export type Job = {
  id: string
  ownerUserId: string
  title: string
  sourceLang: string
  targetLang: string
  sourceFilename: string
  sourceHash: string
  hasOriginal?: boolean
  originalFilename?: string
  createdAt: string
  updatedAt: string
  archivedAt?: string | null
}

export type JobMember = {
  userId: string
  displayName: string
  role: JobRole
  partDone: boolean
  progressDone: number
  progressTotal: number
  progressTm?: number
  lastActiveAt?: string | null
  localProjectId?: string | null
}

export type JobInvite = {
  id: string
  jobId: string
  role: JobRole
  createdBy: string
  expiresAt?: string | null
  maxUses?: number | null
  usesCount: number
  revokedAt?: string | null
  createdAt: string
}

export type CreateJobInput = {
  id: string
  title: string
  sourceLang?: string
  targetLang?: string
  sourceFilename?: string
  sourceHash?: string
  localProjectId?: string
}

export type PatchJobInput = {
  title?: string
  sourceLang?: string
  targetLang?: string
  sourceFilename?: string
  sourceHash?: string
}

export type CreateInviteInput = {
  role: 'translator' | 'viewer'
  expiresAt?: string
  maxUses?: number
}

export type CreateInviteResponse = {
  token: string
  invite: JobInvite
}

export type AcceptInviteInput = {
  token: string
  localProjectId?: string
}

export type AcceptInviteResponse = {
  jobId: string
  role: JobRole
}

export type PatchJobMemberInput = {
  partDone?: boolean
  progressDone?: number
  progressTotal?: number
  progressTm?: number
  localProjectId?: string
}

export type JobResourceAcl = {
  canRead: boolean
  canWrite: boolean
  canExport: boolean
  canClone: boolean
}

export type JobResource = JobResourceAcl & {
  kind: 'job_tm'
  enabled: boolean
  preset: JobResourceAcl
}

export type PatchJobResourceInput = {
  kind?: 'job_tm'
  enabled?: boolean
  canRead?: boolean
  canWrite?: boolean
  canExport?: boolean
  canClone?: boolean
}

export type JobTmAttachment = {
  id: string
  jobId: string
  tmBaseId: string
  label?: string
  color?: string
  ownerId?: string
  canRead: boolean
  canWrite: boolean
  canExport: boolean
  canClone: boolean
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type CreateJobTmAttachmentInput = {
  tmBaseId: string
  canRead?: boolean
  canWrite?: boolean
  canExport?: boolean
  canClone?: boolean
}

export type PatchJobTmAttachmentInput = {
  canRead?: boolean
  canWrite?: boolean
  canExport?: boolean
  canClone?: boolean
}
