import { apiFetch } from '@/auth/api'
import type {
  AcceptInviteInput,
  AcceptInviteResponse,
  CloudProject,
  CloudProjectInvite,
  CloudProjectMember,
  CreateInviteInput,
  CreateInviteResponse,
  CreateCloudProjectInput,
  PatchCloudProjectInput,
  PatchCloudProjectMemberInput,
} from '@/types/cloudProject'

export async function createJob(input: CreateCloudProjectInput) {
  return apiFetch<CloudProject>('/api/projects', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function listJobs() {
  return apiFetch<CloudProject[]>('/api/projects')
}

export async function getJob(projectId: string) {
  return apiFetch<CloudProject>(`/api/projects/${projectId}`)
}

export async function patchJob(projectId: string, input: PatchCloudProjectInput) {
  return apiFetch<CloudProject>(`/api/projects/${projectId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export async function deleteJob(projectId: string) {
  return apiFetch<void>(`/api/projects/${projectId}`, {
    method: 'DELETE',
  })
}

export async function archiveJob(projectId: string) {
  return apiFetch<CloudProject>(`/api/projects/${projectId}/archive`, {
    method: 'POST',
  })
}

export async function leaveJob(projectId: string) {
  return apiFetch<void>(`/api/projects/${projectId}/leave`, {
    method: 'POST',
  })
}

export async function transferJob(projectId: string, userId: string) {
  return apiFetch<CloudProject>(`/api/projects/${projectId}/transfer`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  })
}

export async function listMembers(projectId: string) {
  return apiFetch<CloudProjectMember[]>(`/api/projects/${projectId}/members`)
}

export async function patchJobMemberMe(projectId: string, input: PatchCloudProjectMemberInput) {
  return apiFetch<CloudProjectMember>(`/api/projects/${projectId}/members/me`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export async function removeMember(projectId: string, userId: string) {
  return apiFetch<void>(`/api/projects/${projectId}/members/${userId}`, {
    method: 'DELETE',
  })
}

export async function createInvite(projectId: string, input: CreateInviteInput) {
  return apiFetch<CreateInviteResponse>(`/api/projects/${projectId}/invites`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function listInvites(projectId: string) {
  return apiFetch<CloudProjectInvite[]>(`/api/projects/${projectId}/invites`)
}

export async function revokeInvite(projectId: string, inviteId: string) {
  return apiFetch<void>(`/api/projects/${projectId}/invites/${inviteId}/revoke`, {
    method: 'POST',
  })
}

export async function acceptInvite(input: AcceptInviteInput) {
  return apiFetch<AcceptInviteResponse>('/api/job-invites/accept', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
