type ConvexSiteEnv = Partial<
  Record<'CONVEX_SITE_URL' | 'VITE_CONVEX_SITE_URL' | 'SITE_URL' | 'VITE_SITE_URL', string | undefined>
>

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'])

function trimEnv(value?: string | null) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function normalizeOrigin(value?: string | null) {
  const trimmed = trimEnv(value)
  if (!trimmed) return null

  try {
    return new URL(trimmed).origin
  } catch {
    return null
  }
}

function isLoopbackHostname(hostname: string) {
  return LOOPBACK_HOSTNAMES.has(hostname.toLowerCase())
}

function normalizeLoopbackEventOrigin(value?: string | null) {
  const trimmed = trimEnv(value)
  if (!trimmed) return null

  try {
    const origin = new URL(`https://${trimmed}`).origin
    return isLoopbackHostname(new URL(origin).hostname) ? origin : null
  } catch {
    return null
  }
}

export function isSecureConvexOrigin(value: string) {
  const url = new URL(value)
  return url.protocol === 'https:' || isLoopbackHostname(url.hostname)
}

export function getConfiguredConvexSiteOrigin(env: ConvexSiteEnv = process.env) {
  return normalizeOrigin(env.CONVEX_SITE_URL) ?? normalizeOrigin(env.VITE_CONVEX_SITE_URL)
}

export function getRequiredConvexProxyOrigin(env: ConvexSiteEnv = process.env) {
  const origin = getConfiguredConvexSiteOrigin(env)
  if (!origin) {
    throw new Error('CONVEX_SITE_URL or VITE_CONVEX_SITE_URL must be configured for the /api proxy.')
  }

  if (!isSecureConvexOrigin(origin)) {
    throw new Error('CONVEX_SITE_URL must use https:// unless it points at a local development host.')
  }

  return origin
}

export function buildConvexApiProxyTarget(requestUrl: URL, env: ConvexSiteEnv = process.env) {
  const origin = getRequiredConvexProxyOrigin(env)
  return new URL(`${requestUrl.pathname}${requestUrl.search}`, origin).toString()
}

export function getServerApiBase(
  fallbackOrigin: string,
  options: {
    env?: ConvexSiteEnv
    eventHost?: string | null
  } = {},
) {
  const env = options.env ?? process.env

  return (
    getConfiguredConvexSiteOrigin(env) ??
    normalizeOrigin(env.SITE_URL) ??
    normalizeOrigin(env.VITE_SITE_URL) ??
    normalizeLoopbackEventOrigin(options.eventHost) ??
    fallbackOrigin
  )
}
