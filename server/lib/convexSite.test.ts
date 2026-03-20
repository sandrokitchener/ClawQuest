import { describe, expect, it } from 'vitest'

import {
  buildConvexApiProxyTarget,
  getConfiguredConvexSiteOrigin,
  getRequiredConvexProxyOrigin,
  getServerApiBase,
  isSecureConvexOrigin,
} from './convexSite'

describe('convex site helpers', () => {
  it('prefers the server-only Convex site URL when present', () => {
    expect(
      getConfiguredConvexSiteOrigin({
        CONVEX_SITE_URL: 'https://private.example.convex.site/path',
        VITE_CONVEX_SITE_URL: 'https://public.example.convex.site',
      }),
    ).toBe('https://private.example.convex.site')
  })

  it('requires a configured Convex site URL for the proxy', () => {
    expect(() => getRequiredConvexProxyOrigin({})).toThrow(
      /CONVEX_SITE_URL or VITE_CONVEX_SITE_URL must be configured/i,
    )
  })

  it('rejects insecure external proxy targets', () => {
    expect(() => getRequiredConvexProxyOrigin({ CONVEX_SITE_URL: 'http://example.com' })).toThrow(
      /must use https/i,
    )
  })

  it('allows loopback HTTP proxy targets for local development', () => {
    expect(getRequiredConvexProxyOrigin({ CONVEX_SITE_URL: 'http://127.0.0.1:3210' })).toBe(
      'http://127.0.0.1:3210',
    )
    expect(isSecureConvexOrigin('http://localhost:3210')).toBe(true)
  })

  it('builds an upstream proxy URL with the original path and query intact', () => {
    const requestUrl = new URL('https://clawhub.ai/api/v1/search?q=patch')

    expect(
      buildConvexApiProxyTarget(requestUrl, {
        CONVEX_SITE_URL: 'https://private.example.convex.site',
      }),
    ).toBe('https://private.example.convex.site/api/v1/search?q=patch')
  })

  it('falls back to the site URL or request host for server-side metadata fetches', () => {
    expect(
      getServerApiBase('https://clawhub.ai', {
        env: { SITE_URL: 'https://site.example.com/app' },
      }),
    ).toBe('https://site.example.com')

    expect(
      getServerApiBase('https://clawhub.ai', {
        env: {},
        eventHost: 'preview.clawhub.ai',
      }),
    ).toBe('https://preview.clawhub.ai')
  })
})
