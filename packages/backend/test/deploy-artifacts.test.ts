import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const deployDirectory = fileURLToPath(new URL('../../../deploy/', import.meta.url))

function readDeployFile(name: string) {
  return readFileSync(resolve(deployDirectory, name), 'utf8')
}

describe('EC2 deployment artifacts', () => {
  it('includes the expected deploy files', () => {
    expect(existsSync(resolve(deployDirectory, 'ralph-orchestrator.service'))).toBe(true)
    expect(existsSync(resolve(deployDirectory, 'nginx-ralph.conf'))).toBe(true)
    expect(existsSync(resolve(deployDirectory, '.env.example'))).toBe(true)
    expect(existsSync(resolve(deployDirectory, 'deploy.sh'))).toBe(true)
    expect(existsSync(resolve(deployDirectory, 'EC2_SETUP.md'))).toBe(true)
  })

  it('uses the repo production entrypoint in the systemd service', () => {
    const service = readDeployFile('ralph-orchestrator.service')

    expect(service).toContain('WorkingDirectory=/opt/ralph-orchestrator-web')
    expect(service).toContain('EnvironmentFile=/opt/ralph-orchestrator-web/.env')
    expect(service).toContain('Environment=NODE_ENV=production')
    expect(service).toContain('ExecStart=/usr/bin/npm run start')
    expect(service).toContain('Restart=on-failure')
    expect(service).toContain('LimitNOFILE=65536')
  })

  it('captures frontend, API, and WebSocket proxy requirements in nginx', () => {
    const nginx = readDeployFile('nginx-ralph.conf')

    expect(nginx).toContain('proxy_pass http://127.0.0.1:3003')
    expect(nginx).toContain('location /ws')
    expect(nginx).toContain('proxy_set_header Upgrade $http_upgrade')
    expect(nginx).toContain('proxy_set_header Connection $connection_upgrade')
    expect(nginx).toContain('proxy_read_timeout 86400')
  })

  it('lists the required cloud environment variables', () => {
    const envExample = readDeployFile('.env.example')

    expect(envExample).toContain('PORT=3003')
    expect(envExample).toContain('RALPH_UI_BIND_HOST=0.0.0.0')
    expect(envExample).toContain('RALPH_UI_WORKSPACE_DIR=')
    expect(envExample).toContain('SUPABASE_URL=')
    expect(envExample).toContain('SUPABASE_ANON_KEY=')
    expect(envExample).toContain('SUPABASE_DB_URL=')
    expect(envExample).toContain('GITHUB_CLIENT_ID=')
    expect(envExample).toContain('GITHUB_CLIENT_SECRET=')
    expect(envExample).toContain('GITHUB_CALLBACK_URL=')
  })

  it('ships a syntactically valid deploy script with build, migrate, and restart steps', () => {
    const deployScriptPath = resolve(deployDirectory, 'deploy.sh')
    const deployScript = readDeployFile('deploy.sh')

    expect(() => execFileSync('bash', ['-n', deployScriptPath], { stdio: 'pipe' })).not.toThrow()
    expect(deployScript).toContain('npm run build')
    expect(deployScript).toContain('npm ci --omit=dev')
    expect(deployScript).toContain('npm run db:migrate:cloud')
    expect(deployScript).toContain('systemctl restart ralph-orchestrator')
  })

  it('documents EC2 bootstrap and verification steps', () => {
    const guide = readDeployFile('EC2_SETUP.md')

    expect(guide).toContain('Node.js 20')
    expect(guide).toContain('systemctl enable --now ralph-orchestrator')
    expect(guide).toContain('nginx -t')
    expect(guide).toContain('journalctl -u ralph-orchestrator')
    expect(guide).toContain('GitHub OAuth App')
  })
})
