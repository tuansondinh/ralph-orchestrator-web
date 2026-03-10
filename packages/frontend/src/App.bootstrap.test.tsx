import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('App bootstrap import boundaries', () => {
  it('lazy-loads cloud auth modules instead of statically importing them', async () => {
    const appSource = await readFile(resolve(process.cwd(), 'src', 'App.tsx'), 'utf8')
    const trpcSource = await readFile(resolve(process.cwd(), 'src', 'lib', 'trpc.ts'), 'utf8')
    const websocketSource = await readFile(
      resolve(process.cwd(), 'src', 'hooks', 'useWebSocket.ts'),
      'utf8'
    )

    expect(appSource).not.toContain("from '@/providers/AuthProvider'")
    expect(appSource).not.toContain("from '@/pages/SignInPage'")
    expect(appSource).not.toContain("from './CloudApp'")
    expect(appSource).toContain("import.meta.glob('./CloudApp.tsx')")

    expect(trpcSource).not.toContain("from '@/lib/supabase'")
    expect(websocketSource).not.toContain("from '@/lib/supabase'")
    expect(trpcSource).toContain("from '@/lib/authSession'")
    expect(websocketSource).toContain("from '@/lib/authSession'")
  })
})
