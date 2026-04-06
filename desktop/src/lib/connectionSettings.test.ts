import { describe, expect, it } from 'bun:test'
import {
  buildStoredConnectionSettings,
  parseStoredConnectionSettings,
} from './connectionSettings'

describe('connectionSettings', () => {
  it('drops stored gateway tokens when reloading persisted settings', () => {
    const parsed = parseStoredConnectionSettings(
      JSON.stringify({
        connectionMode: 'remote',
        gatewayUrl: 'wss://gateway.example.com',
        gatewayToken: 'bootstrap-token',
      }),
    )

    expect(parsed.connectionMode).toBe('remote')
    expect(parsed.gatewayUrl).toBe('wss://gateway.example.com')
    expect(parsed.gatewayToken).toBe('')
  })

  it('serializes gateway tokens as empty when persisting settings', () => {
    const serialized = buildStoredConnectionSettings({
      connectionMode: 'remote',
      gatewayUrl: 'wss://gateway.example.com',
      gatewayToken: 'bootstrap-token',
      dockerCommand: 'openclaw',
    })

    expect(serialized).toMatchObject({
      connectionMode: 'remote',
      gatewayUrl: 'wss://gateway.example.com',
      gatewayToken: '',
      dockerCommand: 'openclaw',
    })
  })
})
