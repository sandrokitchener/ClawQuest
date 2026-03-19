import { invoke } from '@tauri-apps/api/core'

export type ConnectionMode = 'local' | 'remote' | 'docker'

export type ManagerConfig = {
  workdir?: string
  skillsDir?: string
  registry?: string
  openclawPath?: string
  connectionMode?: ConnectionMode
  gatewayUrl?: string
  gatewayToken?: string
  dockerContainer?: string
  dockerCommand?: string
  dockerWorkdir?: string
}

export type SkillRoot = {
  path: string
  label: string
  selected: boolean
  exists: boolean
}

export type OpenClawTarget = {
  path: string
  label: string
  source: string
  kind: 'binary' | 'workspace' | 'directory' | string
  exists: boolean
  selected: boolean
}

export type SecurityScanner = {
  name: string
  status: 'clean' | 'suspicious' | 'malicious' | 'pending' | 'error' | 'unknown' | string
  verdict?: string | null
  summary?: string | null
  checkedAt?: number | null
  confidence?: string | null
  source?: string | null
}

export type InstalledSkillSecurity = {
  status: 'clean' | 'suspicious' | 'malicious' | 'pending' | 'error' | 'unknown' | string
  summary: string
  checkedAt?: number | null
  hasKnownIssues: boolean
  hasScanResult: boolean
  reasonCodes: string[]
  model?: string | null
  virustotalUrl?: string | null
  versionContext: 'installed' | 'latest' | string
  sourceVersion?: string | null
  matchesRequestedVersion?: boolean | null
  scanners: SecurityScanner[]
}

export type InstalledSkill = {
  slug: string
  version?: string | null
  installedAt?: number | null
  path: string
  rootLabel: string
  registry?: string | null
  source: string
  status: 'ready' | 'missing'
  security: InstalledSkillSecurity
}

export type ManagerState = {
  resolvedWorkdir: string
  resolvedSkillsDir: string
  workspaceSource: string
  registry: string
  skillRoots: SkillRoot[]
  openclawTarget?: OpenClawTarget | null
  openclawCandidates: OpenClawTarget[]
  installed: InstalledSkill[]
}

export type RegistrySkill = {
  slug: string
  displayName: string
  summary?: string | null
  version?: string | null
  updatedAt?: number | null
  score?: number | null
  downloads?: number | null
  rating?: number | null
}

export type BrowseSort = 'downloads' | 'newest' | 'trending'

export type ActionOutcome = {
  state: ManagerState
  notice: string
}

export type InstallOutcome = {
  state?: ManagerState | null
  notice: string
  requiresConfirmation: boolean
  confirmationReason?: string | null
}

export type QuestOutcome = {
  reply: string
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown
  }
}

export function isTauriRuntime() {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__)
}

export function normalizeCommandError(error: unknown) {
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message ?? 'Unknown desktop error')
  }
  return 'Unknown desktop error'
}

export async function loadManagerState(config?: ManagerConfig) {
  return invoke<ManagerState>('load_manager_state', { config })
}

export async function browseRegistrySkills(config: ManagerConfig | undefined, sort: BrowseSort) {
  return invoke<RegistrySkill[]>('browse_registry_skills', {
    config,
    limit: 24,
    sort,
  })
}

export async function searchRegistrySkills(config: ManagerConfig | undefined, query: string) {
  return invoke<RegistrySkill[]>('search_registry_skills', {
    config,
    limit: 24,
    query,
  })
}

export async function installRegistrySkill(
  config: ManagerConfig | undefined,
  slug: string,
  version?: string | null,
  force = false,
) {
  return invoke<InstallOutcome>('install_registry_skill', {
    config,
    force,
    slug,
    version,
  })
}

export async function uninstallRegistrySkill(
  config: ManagerConfig | undefined,
  slug: string,
  path?: string,
) {
  return invoke<ActionOutcome>('uninstall_registry_skill', {
    config,
    path,
    slug,
  })
}

export async function sendOpenClawPrompt(config: ManagerConfig | undefined, prompt: string) {
  return invoke<QuestOutcome>('send_openclaw_prompt', {
    config,
    prompt,
  })
}

export async function closeDesktopWindow() {
  if (!isTauriRuntime()) {
    return
  }

  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  await getCurrentWindow().close()
}

export async function setDesktopWindowDocked(docked: boolean) {
  if (!isTauriRuntime()) {
    return
  }

  const [{ LogicalSize }, { getCurrentWindow }] = await Promise.all([
    import('@tauri-apps/api/dpi'),
    import('@tauri-apps/api/window'),
  ])
  const appWindow = getCurrentWindow()
  const width = docked ? 860 : 1580
  const height = docked ? 900 : 1120
  const targetSize = new LogicalSize(width, height)

  await appWindow.setSizeConstraints({
    minWidth: width,
    maxWidth: width,
    minHeight: height,
    maxHeight: height,
  })
  await appWindow.setSize(targetSize)
  await appWindow.center()
}
