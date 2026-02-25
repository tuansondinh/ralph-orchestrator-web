import { expect, test } from '@playwright/test'

const projectPath = process.env.RALPH_UI_E2E_PROJECT_PATH
const mockBinaryPath = process.env.RALPH_UI_E2E_MOCK_RALPH

if (!projectPath) {
  throw new Error('RALPH_UI_E2E_PROJECT_PATH is required for E2E tests')
}

if (!mockBinaryPath) {
  throw new Error('RALPH_UI_E2E_MOCK_RALPH is required for E2E tests')
}

const projectName = projectPath
  .split(/[\\/]/)
  .filter((segment) => segment.length > 0)
  .at(-1) ?? 'project'

function extractProjectId(url: string) {
  const match = /\/project\/([^/]+)\/(?:chat|loops)$/.exec(url)
  if (!match?.[1]) {
    throw new Error(`Unable to parse project id from url: ${url}`)
  }

  return match[1]
}

test.describe.serial('Core user workflows', () => {
  let projectId = ''

  test('project creation', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'No projects yet' })).toBeVisible()

    await page.getByRole('button', { name: 'Create Project' }).click()
    await page.getByRole('button', { name: 'Open Existing' }).click()
    await page.getByRole('textbox', { name: 'Project path' }).fill(projectPath)
    await page.getByRole('button', { name: 'Open', exact: true }).click()

    await page.waitForURL(/\/project\/[^/]+\/loops$/)
    projectId = extractProjectId(page.url())

    await expect(page.getByRole('heading', { name: 'Loops' })).toBeVisible()
    await expect(page.getByRole('button', { name: projectName, exact: true })).toBeVisible()
  })

  test('chat session', async ({ page }) => {
    await page.goto(`/project/${projectId}/chat`)
    await page.waitForURL(`/project/${projectId}/loops`)
    await page.getByRole('link', { name: 'Terminal' }).click()
    await page.waitForURL(`/project/${projectId}/terminal`)

    await expect(page.getByRole('heading', { name: 'Terminal' })).toBeVisible()
    await expect(page.locator('span', { hasText: /Running|Stopped/ }).first()).toBeVisible()
    await expect(page.locator('span', { hasText: /^PID:/ }).first()).toBeVisible()
  })

  test('loop lifecycle start and stop', async ({ page }) => {
    await page.goto(`/project/${projectId}/loops`)
    await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeEnabled()
    await page.getByRole('button', { name: 'Start', exact: true }).click()

    await expect(page.getByText('No loops yet. Start a loop to see live output here.')).toBeHidden()
    await expect(page.locator('span', { hasText: /Running|Queued|Merging/ }).first()).toBeVisible()
    await page.getByRole('button', { name: 'Stop' }).first().click()
    await expect(page.locator('span', { hasText: 'Stopped' }).first()).toBeVisible()
  })

  test('notifications for completed loop', async ({ page }) => {
    await page.goto(`/project/${projectId}/loops`)
    const promptInput = page.getByRole('textbox', { name: 'PROMPT.md' })
    await promptInput.fill('complete-e2e')
    await promptInput.blur()
    await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeEnabled()
    await page.getByRole('button', { name: 'Start', exact: true }).click()

    await expect(page.getByRole('status').filter({ hasText: 'Loop completed' })).toBeVisible()
    await expect(
      page.getByRole('button', { name: /Notifications \([1-9]\d* unread\)/ })
    ).toBeVisible()
  })

  test('monitor tab shows loop stats', async ({ page }) => {
    await page.goto(`/project/${projectId}/monitor`)

    const totalRunsCard = page.locator('article').filter({ hasText: 'Total Runs' }).first()
    await expect(totalRunsCard).toBeVisible()
    await expect(totalRunsCard.locator('p').nth(1)).not.toHaveText('--')
    await expect(page.getByText(/Tokens:\s*\d+/)).toBeVisible()
  })

  test('preview tab loads iframe', async ({ page }) => {
    await page.goto(`/project/${projectId}/preview`)

    await expect(page.getByRole('heading', { name: 'Preview' })).toBeVisible()
    await expect(page.getByTestId('preview-frame')).toBeVisible()
    await expect(page.getByTestId('preview-frame')).toHaveAttribute(
      'src',
      /http:\/\/localhost:\d+/
    )
  })

  test('settings persist binary path changes', async ({ page }) => {
    await page.goto('/settings')

    await page.getByLabel('Ralph binary path').fill(mockBinaryPath)
    await page.getByRole('button', { name: 'Save settings' }).click()
    await expect(page.getByText('Settings saved.')).toBeVisible()

    await page.reload()
    await expect(page.getByLabel('Ralph binary path')).toHaveValue(mockBinaryPath)
  })
})
