import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('createApp local startup import boundaries', () => {
  it('avoids top-level cloud imports in the local bootstrap modules', async () => {
    const appSource = await readFile(resolve(process.cwd(), 'src', 'app.ts'), 'utf8')
    const websocketSource = await readFile(
      resolve(process.cwd(), 'src', 'api', 'websocket.ts'),
      'utf8'
    )

    expect(appSource).not.toContain("from './api/githubAuth.js'")
    expect(appSource).not.toContain("from './auth/supabaseAuth.js'")
    expect(appSource).not.toContain("from './services/GitHubService.js'")
    expect(appSource).toMatch(/import\(\s*['"]\.\/api\/githubAuth\.js['"]\s*\)/)
    expect(appSource).toMatch(/import\(\s*['"]\.\/auth\/supabaseAuth\.js['"]\s*\)/)
    expect(appSource).toMatch(/import\(\s*['"]\.\/services\/GitHubService\.js['"]\s*\)/)

    expect(websocketSource).not.toContain("from '../auth/supabaseAuth.js'")
    expect(websocketSource).toMatch(
      /import\(\s*['"]\.\.\/auth\/supabaseAuth\.js['"]\s*\)/
    )
  })
})
