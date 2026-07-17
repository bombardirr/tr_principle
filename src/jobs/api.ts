import { apiFetch } from '@/auth/api'
import type {
  AcceptInviteInput,
  AcceptInviteResponse,
  CreateInviteInput,
  CreateInviteResponse,
  CreateJobInput,
  Job,
  JobInvite,
  JobMember,
  PatchJobInput,
  PatchJobMemberInput,
} from '@/types/job'

export async function createJob(input: CreateJobInput) {
  return apiFetch<Job>('/api/jobs', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function listJobs() {
  return apiFetch<Job[]>('/api/jobs')
}

export async function getJob(jobId: string) {
  return apiFetch<Job>(`/api/jobs/${jobId}`)
}

export async function patchJob(jobId: string, input: PatchJobInput) {
  return apiFetch<Job>(`/api/jobs/${jobId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export async function transferJob(jobId: string, userId: string) {
  return apiFetch<Job>(`/api/jobs/${jobId}/transfer`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  })
}

export async function listMembers(jobId: string) {
  return apiFetch<JobMember[]>(`/api/jobs/${jobId}/members`)
}

export async function patchJobMemberMe(jobId: string, input: PatchJobMemberInput) {
  return apiFetch<JobMember>(`/api/jobs/${jobId}/members/me`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export async function removeMember(jobId: string, userId: string) {
  return apiFetch<void>(`/api/jobs/${jobId}/members/${userId}`, {
    method: 'DELETE',
  })
}

export async function createInvite(jobId: string, input: CreateInviteInput) {
  return apiFetch<CreateInviteResponse>(`/api/jobs/${jobId}/invites`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function listInvites(jobId: string) {
  return apiFetch<JobInvite[]>(`/api/jobs/${jobId}/invites`)
}

export async function revokeInvite(jobId: string, inviteId: string) {
  return apiFetch<void>(`/api/jobs/${jobId}/invites/${inviteId}/revoke`, {
    method: 'POST',
  })
}

export async function acceptInvite(input: AcceptInviteInput) {
  return apiFetch<AcceptInviteResponse>('/api/job-invites/accept', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
