import { createError, defineEventHandler, getRequestURL, proxy } from 'h3'

import { buildConvexApiProxyTarget } from '../../lib/convexSite'

export default defineEventHandler((event) => {
  try {
    const target = buildConvexApiProxyTarget(getRequestURL(event))
    return proxy(event, target)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to resolve the Convex API proxy target.'

    throw createError({
      statusCode: 500,
      statusMessage: message,
    })
  }
})
