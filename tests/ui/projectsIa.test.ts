import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseJobInviteToken } from '@/jobs/inviteToken'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('unified projects IA', () => {
  it('shows only cloud project hubs on the projects page', () => {
    const page = source('src/pages/ProjectsPage.vue')

    expect(page).not.toContain('ProjectListItem')
    expect(page).not.toContain('personalProjectsTitle')
    expect(page).not.toContain('onDocxSelected')
    expect(page).not.toContain('onProjectFileSelected')
    expect(page).toContain('<JobHubInline')
    expect(page).toContain('<CreateSharedWorkDialog')
  })

  it('does not offer project promotion from the editor', () => {
    const page = source('src/pages/EditorPage.vue')

    expect(page).not.toContain('CreateSharedWorkDialog')
    expect(page).not.toContain('sharedCreateOpen')
    expect(page).not.toContain('createFromEditorHint')
    expect(page).toContain('v-if="record.meta.projectId"')
  })

  it('uses project invite links and still accepts legacy links', () => {
    expect(parseJobInviteToken('/project-invite/new-token')).toBe('new-token')
    expect(parseJobInviteToken('/job-invite/legacy-token')).toBe('legacy-token')

    const router = source('src/router/index.ts')
    expect(router).toContain("path: '/project-invite/:token'")
    expect(router).toContain("path: '/job-invite/:token'")
    expect(router).toContain("redirect: to => ({ name: 'project-invite'")
  })

  it('uses project-first copy in both locales', () => {
    for (const locale of ['ru', 'en']) {
      const messages = source(`src/i18n/locales/${locale}.ts`)

      expect(messages).not.toContain('sharedWorksTitle:')
      expect(messages).not.toContain('createFromEditorHint:')
      expect(messages).toMatch(/createEmptyTitle: '(Новый проект|New project)'/)
      expect(messages).toMatch(/panelTitle: '(Проект|Project)'/)
    }
  })
})
