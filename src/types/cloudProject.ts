export type CloudProjectRole = 'owner' | 'translator' | 'viewer'

export type CloudProject = {
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

export type CloudProjectMember = {
  userId: string
  displayName: string
  role: CloudProjectRole
  partDone: boolean
  progressDone: number
  progressTotal: number
  progressTm?: number
  lastActiveAt?: string | null
  localProjectId?: string | null
}

export type CloudProjectInvite = {
  id: string
  projectId: string
  role: CloudProjectRole
  createdBy: string
  expiresAt?: string | null
  maxUses?: number | null
  usesCount: number
  revokedAt?: string | null
  createdAt: string
}

export type CreateCloudProjectInput = {
  id: string
  title: string
  sourceLang?: string
  targetLang?: string
  sourceFilename?: string
  sourceHash?: string
  localProjectId?: string
}

export type PatchCloudProjectInput = {
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
  invite: CloudProjectInvite
}

export type AcceptInviteInput = {
  token: string
  localProjectId?: string
}

export type AcceptInviteResponse = {
  projectId: string
  role: CloudProjectRole
}

export type PatchCloudProjectMemberInput = {
  partDone?: boolean
  progressDone?: number
  progressTotal?: number
  progressTm?: number
  localProjectId?: string
}

export type CloudProjectResourceAcl = {
  canRead: boolean
  canWrite: boolean
  canExport: boolean
  canClone: boolean
}

export type CloudProjectResource = CloudProjectResourceAcl & {
  kind: 'job_tm'
  enabled: boolean
  preset: CloudProjectResourceAcl
}

export type PatchCloudProjectResourceInput = {
  kind?: 'job_tm'
  enabled?: boolean
  canRead?: boolean
  canWrite?: boolean
  canExport?: boolean
  canClone?: boolean
}

export type CloudProjectTmAttachment = {
  id: string
  projectId: string
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

export type CreateCloudProjectTmAttachmentInput = {
  tmBaseId: string
  canRead?: boolean
  canWrite?: boolean
  canExport?: boolean
  canClone?: boolean
}

export type PatchCloudProjectTmAttachmentInput = {
  canRead?: boolean
  canWrite?: boolean
  canExport?: boolean
  canClone?: boolean
}

export type CloudProjectGlossaryAttachment = {
  id: string
  projectId: string
  glossaryBaseId: string
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

export type CreateCloudProjectGlossaryAttachmentInput = {
  glossaryBaseId: string
  canRead?: boolean
  canWrite?: boolean
  canExport?: boolean
  canClone?: boolean
}

export type PatchCloudProjectGlossaryAttachmentInput = {
  canRead?: boolean
  canWrite?: boolean
  canExport?: boolean
  canClone?: boolean
}
