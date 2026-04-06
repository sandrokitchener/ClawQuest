export type StoredConnectionSettings = {
  connectionMode?: 'local' | 'remote' | 'docker'
  gatewayUrl?: string
  gatewayToken?: string
  dockerContainer?: string
  dockerCommand?: string
  dockerWorkdir?: string
}

export const GATEWAY_TOKEN_STORAGE_MODE: 'memory-only' | 'persist' = 'memory-only'

function shouldPersistGatewayToken() {
  return GATEWAY_TOKEN_STORAGE_MODE === 'persist'
}

function normalizeStoredConnectionMode(value: unknown): 'local' | 'remote' | 'docker' {
  return value === 'remote' || value === 'docker' ? value : 'local'
}

function normalizeDockerCommand(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : 'openclaw'
}

export function parseStoredConnectionSettings(raw: string | null): StoredConnectionSettings {
  if (!raw) {
    return {}
  }

  const parsed = JSON.parse(raw) as StoredConnectionSettings
  return {
    connectionMode: normalizeStoredConnectionMode(parsed.connectionMode),
    gatewayUrl: typeof parsed.gatewayUrl === 'string' ? parsed.gatewayUrl : '',
    gatewayToken:
      shouldPersistGatewayToken() && typeof parsed.gatewayToken === 'string'
        ? parsed.gatewayToken
        : '',
    dockerContainer: typeof parsed.dockerContainer === 'string' ? parsed.dockerContainer : '',
    dockerCommand: normalizeDockerCommand(parsed.dockerCommand),
    dockerWorkdir: typeof parsed.dockerWorkdir === 'string' ? parsed.dockerWorkdir : '',
  }
}

export function buildStoredConnectionSettings(
  settings: StoredConnectionSettings,
): StoredConnectionSettings {
  return {
    connectionMode: normalizeStoredConnectionMode(settings.connectionMode),
    gatewayUrl: settings.gatewayUrl ?? '',
    gatewayToken: shouldPersistGatewayToken() ? (settings.gatewayToken ?? '') : '',
    dockerContainer: settings.dockerContainer ?? '',
    dockerCommand: normalizeDockerCommand(settings.dockerCommand),
    dockerWorkdir: settings.dockerWorkdir ?? '',
  }
}
