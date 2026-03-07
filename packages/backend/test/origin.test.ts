import { describe, expect, it } from 'vitest'
import {
  isOriginAllowed,
  parseAllowedOrigins,
  parseRequestHosts
} from '../src/lib/origin.js'

describe('origin policy', () => {
  it('allows missing and localhost origins by default', () => {
    expect(isOriginAllowed(undefined, new Set())).toBe(true)
    expect(isOriginAllowed('http://localhost:5173', new Set())).toBe(true)
    expect(isOriginAllowed('http://127.0.0.1:5174', new Set())).toBe(true)
    expect(isOriginAllowed('http://[::1]:5173', new Set())).toBe(true)
  })

  it('rejects non-localhost origins unless explicitly configured', () => {
    expect(isOriginAllowed('http://example.com', new Set())).toBe(false)
    const configured = parseAllowedOrigins('http://example.com, https://intranet.local')
    expect(isOriginAllowed('http://example.com', configured)).toBe(true)
    expect(isOriginAllowed('https://intranet.local', configured)).toBe(true)
  })

  it('allows same-host origins for reverse-proxied requests', () => {
    const requestHosts = parseRequestHosts(['app.example.com', 'app.example.com'])
    expect(
      isOriginAllowed('https://app.example.com', new Set(), requestHosts)
    ).toBe(true)
  })
})
