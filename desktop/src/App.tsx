import {
  AlertTriangle,
  ArrowDownToLine,
  ChevronDown,
  ChevronRight,
  Clock3,
  Code2,
  Construction,
  FolderOpen,
  Globe,
  HardDrive,
  HandCoins,
  LoaderCircle,
  MessageCircle,
  RefreshCw,
  ScrollText,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Skull,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import questVoicePack from './data/quest-voice-pack.json'
import {
  browseRegistrySkills,
  centerDesktopWindow,
  closeDesktopWindow,
  type ConnectionMode,
  installRegistrySkill,
  isTauriRuntime,
  listenForQuestProgress,
  loadManagerState,
  normalizeCommandError,
  loadOpenClawCronJobs,
  pollRemoteGatewaySessionUpdate,
  searchRegistrySkills,
  sendOpenClawPrompt,
  setDesktopWindowDocked,
  uninstallRegistrySkill,
  type BrowseSort,
  type InstalledSkill,
  type InstalledSkillSecurity,
  type ManagerConfig,
  type ManagerState,
  type OpenClawCronJob,
  type OpenClawTarget,
  type QuestProgressEvent,
  type QuestSessionUpdate,
  type RegistrySkill,
  type SkillRoot,
} from './lib/tauri'
import {
  buildStoredConnectionSettings,
  parseStoredConnectionSettings,
} from './lib/connectionSettings'

type AgentClass = 'cleric' | 'ranger' | 'rogue' | 'paladin'
type AgentRace = 'elf' | 'orc' | 'human' | 'halfling' | 'tiefling' | 'goblin'
type QuestActivityCategory = 'internet' | 'writing' | 'research' | 'busywork' | 'combat'
type QuestResponseType = 'completed' | 'needs_input' | 'blocked'
type GearSlot = 'helm' | 'weapon' | 'shield' | 'core' | 'boots' | 'charm'
type SkillRarity = 'junk' | 'common' | 'rare' | 'epic' | 'legendary'
type DropZone = 'equip' | 'trash' | null
type Tone = 'clean' | 'warning' | 'danger' | 'neutral'
type QuestMood = 'idle' | 'busy' | 'returned' | 'error'
type AvatarMotion = 'idle' | 'talking' | 'walking'
type AdventurerProgress = {
  questsCompleted: number
  level: number
  questsIntoLevel: number
  questsForNextLevel: number
  remainingToNextLevel: number
  isMaxLevel: boolean
}
type DragPayload =
  | { kind: 'catalog'; skill: RegistrySkill }
  | { kind: 'installed'; skill: InstalledSkill }
  | null
type DragTransferData =
  | { kind: 'catalog'; slug: string }
  | { kind: 'installed'; path: string; slug: string }
type ManualDragSession = {
  payload: Exclude<DragPayload, null>
  x: number
  y: number
  offsetX: number
  offsetY: number
}
type DropTarget =
  | { kind: 'equip' }
  | { kind: 'slot'; slot: GearSlot }
  | { kind: 'trash' }
  | { kind: 'none' }

type DraftConfig = {
  workdir: string
  skillsDir: string
  openclawPath: string
  connectionMode: ConnectionMode
  gatewayUrl: string
  gatewayToken: string
  dockerContainer: string
  dockerCommand: string
  dockerWorkdir: string
}

type PixelFill = 'accent' | 'cloth' | 'metal' | 'outline' | 'shade' | 'skin' | 'trim'
type PixelRect = readonly [number, number, number, number, PixelFill]
type ColorPixelRect = readonly [number, number, number, number, string]
type SlotPreferenceMap = Partial<Record<string, GearSlot>>
type UiSound = 'blip' | 'coin' | 'equip' | 'goodNews' | 'levelUp' | 'questSend'
type SkillRarityDetails = {
  tier: SkillRarity
  label: string
  metric: string
}

type CatalogCacheEntry = {
  cachedAt: number
  items: RegistrySkill[]
}
type RefreshStateResult = {
  state: ManagerState | null
  errorMessage: string | null
}
type GatewayFailureAction = 'link' | 'refresh' | 'quest'
type QuestLogEntry = {
  id: number
  tone: Tone
  title: string
  detail?: string
  timestamp: number
}
type MobileQuestActivity = {
  prompt: string
  startedAt: number
  updatedAt: number
  summary: string
  statusLabel: string
  runtimeMs?: number | null
  waitingForApproval: boolean
}
type PartyAdventurer = {
  agentClass: AgentClass
  agentRace: AgentRace
  cadenceLabel: string
  classLabel: string
  dailyQuest: string
  id: string
  job: OpenClawCronJob
  level: number
  name: string
  statusLabel: string
  statusTone: Tone
}
type QuestVoicePack = {
  schemaVersion: number
  notes?: string[]
  examples?: Record<string, string>
  activityCategories: QuestActivityCategory[]
  responseTypes: QuestResponseType[]
  activityBubblesByCombo: Record<string, Record<QuestActivityCategory, string[]>>
  returnBubblesByCombo: Record<string, Record<QuestResponseType, string[]>>
  questReturnLeads: Record<QuestResponseType, string[]>
}

type DemoSkillSeed = {
  slug: string
  displayName: string
  summary: string
  version: string
  downloads: number
  rating: number
  score: number
  updatedAt: number
  securityStatus?: InstalledSkillSecurity['status']
  securitySummary?: string
  reasonCodes?: string[]
}

const EMPTY_DRAFT: DraftConfig = {
  workdir: '',
  skillsDir: '',
  openclawPath: '',
  connectionMode: 'local',
  gatewayUrl: '',
  gatewayToken: '',
  dockerContainer: '',
  dockerCommand: 'openclaw',
  dockerWorkdir: '',
}

const clawQuestWordmarkUrl = new URL('./assets/claw-quest-title.png', import.meta.url).href
const MAIN_BACKGROUND_MUSIC_URL = new URL('./assets/crpg-loop.wav', import.meta.url).href
const SHOP_BACKGROUND_MUSIC_URL = new URL('./assets/merchant-loop.wav', import.meta.url).href
const MAIN_BACKGROUND_MUSIC_VOLUME = 0.18
const SHOP_BACKGROUND_MUSIC_VOLUME = 0.16
const MAIN_BACKGROUND_MUSIC_PLAYBACK_RATE = 1
const SHOP_BACKGROUND_MUSIC_PLAYBACK_RATE = 1
type BackgroundMusicKind = 'main' | 'shop'
type PitchShiftableAudio = HTMLAudioElement & {
  mozPreservesPitch?: boolean
  preservesPitch?: boolean
  webkitPreservesPitch?: boolean
}

const QUEST_VOICE_PACK = questVoicePack as QuestVoicePack

function tuneBackgroundMusic(audio: HTMLAudioElement, volume: number, playbackRate: number) {
  const tonalAudio = audio as PitchShiftableAudio
  tonalAudio.volume = volume
  tonalAudio.playbackRate = playbackRate
  tonalAudio.preservesPitch = false
  tonalAudio.mozPreservesPitch = false
  tonalAudio.webkitPreservesPitch = false
}

const UI_SOUND_URLS: Record<UiSound, string> = {
  blip: new URL('./assets/blip.wav', import.meta.url).href,
  coin: new URL('./assets/coin.wav', import.meta.url).href,
  equip: new URL('./assets/equip.wav', import.meta.url).href,
  goodNews: new URL('./assets/good news.wav', import.meta.url).href,
  levelUp: new URL('./assets/level up.wav', import.meta.url).href,
  questSend: new URL('./assets/talk_sendonquest.wav', import.meta.url).href,
}

const EMPTY_STATE: ManagerState = {
  agentName: null,
  resolvedWorkdir: '',
  resolvedSkillsDir: '',
  workspaceSource: '',
  registry: '',
  skillRoots: [],
  openclawTarget: null,
  openclawCandidates: [],
  installed: [],
}

const SLOT_ORDER: GearSlot[] = ['helm', 'weapon', 'shield', 'core', 'boots', 'charm']

const SLOT_LABELS: Record<GearSlot, string> = {
  helm: 'Helm',
  weapon: 'Weapon',
  shield: 'Shield',
  core: 'Armor',
  boots: 'Boots',
  charm: 'Charm',
}

const SLOT_STORAGE_KEY = 'claw-quest-slot-preferences-v1'
const AGENT_RACE_STORAGE_KEY = 'claw-quest-adventurer-race-v1'
const QUEST_PROGRESS_STORAGE_KEY = 'claw-quest-adventurer-progress-v1'
const CONNECTION_SETTINGS_STORAGE_KEY = 'claw-quest-connection-settings-v1'
const AUDIO_MUTED_STORAGE_KEY = 'claw-quest-audio-muted-v1'
const QUEST_LOG_VISIBLE_STORAGE_KEY = 'claw-quest-quest-log-visible-v1'
const MOBILE_DEMO_MODE_STORAGE_KEY = 'claw-quest-mobile-demo-v1'
const DRAG_TRANSFER_KEY = 'application/x-claw-quest-skill'
const AVATAR_SPEAKING_MS = 2600
const CATALOG_SEARCH_DEBOUNCE_MS = 420
const CATALOG_CACHE_TTL_MS = 60_000
const CATALOG_CACHE_MAX_ENTRIES = 18
const CATALOG_RATE_LIMIT_FALLBACK_MS = 30_000
const QUEST_BUBBLE_PROGRESS_MS = 10_400
const QUEST_BUBBLE_ROTATION_GUARD_MS = 1800
const QUEST_PROGRESS_EVENT_MIN_MS = 9000
const MOBILE_QUEST_SESSION_POLL_MS = 1800
const MOBILE_QUEST_SESSION_WATCH_MS = 10 * 60_000
const MOBILE_SHELL_BREAKPOINT_PX = 860
const MOBILE_PREVIEW_QUEST_DELAY_MS = 900
const AGENT_RACE_OPTIONS: AgentRace[] = ['elf', 'orc', 'human', 'halfling', 'tiefling', 'goblin']
const COMPACT_NUMBER_FORMAT = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

const SKILL_RARITY_LABELS: Record<SkillRarity, string> = {
  junk: 'Junk',
  common: 'Common',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
}

const FEATURE_DEMO_QUERY_KEY = 'demo'
const FEATURE_DEMO_QUERY_VALUE = 'feature-video'
const FEATURE_DEMO_SECURITY_SUMMARY = 'Preview scan complete. No issues found.'
const FEATURE_DEMO_INSTALLED_SEEDS: DemoSkillSeed[] = [
  {
    slug: 'search-scout',
    displayName: 'Search Scout',
    summary: 'Charts docs, search results, and references before the quest begins.',
    version: '2.4.1',
    downloads: 38120,
    rating: 4.9,
    score: 96,
    updatedAt: Date.parse('2026-03-22T18:20:00Z'),
  },
  {
    slug: 'transcript-helper',
    displayName: 'Transcript Helper',
    summary: 'Turns rough notes and voice dumps into tidy briefings.',
    version: '1.4.7',
    downloads: 12990,
    rating: 4.5,
    score: 84,
    updatedAt: Date.parse('2026-03-17T16:00:00Z'),
  },
  {
    slug: 'web-fetch-blade',
    displayName: 'Web Fetch Blade',
    summary: 'Cuts through page fetches, scraping passes, and link checks.',
    version: '1.8.3',
    downloads: 29540,
    rating: 4.7,
    score: 91,
    updatedAt: Date.parse('2026-03-21T15:05:00Z'),
  },
  {
    slug: 'repo-guard',
    displayName: 'Repo Guard',
    summary: 'Keeps pull requests, auth flows, and repo health under watch.',
    version: '3.0.0',
    downloads: 27410,
    rating: 4.8,
    score: 94,
    updatedAt: Date.parse('2026-03-20T13:40:00Z'),
  },
  {
    slug: 'forge-plate',
    displayName: 'Forge Plate',
    summary: 'Handles build fixes, patches, and repo chores without losing momentum.',
    version: '5.1.2',
    downloads: 33210,
    rating: 4.9,
    score: 97,
    updatedAt: Date.parse('2026-03-22T09:10:00Z'),
  },
  {
    slug: 'route-runner',
    displayName: 'Route Runner',
    summary: 'Keeps deploy routes, sync jobs, and workspace travel light on their feet.',
    version: '1.6.4',
    downloads: 18620,
    rating: 4.6,
    score: 88,
    updatedAt: Date.parse('2026-03-18T20:45:00Z'),
  },
  {
    slug: 'prompt-helper',
    displayName: 'Prompt Helper',
    summary: 'Shapes clean prompts, answer notes, and chat-ready summaries.',
    version: '2.0.5',
    downloads: 24180,
    rating: 4.8,
    score: 90,
    updatedAt: Date.parse('2026-03-19T11:30:00Z'),
  },
]
const FEATURE_DEMO_CATALOG_SEEDS: DemoSkillSeed[] = [
  {
    slug: 'prompt-polisher',
    displayName: 'Prompt Polisher',
    summary: 'Tightens quest prompts and formats replies before they leave camp.',
    version: '1.4.0',
    downloads: 41840,
    rating: 4.9,
    score: 95,
    updatedAt: Date.parse('2026-03-23T08:10:00Z'),
  },
  {
    slug: 'audit-ward',
    displayName: 'Audit Ward',
    summary: 'Adds extra guard rails around security checks, tokens, and repo access.',
    version: '3.2.1',
    downloads: 21450,
    rating: 4.7,
    score: 89,
    updatedAt: Date.parse('2026-03-22T12:25:00Z'),
  },
  {
    slug: 'crawler-bow',
    displayName: 'Crawler Bow',
    summary: 'Scouts docs, pages, and crawling runs when the quest calls for range.',
    version: '2.3.6',
    downloads: 26890,
    rating: 4.6,
    score: 87,
    updatedAt: Date.parse('2026-03-21T06:55:00Z'),
  },
  {
    slug: 'deploy-sandals',
    displayName: 'Deploy Sandals',
    summary: 'Speeds route changes, sync passes, and deployment marches.',
    version: '1.1.9',
    downloads: 16740,
    rating: 4.4,
    score: 81,
    updatedAt: Date.parse('2026-03-20T18:00:00Z'),
  },
]
const FEATURE_DEMO_CRON_JOBS: OpenClawCronJob[] = [
  {
    id: 'dawn-watch',
    agentId: 'main',
    name: 'Dawn Watch',
    description: 'Check the gateway, scan overnight runs, and post a morning readiness note.',
    enabled: true,
    createdAtMs: Date.parse('2026-04-01T08:10:00Z'),
    updatedAtMs: Date.parse('2026-04-14T09:30:00Z'),
    schedule: {
      kind: 'cron',
      expr: '0 7 * * *',
      tz: 'America/Chicago',
    },
    payload: {
      kind: 'agentTurn',
      message: 'Inspect overnight gateway health, summarize failures, and flag anything that needs attention before standup.',
    },
    state: {
      nextRunAtMs: Date.now() + 2 * 60 * 60 * 1000,
      lastRunAtMs: Date.now() - 22 * 60 * 60 * 1000,
      lastRunStatus: 'ok',
      lastStatus: 'ok',
      lastDurationMs: 34_000,
      consecutiveErrors: 0,
      lastDelivered: true,
    },
  },
  {
    id: 'market-ranger',
    agentId: 'main',
    name: 'Market Ranger',
    description: 'Scout fresh skill listings, trend swings, and new releases worth equipping.',
    enabled: true,
    createdAtMs: Date.parse('2026-04-03T16:20:00Z'),
    updatedAtMs: Date.parse('2026-04-14T14:00:00Z'),
    schedule: {
      kind: 'cron',
      expr: '0 */6 * * *',
      tz: 'America/Chicago',
    },
    payload: {
      kind: 'agentTurn',
      message: 'Browse the market for new skill releases and summarize the best additions for the party.',
    },
    state: {
      nextRunAtMs: Date.now() + 50 * 60 * 1000,
      lastRunAtMs: Date.now() - 5 * 60 * 60 * 1000,
      lastRunStatus: 'ok',
      lastStatus: 'ok',
      lastDurationMs: 51_000,
      consecutiveErrors: 0,
      lastDelivered: true,
      runningAtMs: Date.now() - 4 * 60 * 1000,
    },
  },
  {
    id: 'ledger-rogue',
    agentId: 'main',
    name: 'Ledger Rogue',
    description: 'Sweep old reports, delivery misses, and suspicious errors before they pile up.',
    enabled: false,
    createdAtMs: Date.parse('2026-04-04T18:05:00Z'),
    updatedAtMs: Date.parse('2026-04-12T12:40:00Z'),
    schedule: {
      kind: 'cron',
      expr: '30 18 * * 5',
      tz: 'America/Chicago',
    },
    payload: {
      kind: 'agentTurn',
      message: 'Review stale report files, summarize anything missing, and note delivery failures.',
    },
    state: {
      nextRunAtMs: Date.now() + 3 * 24 * 60 * 60 * 1000,
      lastRunAtMs: Date.now() - 4 * 24 * 60 * 60 * 1000,
      lastRunStatus: 'error',
      lastStatus: 'paused',
      lastDurationMs: 18_000,
      consecutiveErrors: 2,
      lastDelivered: false,
    },
  },
]

const DEV_KEYWORDS = [
  'build',
  'bug',
  'code',
  'compile',
  'debug',
  'deploy',
  'dev',
  'fix',
  'git',
  'lint',
  'release',
  'repo',
  'test',
  'workspace',
]

const RANGER_KEYWORDS = [
  'browser',
  'crawl',
  'docs',
  'document',
  'fetch',
  'http',
  'html',
  'internet',
  'page',
  'scrape',
  'search',
  'site',
  'spider',
  'text',
  'url',
  'web',
]

const AUTH_ERROR_KEYWORDS = [
  'access token',
  'auth',
  'authenticate',
  'oauth',
  'refresh_token_reused',
  'refresh token',
  're-authenticate',
  'sign in',
  'token',
  'unauthorized',
]

const GATEWAY_ERROR_KEYWORDS = [
  'closed before connect',
  'failovererror',
  'gateway',
  'handshake timeout',
  'socket',
  'unavailable',
  'websocket',
  'ws]',
]

const FORGE_ERROR_KEYWORDS = [
  'build',
  'cargo',
  'compile',
  'eslint',
  'lint',
  'test',
  'tsc',
  'typescript',
  'vitest',
]

const CLASS_THEMES: Record<
  AgentClass,
  { label: string; icon: LucideIcon; summary: string; cardClass: string }
> = {
  cleric: {
    label: 'Cleric',
    icon: Code2,
    summary: 'Coding and build skills lead this loadout.',
    cardClass: 'class-card-cleric',
  },
  ranger: {
    label: 'Ranger',
    icon: Globe,
    summary: 'Internet and scraping skills lead this loadout.',
    cardClass: 'class-card-ranger',
  },
  rogue: {
    label: 'Rogue',
    icon: Skull,
    summary: 'Lower-security skills are in the loadout.',
    cardClass: 'class-card-rogue',
  },
  paladin: {
    label: 'Paladin',
    icon: ShieldCheck,
    summary: 'Only secure skills are equipped.',
    cardClass: 'class-card-paladin',
  },
}

const RACE_LABELS: Record<AgentRace, string> = {
  elf: 'Elf',
  orc: 'Orc',
  human: 'Human',
  halfling: 'Halfling',
  tiefling: 'Tiefling',
  goblin: 'Goblin',
}

const PIXEL_PALETTES: Record<AgentClass, Record<PixelFill, string>> = {
  cleric: {
    accent: '#f8f1df',
    cloth: '#ece3ce',
    metal: '#f1eadb',
    outline: '#22171a',
    shade: '#8b7444',
    skin: '#efc39e',
    trim: '#efc95d',
  },
  ranger: {
    accent: '#9cbb7a',
    cloth: '#587343',
    metal: '#c6b58a',
    outline: '#22171a',
    shade: '#32472a',
    skin: '#efc39e',
    trim: '#7a5633',
  },
  rogue: {
    accent: '#de6972',
    cloth: '#67507d',
    metal: '#b6b0cc',
    outline: '#22171a',
    shade: '#44324f',
    skin: '#efc39e',
    trim: '#c66161',
  },
  paladin: {
    accent: '#f2dd8c',
    cloth: '#496c95',
    metal: '#e6e0cc',
    outline: '#22171a',
    shade: '#304661',
    skin: '#efc39e',
    trim: '#f2c768',
  },
}

const RACE_PIXEL_PALETTE_OVERRIDES: Record<AgentRace, Partial<Record<PixelFill, string>>> = {
  elf: {
    skin: '#f3d3ad',
    trim: '#8ecf88',
  },
  orc: {
    skin: '#78ae67',
    trim: '#e4d184',
  },
  human: {},
  halfling: {
    skin: '#f0bf95',
    trim: '#b87a47',
  },
  tiefling: {
    skin: '#c86d74',
    trim: '#f1cb77',
    accent: '#f09b68',
  },
  goblin: {
    skin: '#86b862',
    trim: '#dbcb7a',
  },
}

const BASE_PIXEL_RECTS: PixelRect[] = [
  [6, 2, 4, 1, 'outline'],
  [5, 3, 6, 1, 'trim'],
  [4, 4, 8, 1, 'outline'],
  [4, 5, 1, 5, 'outline'],
  [11, 5, 1, 5, 'outline'],
  [5, 5, 6, 5, 'skin'],
  [6, 6, 1, 1, 'outline'],
  [9, 6, 1, 1, 'outline'],
  [6, 8, 4, 1, 'shade'],
  [4, 10, 8, 1, 'outline'],
  [5, 11, 6, 1, 'metal'],
  [4, 12, 8, 5, 'cloth'],
  [3, 13, 1, 4, 'shade'],
  [12, 13, 1, 4, 'shade'],
  [5, 17, 2, 3, 'shade'],
  [9, 17, 2, 3, 'shade'],
]

const RACE_PIXEL_RECTS: Record<AgentRace, PixelRect[]> = {
  elf: [
    [3, 5, 1, 1, 'skin'],
    [2, 6, 1, 1, 'skin'],
    [12, 5, 1, 1, 'skin'],
    [13, 6, 1, 1, 'skin'],
    [2, 5, 1, 1, 'outline'],
    [13, 5, 1, 1, 'outline'],
  ],
  orc: [
    [3, 5, 1, 2, 'skin'],
    [12, 5, 1, 2, 'skin'],
    [5, 8, 1, 1, 'trim'],
    [10, 8, 1, 1, 'trim'],
    [5, 5, 2, 1, 'shade'],
    [9, 5, 2, 1, 'shade'],
  ],
  human: [],
  halfling: [
    [4, 2, 1, 1, 'trim'],
    [11, 2, 1, 1, 'trim'],
    [5, 2, 6, 1, 'trim'],
    [6, 18, 1, 1, 'shade'],
    [9, 18, 1, 1, 'shade'],
  ],
  tiefling: [
    [4, 1, 1, 2, 'accent'],
    [10, 1, 1, 2, 'accent'],
    [3, 2, 1, 1, 'outline'],
    [11, 2, 1, 1, 'outline'],
    [5, 8, 1, 1, 'trim'],
    [10, 8, 1, 1, 'trim'],
  ],
  goblin: [
    [3, 5, 1, 2, 'skin'],
    [2, 6, 1, 1, 'skin'],
    [12, 5, 1, 2, 'skin'],
    [13, 6, 1, 1, 'skin'],
    [5, 8, 1, 1, 'trim'],
    [10, 8, 1, 1, 'trim'],
  ],
}

const CLASS_PIXEL_RECTS: Record<AgentClass, PixelRect[]> = {
  cleric: [
    [3, 11, 1, 6, 'shade'],
    [12, 11, 1, 6, 'shade'],
    [4, 11, 8, 1, 'trim'],
    [4, 12, 8, 5, 'accent'],
    [6, 12, 4, 1, 'trim'],
    [7, 12, 1, 5, 'trim'],
    [8, 12, 1, 5, 'trim'],
    [5, 15, 2, 2, 'cloth'],
    [9, 15, 2, 2, 'cloth'],
  ],
  ranger: [
    [4, 2, 8, 2, 'shade'],
    [3, 4, 2, 4, 'shade'],
    [11, 4, 2, 4, 'shade'],
    [4, 11, 8, 1, 'trim'],
    [3, 12, 1, 5, 'shade'],
    [12, 12, 1, 5, 'shade'],
    [4, 12, 8, 4, 'cloth'],
    [2, 13, 1, 4, 'shade'],
    [13, 13, 1, 4, 'shade'],
    [9, 10, 3, 1, 'trim'],
    [10, 11, 2, 4, 'shade'],
    [9, 11, 1, 1, 'metal'],
  ],
  rogue: [
    [4, 3, 8, 1, 'outline'],
    [3, 4, 2, 4, 'shade'],
    [11, 4, 2, 4, 'shade'],
    [5, 12, 6, 1, 'accent'],
    [4, 13, 8, 3, 'shade'],
    [11, 13, 1, 4, 'metal'],
    [10, 16, 3, 1, 'trim'],
  ],
  paladin: [
    [5, 2, 6, 1, 'trim'],
    [4, 3, 8, 1, 'metal'],
    [3, 4, 10, 2, 'metal'],
    [4, 6, 8, 4, 'metal'],
    [7, 4, 2, 5, 'trim'],
    [5, 6, 2, 1, 'shade'],
    [9, 6, 2, 1, 'shade'],
    [6, 7, 4, 1, 'trim'],
    [2, 11, 3, 5, 'metal'],
    [5, 11, 6, 1, 'trim'],
    [6, 12, 4, 4, 'metal'],
    [7, 13, 1, 2, 'accent'],
    [8, 13, 1, 2, 'accent'],
  ],
}

const SLOT_ICON_RECTS: Record<GearSlot, ColorPixelRect[]> = {
  helm: [
    [4, 1, 4, 1, '#352113'],
    [3, 2, 6, 1, '#d7c08f'],
    [2, 3, 8, 1, '#352113'],
    [1, 4, 10, 4, '#b3c1d6'],
    [2, 5, 1, 2, '#352113'],
    [8, 5, 1, 2, '#352113'],
    [4, 5, 2, 1, '#352113'],
    [6, 5, 1, 3, '#352113'],
    [7, 5, 2, 1, '#352113'],
    [3, 8, 6, 2, '#6d87bd'],
    [4, 10, 4, 1, '#352113'],
  ],
  weapon: [
    [5, 1, 2, 4, '#d7c08f'],
    [4, 2, 4, 1, '#f4ead2'],
    [5, 5, 2, 3, '#6d87bd'],
    [4, 8, 4, 1, '#352113'],
    [2, 9, 8, 1, '#a9754e'],
    [4, 10, 4, 2, '#5a3a22'],
  ],
  shield: [
    [4, 1, 4, 1, '#352113'],
    [3, 2, 6, 1, '#6d87bd'],
    [2, 3, 8, 1, '#352113'],
    [2, 4, 8, 1, '#c7d3e3'],
    [1, 5, 1, 2, '#352113'],
    [10, 5, 1, 2, '#352113'],
    [2, 5, 8, 2, '#c7d3e3'],
    [2, 7, 1, 1, '#352113'],
    [9, 7, 1, 1, '#352113'],
    [3, 7, 6, 1, '#c7d3e3'],
    [3, 8, 1, 1, '#352113'],
    [8, 8, 1, 1, '#352113'],
    [4, 8, 4, 1, '#c7d3e3'],
    [5, 4, 2, 5, '#d7c08f'],
    [3, 5, 6, 1, '#d7c08f'],
    [4, 9, 1, 1, '#352113'],
    [7, 9, 1, 1, '#352113'],
    [5, 9, 2, 1, '#6d87bd'],
    [5, 10, 2, 1, '#352113'],
  ],
  core: [
    [4, 1, 4, 1, '#352113'],
    [2, 2, 3, 2, '#c7d3e3'],
    [7, 2, 3, 2, '#c7d3e3'],
    [1, 4, 10, 1, '#352113'],
    [2, 5, 8, 4, '#b3c1d6'],
    [3, 5, 1, 1, '#f4ead2'],
    [8, 5, 1, 1, '#f4ead2'],
    [5, 6, 2, 2, '#6d87bd'],
    [4, 9, 4, 1, '#6d87bd'],
    [3, 10, 6, 1, '#352113'],
  ],
  boots: [
    [2, 2, 3, 5, '#5a3a22'],
    [7, 2, 3, 5, '#5a3a22'],
    [2, 7, 4, 2, '#d7c08f'],
    [6, 7, 4, 2, '#d7c08f'],
    [1, 9, 5, 2, '#352113'],
    [6, 9, 5, 2, '#352113'],
  ],
  charm: [
    [5, 1, 2, 2, '#352113'],
    [4, 2, 4, 2, '#d7c08f'],
    [2, 4, 8, 1, '#352113'],
    [1, 5, 10, 2, '#d06c82'],
    [2, 7, 8, 2, '#f0a7ba'],
    [4, 9, 4, 2, '#352113'],
  ],
}

const SHOPKEEPER_PIXEL_RECTS: ColorPixelRect[] = [
  [5, 2, 6, 1, '#302023'],
  [4, 3, 8, 1, '#6a7f44'],
  [3, 4, 10, 1, '#302023'],
  [3, 5, 2, 3, '#6a7f44'],
  [11, 5, 2, 3, '#6a7f44'],
  [5, 5, 6, 5, '#e7ba8e'],
  [5, 4, 6, 1, '#c48f45'],
  [6, 6, 1, 1, '#302023'],
  [9, 6, 1, 1, '#302023'],
  [6, 8, 4, 1, '#9b6a45'],
  [4, 10, 8, 1, '#302023'],
  [4, 11, 8, 3, '#7f74ad'],
  [3, 12, 1, 4, '#5d4f85'],
  [12, 12, 1, 4, '#5d4f85'],
  [5, 14, 6, 1, '#d6c08f'],
  [5, 15, 2, 3, '#4b5f33'],
  [9, 15, 2, 3, '#4b5f33'],
  [6, 11, 1, 2, '#d8d08c'],
  [9, 11, 1, 2, '#d8d08c'],
]

const MARKET_BAG_PIXEL_RECTS: ColorPixelRect[] = [
  [4, 1, 4, 1, '#5a3a22'],
  [3, 2, 6, 1, '#d7c08f'],
  [2, 3, 8, 1, '#5a3a22'],
  [1, 4, 10, 1, '#c69054'],
  [1, 5, 10, 3, '#d8aa55'],
  [2, 8, 8, 2, '#b57941'],
  [4, 5, 1, 1, '#f9e4a4'],
  [7, 5, 1, 1, '#f9e4a4'],
]

export default function App() {
  const runtime = isTauriRuntime()
  const [managerState, setManagerState] = useState<ManagerState | null>(null)
  const [demoInstalled, setDemoInstalled] = useState<InstalledSkill[]>(() =>
    isFeatureDemoMode() || readMobileDemoMode() ? buildFeatureDemoInstalledSkills() : [],
  )
  const [catalog, setCatalog] = useState<RegistrySkill[]>([])
  const [draftConfig, setDraftConfig] = useState<DraftConfig>(() => mergeStoredConnectionSettings(EMPTY_DRAFT))
  const [appliedConfig, setAppliedConfig] = useState<ManagerConfig | undefined>(() =>
    configFromDraft(mergeStoredConnectionSettings(EMPTY_DRAFT)),
  )
  const [searchText, setSearchText] = useState('')
  const [sort, setSort] = useState<BrowseSort>('downloads')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [catalogIssue, setCatalogIssue] = useState('')
  const [catalogCooldownUntil, setCatalogCooldownUntil] = useState<number | null>(null)
  const [cronJobs, setCronJobs] = useState<OpenClawCronJob[]>([])
  const [booted, setBooted] = useState(false)
  const [loadingState, setLoadingState] = useState(true)
  const [loadingCatalog, setLoadingCatalog] = useState(true)
  const [loadingParty, setLoadingParty] = useState(true)
  const [workingSlug, setWorkingSlug] = useState<string | null>(null)
  const [removingPath, setRemovingPath] = useState<string | null>(null)
  const [dragPayload, setDragPayload] = useState<DragPayload>(null)
  const [manualDrag, setManualDrag] = useState<ManualDragSession | null>(null)
  const [dropZone, setDropZone] = useState<DropZone>(null)
  const [hoveredGearSlot, setHoveredGearSlot] = useState<GearSlot | null>(null)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [buildsOpen, setBuildsOpen] = useState(false)
  const [rootsOpen, setRootsOpen] = useState(false)
  const [slotPreferences, setSlotPreferences] = useState<SlotPreferenceMap>(() => readSlotPreferences())
  const [agentRace, setAgentRace] = useState<AgentRace>(() => readOrCreateAgentRace())
  const [questsCompleted, setQuestsCompleted] = useState(() => readQuestProgress())
  const [audioMuted, setAudioMuted] = useState(() => readAudioMuted())
  const [isMobileShell, setIsMobileShell] = useState(() => detectMobileShell())
  const [isDocked, setIsDocked] = useState(() => detectMobileShell())
  const [mobileDemoMode, setMobileDemoMode] = useState(() => readMobileDemoMode())
  const [mobileShopOpen, setMobileShopOpen] = useState(false)
  const [desktopShopOpen, setDesktopShopOpen] = useState(false)
  const [partyOpen, setPartyOpen] = useState(false)
  const [mobileSetupOpen, setMobileSetupOpen] = useState(() => {
    const initialDraft = mergeStoredConnectionSettings(EMPTY_DRAFT)
    return !hasGatewayWizardConfig(initialDraft) && !readMobileDemoMode()
  })
  const [mobileSetupStep, setMobileSetupStep] = useState(0)
  const [mobileSetupDismissed, setMobileSetupDismissed] = useState(false)
  const [mobileSetupError, setMobileSetupError] = useState('')
  const [mobileSetupWorking, setMobileSetupWorking] = useState(false)
  const [partyError, setPartyError] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [questDraft, setQuestDraft] = useState('')
  const [questBubble, setQuestBubble] = useState('Send me on a quest!')
  const [questMood, setQuestMood] = useState<QuestMood>('idle')
  const [questBusy, setQuestBusy] = useState(false)
  const [activeQuestPrompt, setActiveQuestPrompt] = useState('')
  const [questError, setQuestError] = useState('')
  const [questLogVisible, setQuestLogVisible] = useState(() => readQuestLogVisible())
  const [questLogEntries, setQuestLogEntries] = useState<QuestLogEntry[]>([])
  const [mobileQuestActivity, setMobileQuestActivity] = useState<MobileQuestActivity | null>(null)
  const [mobileQuestClock, setMobileQuestClock] = useState(() => Date.now())
  const [avatarSpeaking, setAvatarSpeaking] = useState(false)
  const didInitRef = useRef(false)
  const catalogRequestRef = useRef(0)
  const catalogCacheRef = useRef<Map<string, CatalogCacheEntry>>(new Map())
  const dragPayloadRef = useRef<DragPayload>(null)
  const avatarSpeakingTimeoutRef = useRef<number | null>(null)
  const questBubbleIntervalRef = useRef<number | null>(null)
  const questInputRef = useRef<HTMLTextAreaElement | null>(null)
  const questBubbleValueRef = useRef('Send me on a quest!')
  const questBubbleUpdatedAtRef = useRef(0)
  const questProgressContextRef = useRef<{
    agentClass: AgentClass
    agentRace: AgentRace
    connectionMode: ConnectionMode
    prompt: string
    busy: boolean
    gatewayUrl: string
    mobileShell: boolean
  }>({
    agentClass: 'ranger',
    agentRace: 'human',
    connectionMode: 'local',
    prompt: '',
    busy: false,
    gatewayUrl: '',
    mobileShell: false,
  })
  const questLogIdRef = useRef(0)
  const questProgressStagesSeenRef = useRef<Set<string>>(new Set())
  const mobileQuestLastFingerprintRef = useRef<string | null>(null)
  const mobileQuestWatchUntilRef = useRef(0)
  const mobileQuestPollInFlightRef = useRef(false)
  const toolsPaneScrollFrameRef = useRef<number | null>(null)
  const shellViewportRef = useRef<HTMLElement | null>(null)
  const mobileDemoModeRef = useRef(mobileDemoMode)
  const demoInstalledRef = useRef(demoInstalled)
  const soundRefs = useRef<Partial<Record<UiSound, HTMLAudioElement>>>({})
  const backgroundMusicRefs = useRef<Record<BackgroundMusicKind, HTMLAudioElement | null>>({
    main: null,
    shop: null,
  })
  const activeBackgroundMusicKindRef = useRef<BackgroundMusicKind>('main')
  const audioMutedRef = useRef(audioMuted)
  const shopVisibleRef = useRef(false)

  const state = managerState ?? EMPTY_STATE
  const activeConnectionMode = appliedConfig?.connectionMode ?? draftConfig.connectionMode
  const previewOnlyMode = !runtime || (isMobileShell && (mobileDemoMode || activeConnectionMode !== 'remote'))
  const questPreviewOnlyMode = !runtime || (isMobileShell && activeConnectionMode !== 'remote')
  const appliedDraft = draftFromConfig(appliedConfig)
  const mobileGatewaySaved = hasGatewayWizardConfig(appliedDraft)
  const mobileGatewayReady = mobileGatewaySaved && !mobileDemoMode
  const mobileSetupSatisfied = mobileGatewaySaved || mobileDemoMode
  const liveMobileRemoteQuests = runtime && isMobileShell && activeConnectionMode === 'remote'
  const shopVisible = isMobileShell ? mobileShopOpen : desktopShopOpen
  const featureDemoMode = !runtime && !isMobileShell && isFeatureDemoMode()
  const installedSlugs = new Set(state.installed.map((skill) => skill.slug))
  const readySkills = state.installed.filter((skill) => skill.status === 'ready')
  const riskyCount = readySkills.filter((skill) => isRiskyStatus(skill.security.status)).length
  const derivedAgentClass = classifyAgentLoadout(state.installed)
  function formatRemoteErrorMessage(
    detail: string,
    gatewayUrl: string | undefined,
    action: GatewayFailureAction,
  ) {
    return isMobileShell
      ? formatAndroidGatewayConnectionErrorMessage(detail, gatewayUrl, action)
      : formatGatewayConnectionErrorMessage(detail, gatewayUrl, action)
  }
  const displayedAgentClass = derivedAgentClass
  const displayedAgentRace = agentRace
  const classTheme = CLASS_THEMES[displayedAgentClass]
  const ClassIcon = classTheme.icon
  const adventurerName = state.agentName?.trim() || 'Adventurer'
  const gearLoadout = resolveGearLoadout(state.installed, slotPreferences)
  const equippedCount = SLOT_ORDER.filter((slot) => gearLoadout.bySlot[slot]).length
  const progress = deriveAdventurerProgress(questsCompleted)
  const partyMembers = buildPartyAdventurers(cronJobs, {
    agentClass: displayedAgentClass,
    agentRace: displayedAgentRace,
  })
  const activePartyCount = partyMembers.filter((member) => member.job.enabled).length
  const questingPartyCount = partyMembers.filter((member) => member.job.state?.runningAtMs).length
  const troubledPartyCount = partyMembers.filter((member) => member.statusTone === 'danger').length
  const installedKey = state.installed
    .map((skill) => `${skill.slug}:${skill.path}`)
    .sort()
    .join('|')
  const busy =
    loadingState ||
    loadingCatalog ||
    loadingParty ||
    Boolean(workingSlug) ||
    Boolean(removingPath) ||
    questBusy
  const avatarMotion: AvatarMotion = questBusy ? 'walking' : avatarSpeaking ? 'talking' : 'idle'
  const noticeLines = notice
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  useEffect(() => {
    if (didInitRef.current) {
      return
    }

    didInitRef.current = true
    cleanupLegacyClientState()

    void (async () => {
      try {
        await Promise.all([refreshState(undefined), refreshPartyRoster()])
      } finally {
        setBooted(true)
      }
    })()
  }, [])

  useEffect(() => {
    if (!booted) {
      return
    }

    if (!shopVisible) {
      setLoadingCatalog(false)
      setCatalogIssue('')
      setCatalogCooldownUntil(null)
      return
    }

    const timeoutId = window.setTimeout(() => {
      void refreshCatalog(appliedConfig, searchText, sort)
    }, CATALOG_SEARCH_DEBOUNCE_MS)

    return () => window.clearTimeout(timeoutId)
  }, [appliedConfig, booted, searchText, shopVisible, sort])

  useEffect(() => {
    if (!booted || !shopVisible || catalogCooldownUntil === null) {
      return
    }

    const remainingMs = catalogCooldownUntil - Date.now()
    if (remainingMs <= 0) {
      setCatalogCooldownUntil(null)
      void refreshCatalog(appliedConfig, searchText, sort, { force: true })
      return
    }

    const timeoutId = window.setTimeout(() => {
      setCatalogCooldownUntil(null)
      void refreshCatalog(appliedConfig, searchText, sort, { force: true })
    }, remainingMs)

    return () => window.clearTimeout(timeoutId)
  }, [appliedConfig, booted, catalogCooldownUntil, searchText, shopVisible, sort])

  useEffect(() => {
    writeSlotPreferences(slotPreferences)
  }, [slotPreferences])

  useEffect(() => {
    audioMutedRef.current = audioMuted
    writeAudioMuted(audioMuted)

    if (audioMuted) {
      pauseBackgroundMusic()
      return
    }

    startBackgroundMusic()
  }, [audioMuted])

  useEffect(() => {
    shopVisibleRef.current = shopVisible
    syncBackgroundMusic()
  }, [shopVisible])

  useEffect(() => {
    mobileDemoModeRef.current = mobileDemoMode
    writeMobileDemoMode(mobileDemoMode)
  }, [mobileDemoMode])

  useEffect(() => {
    demoInstalledRef.current = demoInstalled
  }, [demoInstalled])

  useEffect(() => {
    writeQuestLogVisible(questLogVisible)
  }, [questLogVisible])

  useEffect(() => {
    questBubbleValueRef.current = questBubble
    questBubbleUpdatedAtRef.current = Date.now()
  }, [questBubble])

  useEffect(() => {
    resizeQuestComposer(questInputRef.current)
  }, [questDraft])

  useEffect(() => {
    const updateMobileShell = () => {
      const nextMobileShell = detectMobileShell()
      setIsMobileShell(nextMobileShell)
      if (nextMobileShell) {
        setIsDocked(true)
      }
    }

    updateMobileShell()
    window.addEventListener('resize', updateMobileShell)

    return () => {
      window.removeEventListener('resize', updateMobileShell)
    }
  }, [])

  useEffect(() => {
    if (!isMobileShell) {
      setMobileShopOpen(false)
      setMobileSetupOpen(false)
      setMobileSetupDismissed(false)
      return
    }

    setIsDocked(true)
    setToolsOpen(false)
    setSettingsOpen(false)
  }, [isMobileShell])

  useEffect(() => {
    if (!isMobileShell) {
      return
    }

    if (mobileSetupSatisfied) {
      setMobileSetupDismissed(false)
      return
    }

    if (!mobileSetupDismissed) {
      setMobileSetupOpen(true)
    }
  }, [isMobileShell, mobileSetupDismissed, mobileSetupSatisfied])

  useEffect(() => {
    questProgressContextRef.current = {
      agentClass: displayedAgentClass,
      agentRace: displayedAgentRace,
      connectionMode: activeConnectionMode,
      prompt: activeQuestPrompt,
      busy: questBusy,
      gatewayUrl: appliedConfig?.gatewayUrl ?? draftConfig.gatewayUrl,
      mobileShell: isMobileShell,
    }
  }, [
    activeConnectionMode,
    activeQuestPrompt,
    appliedConfig?.gatewayUrl,
    displayedAgentClass,
    displayedAgentRace,
    draftConfig.gatewayUrl,
    isMobileShell,
    questBusy,
  ])

  useEffect(() => {
    if (!runtime) {
      return
    }

    let disposed = false
    let unlisten: (() => void) | null = null

    void listenForQuestProgress((progressEvent) => {
      const context = questProgressContextRef.current
      if (!context.busy) {
        return
      }

      if (!questProgressStagesSeenRef.current.has(progressEvent.stage)) {
        const nextLogEntry = formatQuestProgressEventLog(
          progressEvent,
          context.connectionMode,
          context.gatewayUrl,
          context.mobileShell,
        )
        if (nextLogEntry) {
          questProgressStagesSeenRef.current.add(progressEvent.stage)
          appendQuestLogEntries([nextLogEntry])
        }
      }

      if (!shouldSurfaceQuestProgressStage(progressEvent.stage)) {
        return
      }

      if (
        shouldThrottleQuestProgressStage(progressEvent.stage) &&
        Date.now() - questBubbleUpdatedAtRef.current < QUEST_PROGRESS_EVENT_MIN_MS
      ) {
        return
      }

      const nextBubble = formatQuestProgressEventBubble(
        progressEvent,
        context.prompt,
        context.agentClass,
        context.agentRace,
        context.connectionMode,
      )
      if (nextBubble && nextBubble !== questBubbleValueRef.current) {
        setQuestBubble(nextBubble)
      }
    })
      .then((cleanup) => {
        if (disposed) {
          cleanup()
          return
        }
        unlisten = cleanup
      })
      .catch(() => {})

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [runtime])

  function createQuestLogEntry(entry: Omit<QuestLogEntry, 'id' | 'timestamp'>): QuestLogEntry {
    questLogIdRef.current += 1
    return {
      ...entry,
      id: questLogIdRef.current,
      timestamp: Date.now(),
    }
  }

  function appendQuestLogEntries(entries: Array<Omit<QuestLogEntry, 'id' | 'timestamp'>>) {
    if (entries.length === 0) {
      return
    }

    setQuestLogEntries((current) => [...current, ...entries.map((entry) => createQuestLogEntry(entry))].slice(-12))
  }

  function resetQuestLog(entries: Array<Omit<QuestLogEntry, 'id' | 'timestamp'>> = []) {
    questProgressStagesSeenRef.current = new Set()
    setQuestLogEntries(entries.map((entry) => createQuestLogEntry(entry)))
  }

  async function sendQuestCompleteNotification(reply: string) {
    if (!runtime || !isMobileShell || document.visibilityState === 'visible') {
      return
    }

    try {
      const { isPermissionGranted, requestPermission, sendNotification } = await import(
        '@tauri-apps/plugin-notification'
      )
      let granted = await isPermissionGranted()
      if (!granted) {
        granted = (await requestPermission()) === 'granted'
      }
      if (!granted) {
        return
      }

      const body =
        summarizeQuestTextForLog(reply, 140) || 'I have completed my quest and returned with news.'
      await Promise.resolve(
        sendNotification({
          title: 'Quest complete',
          body,
        }),
      )
    } catch {
      // Notification support is best-effort on mobile shells.
    }
  }

  function handleMobileQuestActivityUpdate(update: QuestSessionUpdate) {
    const nextSummary =
      update.summary?.trim() ||
      synthesizeMobileQuestActivitySummary(update.status, update.displayName || adventurerName, update.waitingForApproval)
    if (!nextSummary) {
      return
    }

    setMobileQuestActivity((current) => ({
      prompt: current?.prompt || activeQuestPrompt.trim() || questDraft.trim() || 'Current quest',
      startedAt: current?.startedAt ?? Date.now(),
      updatedAt: Date.now(),
      summary: nextSummary,
      statusLabel: formatMobileQuestActivityStatus(update.status, update.waitingForApproval),
      runtimeMs: update.runtimeMs ?? current?.runtimeMs ?? null,
      waitingForApproval: Boolean(update.waitingForApproval),
    }))
  }

  function handleMobileQuestSessionUpdate(update: QuestSessionUpdate) {
    const replyNotice = formatQuestReplyForNotice(update.reply ?? '', displayedAgentClass, displayedAgentRace)
    setQuestError('')
    setQuestMood('returned')
    setQuestBubble(returnedBubbleForReply(update.reply ?? '', displayedAgentClass, displayedAgentRace))
    setNotice(formatQuestCompletionNotice(replyNotice, displayedAgentClass, displayedAgentRace))
    mobileQuestWatchUntilRef.current = 0
    setMobileQuestActivity(null)
    triggerAvatarSpeaking()
    playUiSound('goodNews')
    appendQuestLogEntries([
      {
        tone: 'clean',
        title: 'Quest update arrived',
        detail: summarizeQuestTextForLog(replyNotice, 220),
      },
    ])
    void sendQuestCompleteNotification(replyNotice)
  }

  useEffect(() => {
    if (!runtime || !isMobileShell || activeConnectionMode !== 'remote' || !appliedConfig?.gatewayUrl) {
      mobileQuestLastFingerprintRef.current = null
      mobileQuestWatchUntilRef.current = 0
      mobileQuestPollInFlightRef.current = false
      setMobileQuestActivity(null)
      return
    }

    let cancelled = false

    const pollForMobileQuestUpdate = async () => {
      if (cancelled || questBusy || mobileQuestPollInFlightRef.current) {
        return
      }

      const baselineFingerprint = mobileQuestLastFingerprintRef.current?.trim() || ''
      if (!baselineFingerprint) {
        return
      }

      if (Date.now() >= mobileQuestWatchUntilRef.current) {
        mobileQuestWatchUntilRef.current = 0
        setMobileQuestActivity(null)
        return
      }

      mobileQuestPollInFlightRef.current = true

      try {
        const nextUpdate = await pollRemoteGatewaySessionUpdate(
          appliedConfig,
          baselineFingerprint,
        )
        if (cancelled || !nextUpdate) {
          return
        }

        const nextFingerprint = nextUpdate.messageFingerprint?.trim() || null
        const previousFingerprint = mobileQuestLastFingerprintRef.current?.trim() || null
        if (nextFingerprint) {
          mobileQuestLastFingerprintRef.current = nextFingerprint
        }
        if (nextUpdate.summary || nextUpdate.status || nextUpdate.waitingForApproval) {
          handleMobileQuestActivityUpdate(nextUpdate)
        }
        if (!nextUpdate.reply?.trim()) {
          return
        }
        if (!previousFingerprint || nextFingerprint === previousFingerprint) {
          return
        }

        handleMobileQuestSessionUpdate(nextUpdate)
      } catch {
        // Quiet mobile polling should not interrupt the shell when the gateway blips.
      } finally {
        mobileQuestPollInFlightRef.current = false
      }
    }

    void pollForMobileQuestUpdate()
    const intervalId = window.setInterval(() => {
      void pollForMobileQuestUpdate()
    }, MOBILE_QUEST_SESSION_POLL_MS)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void pollForMobileQuestUpdate()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cancelled = true
      mobileQuestPollInFlightRef.current = false
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [
    activeConnectionMode,
    appliedConfig,
    displayedAgentClass,
    isMobileShell,
    questBusy,
    runtime,
  ])

  useEffect(() => {
    if (!mobileQuestActivity) {
      return
    }

    setMobileQuestClock(Date.now())
    const intervalId = window.setInterval(() => {
      setMobileQuestClock(Date.now())
    }, 1000)
    return () => window.clearInterval(intervalId)
  }, [mobileQuestActivity])

  useEffect(() => {
    if (questBubbleIntervalRef.current !== null) {
      window.clearInterval(questBubbleIntervalRef.current)
      questBubbleIntervalRef.current = null
    }

    if (!questBusy) {
      return
    }

    const progressBubbles = buildQuestProgressBubbles(
      activeQuestPrompt,
      displayedAgentClass,
      displayedAgentRace,
      activeConnectionMode,
    )
    if (progressBubbles.length <= 1) {
      return
    }

    let index = 1
    questBubbleIntervalRef.current = window.setInterval(() => {
      if (
        Date.now() - questBubbleUpdatedAtRef.current <
        QUEST_BUBBLE_PROGRESS_MS - QUEST_BUBBLE_ROTATION_GUARD_MS
      ) {
        return
      }

      const nextBubble = progressBubbles[index % progressBubbles.length] ?? progressBubbles[0] ?? 'I press on.'
      if (nextBubble !== questBubbleValueRef.current) {
        setQuestBubble(nextBubble)
      }
      index += 1
    }, QUEST_BUBBLE_PROGRESS_MS)

    return () => {
      if (questBubbleIntervalRef.current !== null) {
        window.clearInterval(questBubbleIntervalRef.current)
        questBubbleIntervalRef.current = null
      }
    }
  }, [activeConnectionMode, activeQuestPrompt, displayedAgentClass, displayedAgentRace, questBusy])

  useEffect(() => {
    const loaded: Partial<Record<UiSound, HTMLAudioElement>> = {}
    for (const [name, url] of Object.entries(UI_SOUND_URLS) as [UiSound, string][]) {
      const audio = new Audio(url)
      audio.preload = 'auto'
      audio.volume = name === 'questSend' ? 0.72 : 0.66
      loaded[name] = audio
    }
    soundRefs.current = loaded

    return () => {
      for (const audio of Object.values(loaded)) {
        if (audio) {
          audio.pause()
          audio.src = ''
        }
      }
      soundRefs.current = {}
    }
  }, [])

  useEffect(() => {
    const mainAudio = new Audio(MAIN_BACKGROUND_MUSIC_URL)
    mainAudio.preload = 'auto'
    mainAudio.loop = true
    tuneBackgroundMusic(mainAudio, MAIN_BACKGROUND_MUSIC_VOLUME, MAIN_BACKGROUND_MUSIC_PLAYBACK_RATE)

    const shopAudio = new Audio(SHOP_BACKGROUND_MUSIC_URL)
    shopAudio.preload = 'auto'
    shopAudio.loop = true
    tuneBackgroundMusic(shopAudio, SHOP_BACKGROUND_MUSIC_VOLUME, SHOP_BACKGROUND_MUSIC_PLAYBACK_RATE)

    backgroundMusicRefs.current = {
      main: mainAudio,
      shop: shopAudio,
    }

    const handleUserActivation = () => {
      if (audioMutedRef.current) {
        return
      }

      startBackgroundMusic()
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        pauseBackgroundMusic()
        return
      }

      if (!audioMutedRef.current) {
        startBackgroundMusic()
      }
    }

    window.addEventListener('pointerdown', handleUserActivation, { passive: true })
    window.addEventListener('keydown', handleUserActivation)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    if (!audioMutedRef.current && !document.hidden) {
      startBackgroundMusic()
    }

    return () => {
      window.removeEventListener('pointerdown', handleUserActivation)
      window.removeEventListener('keydown', handleUserActivation)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      for (const audio of Object.values(backgroundMusicRefs.current)) {
        if (!audio) {
          continue
        }

        audio.pause()
        audio.src = ''
      }
      backgroundMusicRefs.current = {
        main: null,
        shop: null,
      }
    }
  }, [])

  useEffect(() => {
    return () => {
      if (avatarSpeakingTimeoutRef.current !== null) {
        window.clearTimeout(avatarSpeakingTimeoutRef.current)
      }

      if (toolsPaneScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(toolsPaneScrollFrameRef.current)
      }
    }
  }, [])

  useEffect(() => {
    writeStoredConnectionSettings(draftConfig)
  }, [
    draftConfig.connectionMode,
    draftConfig.gatewayUrl,
    draftConfig.gatewayToken,
    draftConfig.dockerContainer,
    draftConfig.dockerCommand,
    draftConfig.dockerWorkdir,
  ])

  useEffect(() => {
    if (!booted) {
      return
    }

    setSlotPreferences((current) => seedSlotPreferences(state.installed, current))
  }, [booted, installedKey])

  useEffect(() => {
    if (!manualDrag) {
      return
    }

    const handleMove = (event: PointerEvent) => {
      setManualDrag((current) =>
        current
          ? {
              ...current,
              x: event.clientX,
              y: event.clientY,
            }
          : current,
      )
      updateManualHover(event.clientX, event.clientY, manualDrag.payload)
    }

    const handleUp = (event: PointerEvent) => {
      const target = resolveDropTargetAtPoint(event.clientX, event.clientY, manualDrag.payload)
      setManualDrag(null)
      void completeManualDrop(target, manualDrag.payload)
    }

    const handleCancel = () => {
      clearDragState()
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleCancel)
    document.body.classList.add('skill-dragging')

    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleCancel)
      document.body.classList.remove('skill-dragging')
    }
  }, [manualDrag])

  function playUiSound(sound: UiSound) {
    if (audioMuted) {
      return
    }

    const template = soundRefs.current[sound]
    if (!template) {
      return
    }

    try {
      const audio = template.cloneNode(true) as HTMLAudioElement
      audio.volume = template.volume
      void audio.play().catch(() => {})
    } catch {
      // Ignore audio failures so the UI keeps moving.
    }
  }

  function startBackgroundMusic() {
    if (audioMutedRef.current || document.hidden) {
      return
    }

    syncBackgroundMusic()
  }

  function pauseBackgroundMusic() {
    for (const audio of Object.values(backgroundMusicRefs.current)) {
      audio?.pause()
    }
  }

  function syncBackgroundMusic() {
    const nextKind: BackgroundMusicKind = shopVisibleRef.current ? 'shop' : 'main'
    const nextAudio = backgroundMusicRefs.current[nextKind]
    const otherAudio = backgroundMusicRefs.current[nextKind === 'main' ? 'shop' : 'main']
    const kindChanged = activeBackgroundMusicKindRef.current !== nextKind
    activeBackgroundMusicKindRef.current = nextKind

    otherAudio?.pause()

    if (!nextAudio) {
      return
    }

    tuneBackgroundMusic(
      nextAudio,
      nextKind === 'shop' ? SHOP_BACKGROUND_MUSIC_VOLUME : MAIN_BACKGROUND_MUSIC_VOLUME,
      nextKind === 'shop' ? SHOP_BACKGROUND_MUSIC_PLAYBACK_RATE : MAIN_BACKGROUND_MUSIC_PLAYBACK_RATE,
    )

    if (kindChanged) {
      try {
        nextAudio.currentTime = 0
      } catch {
        // Ignore seek failures and just start from the current position.
      }
    }

    if (audioMutedRef.current || document.hidden) {
      return
    }

    if (!nextAudio.paused && !kindChanged) {
      return
    }

    if (!nextAudio.paused) {
      nextAudio.pause()
    }

    void nextAudio.play().catch(() => {})
  }

  function queueShellScrollToTop() {
    if (toolsPaneScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(toolsPaneScrollFrameRef.current)
    }

    toolsPaneScrollFrameRef.current = window.requestAnimationFrame(() => {
      toolsPaneScrollFrameRef.current = window.requestAnimationFrame(() => {
        toolsPaneScrollFrameRef.current = null
        shellViewportRef.current?.scrollTo({
          top: 0,
          left: 0,
          behavior: 'auto',
        })
      })
    })
  }

  function queueShellScrollToBottom() {
    if (toolsPaneScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(toolsPaneScrollFrameRef.current)
    }

    toolsPaneScrollFrameRef.current = window.requestAnimationFrame(() => {
      toolsPaneScrollFrameRef.current = window.requestAnimationFrame(() => {
        toolsPaneScrollFrameRef.current = null
        const viewport = shellViewportRef.current
        if (!viewport) {
          return
        }

        viewport.scrollTo({
          top: viewport.scrollHeight,
          left: 0,
          behavior: 'auto',
        })
      })
    })
  }

  function handleToggleToolsPane() {
    setToolsOpen((current) => {
      const next = !current
      if (current && !next) {
        queueShellScrollToTop()
      } else if (!current && next) {
        queueShellScrollToBottom()
      }
      return next
    })
  }

  async function refreshPartyRoster() {
    setLoadingParty(true)

    try {
      if (previewOnlyMode) {
        setCronJobs(featureDemoMode || mobileDemoModeRef.current ? FEATURE_DEMO_CRON_JOBS : [])
        setPartyError('')
        return
      }

      const nextJobs = await loadOpenClawCronJobs()
      setCronJobs(nextJobs)
      setPartyError('')
    } catch (caughtError) {
      setCronJobs([])
      setPartyError(normalizeCommandError(caughtError))
    } finally {
      setLoadingParty(false)
    }
  }

  async function refreshState(nextConfig?: ManagerConfig): Promise<RefreshStateResult> {
    setLoadingState(true)
    setError('')

    try {
      if (previewOnlyMode) {
        const previewInstalled = featureDemoMode || mobileDemoModeRef.current ? demoInstalledRef.current : []
        const nextState = buildPreviewManagerState(nextConfig, previewInstalled)
        const nextDraft = mergeDraftWithState(nextState, nextConfig ? draftFromConfig(nextConfig) : draftConfig)
        setManagerState(nextState)
        setDraftConfig(nextDraft)
        setAppliedConfig(configFromDraft(nextDraft))
        return { state: nextState, errorMessage: null }
      }

      const nextState = await loadManagerState(nextConfig)
      const nextDraft = mergeDraftWithState(nextState, nextConfig ? draftFromConfig(nextConfig) : draftConfig)
      setManagerState(nextState)
      setDraftConfig(nextDraft)
      setAppliedConfig(configFromDraft(nextDraft))
      return { state: nextState, errorMessage: null }
    } catch (caughtError) {
      const rawMessage = normalizeCommandError(caughtError)
      const connectionMode = nextConfig?.connectionMode ?? draftConfig.connectionMode
      const errorMessage =
        connectionMode === 'remote'
          ? formatRemoteErrorMessage(
              rawMessage,
              nextConfig?.gatewayUrl ?? draftConfig.gatewayUrl,
              'refresh',
            )
          : rawMessage

      setError(errorMessage)
      return { state: null, errorMessage }
    } finally {
      setLoadingState(false)
    }
  }

  async function refreshCatalog(
    nextConfig: ManagerConfig | undefined,
    query: string,
    nextSort: BrowseSort,
    options: { force?: boolean } = {},
  ) {
    const requestId = ++catalogRequestRef.current
    const trimmedQuery = query.trim()
    const cooldownRemainingMs = catalogCooldownUntil === null ? 0 : catalogCooldownUntil - Date.now()

    if (cooldownRemainingMs > 0) {
      if (requestId === catalogRequestRef.current) {
        setCatalogIssue(formatCatalogRateLimitMessage(cooldownRemainingMs, trimmedQuery))
        setError((current) => (parseCatalogRateLimit(current) ? '' : current))
        setLoadingCatalog(false)
      }
      return
    }

    const cacheKey = buildCatalogCacheKey(nextConfig, trimmedQuery, nextSort)
    if (!options.force) {
      const cachedItems = readCatalogCache(catalogCacheRef.current, cacheKey)
      if (cachedItems) {
        if (requestId === catalogRequestRef.current) {
          setCatalog(cachedItems)
          setCatalogIssue('')
          setCatalogCooldownUntil(null)
          setError((current) => (parseCatalogRateLimit(current) ? '' : current))
          setLoadingCatalog(false)
        }
        return
      }
    }

    setLoadingCatalog(true)

    try {
      if (!runtime || (isMobileShell && mobileDemoModeRef.current)) {
        if (requestId === catalogRequestRef.current) {
          setCatalog(featureDemoMode || mobileDemoModeRef.current ? buildFeatureDemoCatalog(trimmedQuery, nextSort) : [])
          setCatalogIssue('')
          setCatalogCooldownUntil(null)
          setError((current) => (parseCatalogRateLimit(current) ? '' : current))
        }
        return
      }

      const nextItems = trimmedQuery
        ? await searchRegistrySkills(nextConfig, trimmedQuery)
        : await browseRegistrySkills(nextConfig, nextSort)

      if (requestId === catalogRequestRef.current) {
        writeCatalogCache(catalogCacheRef.current, cacheKey, nextItems)
        setCatalog(nextItems)
        setCatalogIssue('')
        setCatalogCooldownUntil(null)
        setError((current) => (parseCatalogRateLimit(current) ? '' : current))
      }
    } catch (caughtError) {
      if (requestId === catalogRequestRef.current) {
        const message = normalizeCommandError(caughtError)
        const rateLimit = parseCatalogRateLimit(message)

        if (rateLimit) {
          const cooldownMs = rateLimit.retryAfterMs
          setCatalogCooldownUntil(Date.now() + cooldownMs)
          setCatalogIssue(formatCatalogRateLimitMessage(cooldownMs, trimmedQuery))
          setError((current) => (parseCatalogRateLimit(current) ? '' : current))
        } else {
          setCatalogIssue(message)
          setCatalogCooldownUntil(null)
          setError((current) => (parseCatalogRateLimit(current) ? '' : current))
        }
      }
    } finally {
      if (requestId === catalogRequestRef.current) {
        setLoadingCatalog(false)
      }
    }
  }

  async function applyDraft(nextDraft: DraftConfig, successMessage: string) {
    setDraftConfig(nextDraft)
    const { state: nextState, errorMessage } = await refreshState(configFromDraft(nextDraft))
    if (nextState) {
      playUiSound('blip')
      setNotice(successMessage)
      return { applied: true, errorMessage: null }
    }

    return { applied: false, errorMessage }
  }

  async function handleRefresh() {
    const nextConfig = appliedConfig ?? configFromDraft(draftConfig)
    if (isMobileShell && nextConfig?.connectionMode === 'remote') {
      const gatewayDraftIssue = validateGatewayDraftInput(
        {
          gatewayUrl: nextConfig.gatewayUrl ?? draftConfig.gatewayUrl,
          gatewayToken: nextConfig.gatewayToken ?? draftConfig.gatewayToken,
        },
        {
          allowInsecureToken: true,
        },
      )
      if (gatewayDraftIssue) {
        setError(gatewayDraftIssue)
        return
      }
    }

    const [{ state: nextState }] = await Promise.all([refreshState(nextConfig), refreshPartyRoster()])
    await refreshCatalog(nextConfig, searchText, sort, { force: true })

    if (nextState) {
      playUiSound('blip')
      setNotice('Refreshed.')
    }
  }

  async function handleCloseWindow() {
    if (!runtime) {
      setNotice('Exit button works in the desktop build.')
      return
    }

    try {
      await closeDesktopWindow()
    } catch (error) {
      setError(normalizeCommandError(error))
    }
  }

  function handleToggleDockedMode() {
    if (isMobileShell) {
      setNotice('Mobile build keeps the docked layout as the default shell.')
      return
    }

    const nextDocked = !isDocked
    setIsDocked(nextDocked)
    setSettingsOpen(false)
    setNotice(nextDocked ? 'Compact layout enabled.' : 'Full layout restored.')

    if (runtime) {
      void setDesktopWindowDocked(nextDocked).catch((caughtError) => {
        setError(normalizeCommandError(caughtError))
      })
    }
  }

  function handleToggleSettings() {
    setSettingsOpen((current) => !current)
  }

  function handleResetLevel() {
    const nextRace = rerollAgentRace(agentRace)
    setQuestsCompleted(0)
    setAgentRace(nextRace)
    writeQuestProgress(0)
    setSettingsOpen(false)
    playUiSound('blip')
    setNotice(`Character progress reset to Lv. 1. New race: ${RACE_LABELS[nextRace]}.`)
  }

  function handleToggleAudioMuted() {
    const next = !audioMuted
    setAudioMuted(next)
    setNotice(next ? 'Audio muted.' : 'Audio unmuted.')

    if (next) {
      pauseBackgroundMusic()
    } else {
      audioMutedRef.current = false
      startBackgroundMusic()
    }

    setSettingsOpen(false)
  }

  function handleToggleQuestLog() {
    setQuestLogVisible((current) => !current)
    setSettingsOpen(false)
  }

  async function handleCenterWindow() {
    setSettingsOpen(false)

    if (!runtime) {
      setNotice('Center window works in the desktop build.')
      return
    }

    try {
      await centerDesktopWindow()
      playUiSound('blip')
      setNotice('Window centered.')
    } catch (caughtError) {
      setError(normalizeCommandError(caughtError))
    }
  }

  function triggerAvatarSpeaking() {
    if (avatarSpeakingTimeoutRef.current !== null) {
      window.clearTimeout(avatarSpeakingTimeoutRef.current)
    }

    setAvatarSpeaking(true)
    avatarSpeakingTimeoutRef.current = window.setTimeout(() => {
      setAvatarSpeaking(false)
      avatarSpeakingTimeoutRef.current = null
    }, AVATAR_SPEAKING_MS)
  }

  function clearDragState() {
    dragPayloadRef.current = null
    setManualDrag(null)
    setDragPayload(null)
    setDropZone(null)
    setHoveredGearSlot(null)
  }

  function openMobileSetup(step = 0) {
    setMobileSetupError('')
    setMobileSetupStep(step)
    setMobileSetupDismissed(false)
    setMobileSetupOpen(true)
    setMobileShopOpen(false)
  }

  function handleDismissMobileSetup() {
    setMobileSetupDismissed(true)
    setMobileSetupOpen(false)
    setMobileSetupError('')
  }

  async function finalizeMobileGatewaySetup(nextDraft: DraftConfig, successMessage: string) {
    setMobileSetupWorking(true)
    setMobileSetupError('')
    mobileDemoModeRef.current = false
    setMobileDemoMode(false)

    try {
      const { applied, errorMessage } = await applyDraft(nextDraft, successMessage)
      if (!applied) {
        setMobileSetupError(
          errorMessage ??
            formatRemoteErrorMessage(
              'The gateway profile could not be saved yet.',
              nextDraft.gatewayUrl,
              'link',
            ),
        )
        return false
      }

      setMobileSetupOpen(false)
      setMobileSetupDismissed(false)
      setMobileSetupStep(0)
      return true
    } finally {
      setMobileSetupWorking(false)
    }
  }

  function handleEnableMobileDemo() {
    const seededDemoInstalled =
      demoInstalledRef.current.length > 0 ? demoInstalledRef.current : buildFeatureDemoInstalledSkills()
    demoInstalledRef.current = seededDemoInstalled
    setDemoInstalled(seededDemoInstalled)

    mobileDemoModeRef.current = true
    setMobileDemoMode(true)

    const nextDraft: DraftConfig = {
      ...draftConfig,
      connectionMode: 'local',
    }
    const nextState = buildPreviewManagerState(configFromDraft(nextDraft), seededDemoInstalled)
    const mergedDraft = mergeDraftWithState(nextState, nextDraft)
    setManagerState(nextState)
    setDraftConfig(mergedDraft)
    setAppliedConfig(configFromDraft(mergedDraft))
    setError('')
    setMobileSetupError('')
    setMobileSetupOpen(false)
    setMobileSetupDismissed(false)
    setMobileSetupStep(0)
    playUiSound('blip')
    setNotice('Demo mode is ready. You can explore Claw Quest before linking a gateway.')
  }

  async function handleCompleteMobileSetup() {
    const gatewayDraftIssue = validateGatewayDraftInput(draftConfig, {
      allowInsecureToken: true,
    })
    if (gatewayDraftIssue) {
      setMobileSetupError(gatewayDraftIssue)
      setMobileSetupStep(1)
      return
    }

    const nextDraft = {
      ...draftConfig,
      connectionMode: 'remote' as const,
    }

    await finalizeMobileGatewaySetup(nextDraft, 'Gateway linked for the mobile shell.')
  }

  function beginManualDrag(
    event: ReactPointerEvent<HTMLElement>,
    payload: Exclude<DragPayload, null>,
  ) {
    if (event.button !== 0 || busy) {
      return
    }

    event.preventDefault()
    dragPayloadRef.current = payload
    setDragPayload(payload)
    setManualDrag({
      payload,
      x: event.clientX,
      y: event.clientY,
      offsetX: 34,
      offsetY: 34,
    })
    updateManualHover(event.clientX, event.clientY, payload)
  }

  async function handleQuestSubmit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    const prompt = questDraft.trim()
    const gatewayUrl = appliedConfig?.gatewayUrl ?? draftConfig.gatewayUrl

    if (!prompt) {
      setQuestError('Enter a quest prompt first.')
      return
    }

    setNotice('')
    const nextAttemptLog = buildQuestAttemptLogEntries(prompt, activeConnectionMode, gatewayUrl)

    if (isMobileShell) {
      const gatewayDraftIssue = validateGatewayDraftInput(draftConfig, {
        allowInsecureToken: true,
      })
      if (gatewayDraftIssue) {
        resetQuestLog([
          ...nextAttemptLog,
          {
            tone: 'danger',
            title: 'Quest blocked before launch',
            detail: gatewayDraftIssue,
          },
        ])
        setQuestError(gatewayDraftIssue)
        setQuestMood('error')
        setQuestBubble('The gate is not ready.')
        return
      }
    }

    resetQuestLog(nextAttemptLog)
    setQuestBusy(true)
    setActiveQuestPrompt(prompt)
    setQuestError('')
    setQuestMood('busy')
    setQuestBubble(questDepartureBubble(prompt, displayedAgentClass, displayedAgentRace, activeConnectionMode))
    questProgressContextRef.current = {
      agentClass: displayedAgentClass,
      agentRace: displayedAgentRace,
      connectionMode: activeConnectionMode,
      prompt,
      busy: true,
      gatewayUrl,
      mobileShell: isMobileShell,
    }
    setAvatarSpeaking(false)
    playUiSound('questSend')
    if (isMobileShell && activeConnectionMode === 'remote') {
      setMobileQuestActivity({
        prompt,
        startedAt: Date.now(),
        updatedAt: Date.now(),
        summary: `${adventurerName} has accepted the quest and is heading for the gateway.`,
        statusLabel: 'Quest underway',
        runtimeMs: null,
        waitingForApproval: false,
      })
    }

    try {
      if (questPreviewOnlyMode) {
        if (runtime && isMobileShell && !mobileDemoMode) {
          const unavailableMessage = formatMobileQuestUnavailableMessage(activeConnectionMode, gatewayUrl)
          appendQuestLogEntries([
            {
              tone: 'warning',
              title: 'Remote Gateway mode is required',
              detail: 'This phone only sends live quests through a linked Remote Gateway session.',
            },
            {
              tone: 'warning',
              title: 'Why no connection was tested',
              detail: formatMobileQuestUnavailableReason(activeConnectionMode),
            },
          ])
          setQuestError(unavailableMessage)
          setQuestBubble('Switch to Remote Gateway mode to continue the quest.')
          setQuestMood('error')
          setActiveQuestPrompt('')
          questProgressContextRef.current = {
            ...questProgressContextRef.current,
            busy: false,
            prompt: '',
          }
          triggerAvatarSpeaking()
          return
        }

        await new Promise((resolve) => window.setTimeout(resolve, MOBILE_PREVIEW_QUEST_DELAY_MS))
        const nextQuestCount = questsCompleted + 1
        const previousLevel = progress.level
        const nextProgress = deriveAdventurerProgress(nextQuestCount)
        const replyNotice =
          runtime && isMobileShell && mobileDemoMode
            ? 'I walked the demo road and returned with a practice report from the guild hall.'
            : isMobileShell
              ? 'Gateway profile saved. Switch to Remote Gateway mode to send live mobile quests.'
              : 'Quest preview only in browser mode.'

        setQuestsCompleted(nextQuestCount)
        writeQuestProgress(nextQuestCount)
        setQuestBubble(returnedBubbleForReply(replyNotice, displayedAgentClass, displayedAgentRace))
        setQuestMood('returned')
        setActiveQuestPrompt('')
        questProgressContextRef.current = {
          ...questProgressContextRef.current,
          busy: false,
          prompt: '',
        }
        triggerAvatarSpeaking()
        setQuestDraft('')
        playUiSound(nextProgress.level > previousLevel ? 'levelUp' : 'goodNews')
        setNotice(
          formatQuestCompletionNotice(
            replyNotice,
            displayedAgentClass,
            displayedAgentRace,
            nextProgress.level > previousLevel ? nextProgress.level : null,
          ),
        )
        appendQuestLogEntries([
          {
            tone: 'clean',
            title: runtime && isMobileShell && mobileDemoMode ? 'Demo quest completed' : 'Practice quest completed',
            detail: replyNotice,
          },
        ])
        return
      }

      const outcome = await sendOpenClawPrompt(appliedConfig, prompt)
      if (isMobileShell && activeConnectionMode === 'remote') {
        mobileQuestLastFingerprintRef.current = outcome.messageFingerprint?.trim() || null
        mobileQuestWatchUntilRef.current = mobileQuestLastFingerprintRef.current
          ? Date.now() + MOBILE_QUEST_SESSION_WATCH_MS
          : 0
        if (looksLikeQuestAcknowledgement(outcome.reply)) {
          setMobileQuestActivity((current) => ({
            prompt,
            startedAt: current?.startedAt ?? Date.now(),
            updatedAt: Date.now(),
            summary: `Last word from ${adventurerName}: ${summarizeQuestTextForLog(outcome.reply, 160)}`,
            statusLabel: 'Awaiting return',
            runtimeMs: current?.runtimeMs ?? null,
            waitingForApproval: false,
          }))
        } else {
          setMobileQuestActivity(null)
        }
      }
      const nextQuestCount = questsCompleted + 1
      const previousLevel = progress.level
      const nextProgress = deriveAdventurerProgress(nextQuestCount)
      const replyNotice = formatQuestReplyForNotice(outcome.reply, displayedAgentClass, displayedAgentRace)
      setQuestsCompleted(nextQuestCount)
      writeQuestProgress(nextQuestCount)
      setQuestBubble(returnedBubbleForReply(outcome.reply, displayedAgentClass, displayedAgentRace))
      setQuestMood('returned')
      setActiveQuestPrompt('')
      questProgressContextRef.current = {
        ...questProgressContextRef.current,
        busy: false,
        prompt: '',
      }
      triggerAvatarSpeaking()
      setQuestDraft('')
      playUiSound(nextProgress.level > previousLevel ? 'levelUp' : 'goodNews')
      setNotice(
        formatQuestCompletionNotice(
          replyNotice,
          displayedAgentClass,
          displayedAgentRace,
          nextProgress.level > previousLevel ? nextProgress.level : null,
        ),
      )
      appendQuestLogEntries([
        {
          tone: 'clean',
          title: 'OpenClaw replied',
          detail: summarizeQuestTextForLog(replyNotice, 220),
        },
      ])
    } catch (caughtError) {
      const rawError = normalizeCommandError(caughtError)
      const nextError =
        activeConnectionMode === 'remote'
          ? formatRemoteErrorMessage(
              rawError,
              appliedConfig?.gatewayUrl ?? draftConfig.gatewayUrl,
              'quest',
            )
          : rawError
      setQuestError(nextError)
      setQuestBubble(formatQuestErrorBubble(nextError, prompt, displayedAgentClass))
      setQuestMood('error')
      setActiveQuestPrompt('')
      mobileQuestWatchUntilRef.current = 0
      setMobileQuestActivity(null)
      appendQuestLogEntries(
        buildQuestFailureLogEntries({
          rawError,
          displayError: nextError,
          connectionMode: activeConnectionMode,
          gatewayUrl,
        }),
      )
      questProgressContextRef.current = {
        ...questProgressContextRef.current,
        busy: false,
        prompt: '',
      }
      triggerAvatarSpeaking()
    } finally {
      questProgressContextRef.current = {
        ...questProgressContextRef.current,
        busy: false,
      }
      setQuestBusy(false)
    }
  }

  function assignSkillToSlot(slug: string, slot: GearSlot) {
    setSlotPreferences((current) => {
      const next: SlotPreferenceMap = { ...current }

      for (const [entrySlug, entrySlot] of Object.entries(next)) {
        if (entrySlot === slot && entrySlug !== slug) {
          delete next[entrySlug]
        }
      }

      next[slug] = slot
      return next
    })
  }

  async function handleInstall(skill: RegistrySkill, preferredSlot?: GearSlot) {
    setError('')
    clearDragState()

    if (previewOnlyMode) {
      if (featureDemoMode || mobileDemoModeRef.current) {
        if (demoInstalled.some((entry) => entry.slug === skill.slug)) {
          setNotice(`${skill.displayName} is already installed.`)
          return
        }

        setMobileShopOpen(false)
        setWorkingSlug(skill.slug)

        try {
          await delay(520)
          const nextInstalled = [...demoInstalled, buildFeatureDemoInstalledSkill(skill, demoInstalled.length)]
          const nextState = buildPreviewManagerState(appliedConfig, nextInstalled)
          const nextDraft = mergeDraftWithState(nextState, draftConfig)
          setDemoInstalled(nextInstalled)
          setManagerState(nextState)
          setDraftConfig(nextDraft)
          setAppliedConfig(configFromDraft(nextDraft))

          if (preferredSlot) {
            assignSkillToSlot(skill.slug, preferredSlot)
          }

          playUiSound('coin')
          setNotice(`Installed ${skill.displayName}.`)
        } finally {
          setWorkingSlug(null)
        }

        return
      }

      setMobileShopOpen(false)
      setNotice(
        isMobileShell
          ? 'The loadout stays empty until a real OpenClaw workspace is connected.'
          : 'Connect OpenClaw to load real skills. Preview mode stays empty.',
      )
      return
    }

    setWorkingSlug(skill.slug)

    try {
      let outcome = await installRegistrySkill(appliedConfig, skill.slug, skill.version)

      if (outcome.requiresConfirmation) {
        const reason = outcome.confirmationReason ?? 'Registry scan flagged this skill.'
        const confirmed = window.confirm(`${reason}\n\nInstall anyway?`)
        if (!confirmed) {
          setNotice(`Skipped ${skill.slug}.`)
          return
        }

        outcome = await installRegistrySkill(appliedConfig, skill.slug, skill.version, true)
      }

      if (outcome.state) {
        const nextDraft = mergeDraftWithState(outcome.state, draftConfig)
        setManagerState(outcome.state)
        setDraftConfig(nextDraft)
        setAppliedConfig(configFromDraft(nextDraft))
      }

      if (preferredSlot) {
        assignSkillToSlot(skill.slug, preferredSlot)
      }

      playUiSound('coin')
      setNotice(outcome.notice)
    } catch (caughtError) {
      setError(normalizeCommandError(caughtError))
    } finally {
      setWorkingSlug(null)
    }
  }

  async function handleRemove(skill: InstalledSkill) {
    setError('')
    clearDragState()

    if (previewOnlyMode) {
      if (featureDemoMode || mobileDemoModeRef.current) {
        setRemovingPath(skill.path)

        try {
          await delay(320)
          const nextInstalled = demoInstalled.filter((entry) => entry.path !== skill.path)
          const nextState = buildPreviewManagerState(appliedConfig, nextInstalled)
          const nextDraft = mergeDraftWithState(nextState, draftConfig)
          setDemoInstalled(nextInstalled)
          setManagerState(nextState)
          setDraftConfig(nextDraft)
          setAppliedConfig(configFromDraft(nextDraft))
          playUiSound('blip')
          setNotice(`Removed ${skill.slug}.`)
        } finally {
          setRemovingPath(null)
        }

        return
      }

      setNotice('The preview loadout is empty until OpenClaw is connected.')
      return
    }

    setRemovingPath(skill.path)

    try {
      const outcome = await uninstallRegistrySkill(appliedConfig, skill.slug, skill.path)
      const nextDraft = mergeDraftWithState(outcome.state, draftConfig)
      setManagerState(outcome.state)
      setDraftConfig(nextDraft)
      setAppliedConfig(configFromDraft(nextDraft))
      playUiSound('blip')
      setNotice(outcome.notice)
    } catch (caughtError) {
      setError(normalizeCommandError(caughtError))
    } finally {
      setRemovingPath(null)
    }
  }

  function handleCatalogDragStart(event: DragEvent<HTMLElement>, skill: RegistrySkill) {
    const nextPayload: DragPayload = { kind: 'catalog', skill }
    event.dataTransfer.effectAllowed = 'copy'
    setTransferPayload(event, { kind: 'catalog', slug: skill.slug })
    dragPayloadRef.current = nextPayload
    setDragPayload(nextPayload)
  }

  function handleInstalledDragStart(event: DragEvent<HTMLElement>, skill: InstalledSkill) {
    const nextPayload: DragPayload = { kind: 'installed', skill }
    event.dataTransfer.effectAllowed = 'move'
    setTransferPayload(event, { kind: 'installed', path: skill.path, slug: skill.slug })
    dragPayloadRef.current = nextPayload
    setDragPayload(nextPayload)
  }

  function handleDragEnd() {
    clearDragState()
  }

  function resolveEventPayload(event: DragEvent<HTMLElement>): DragPayload {
    const activePayload = dragPayloadRef.current ?? dragPayload
    const transferred = readTransferPayload(event)
    if (transferred?.kind === 'catalog') {
      const skill =
        catalog.find((item) => item.slug === transferred.slug) ??
        (activePayload?.kind === 'catalog' && activePayload.skill.slug === transferred.slug ? activePayload.skill : null)

      return skill ? { kind: 'catalog', skill } : activePayload
    }

    if (transferred?.kind === 'installed') {
      const skill =
        state.installed.find((item) => item.path === transferred.path) ??
        state.installed.find((item) => item.slug === transferred.slug) ??
        (activePayload?.kind === 'installed' && activePayload.skill.path === transferred.path ? activePayload.skill : null)

      return skill ? { kind: 'installed', skill } : activePayload
    }

    return activePayload
  }

  function resolveLiveDragPayload(event: DragEvent<HTMLElement>) {
    return dragPayloadRef.current ?? dragPayload ?? resolveEventPayload(event)
  }

  function resolveDropTargetAtPoint(
    clientX: number,
    clientY: number,
    payload: Exclude<DragPayload, null>,
  ): DropTarget {
    const target = document.elementFromPoint(clientX, clientY) as HTMLElement | null
    if (!target) {
      return { kind: 'none' }
    }

    const slotTarget = target.closest<HTMLElement>('[data-gear-slot]')
    const slot = slotTarget?.dataset.gearSlot as GearSlot | undefined
    if (slot && SLOT_ORDER.includes(slot)) {
      return { kind: 'slot', slot }
    }

    if (payload.kind === 'installed' && target.closest('[data-drop-zone="trash"]')) {
      return { kind: 'trash' }
    }

    if (target.closest('[data-drop-zone="equip"]')) {
      return { kind: 'equip' }
    }

    return { kind: 'none' }
  }

  function updateManualHover(
    clientX: number,
    clientY: number,
    payload: Exclude<DragPayload, null>,
  ) {
    const target = resolveDropTargetAtPoint(clientX, clientY, payload)
    if (target.kind === 'slot') {
      setDropZone('equip')
      setHoveredGearSlot(target.slot)
      return
    }

    if (target.kind === 'equip') {
      setDropZone('equip')
      setHoveredGearSlot(null)
      return
    }

    if (target.kind === 'trash') {
      setDropZone('trash')
      setHoveredGearSlot(null)
      return
    }

    setDropZone(null)
    setHoveredGearSlot(null)
  }

  async function completeManualDrop(
    target: DropTarget,
    payload: Exclude<DragPayload, null>,
  ) {
    if (target.kind === 'slot') {
      if (payload.kind === 'catalog') {
        await handleInstall(payload.skill, target.slot)
        return
      }

      assignSkillToSlot(payload.skill.slug, target.slot)
      playUiSound('equip')
      setNotice(`Moved ${payload.skill.slug} to ${SLOT_LABELS[target.slot]}.`)
      clearDragState()
      return
    }

    if (target.kind === 'equip') {
      if (payload.kind === 'catalog') {
        await handleInstall(payload.skill, inferRegistryGearSlot(payload.skill))
        return
      }

      const slot = gearLoadout.byPath[payload.skill.path] ?? inferGearSlot(payload.skill)
      assignSkillToSlot(payload.skill.slug, slot)
      playUiSound('equip')
      setNotice(`${payload.skill.slug} readied in ${SLOT_LABELS[slot]}.`)
      clearDragState()
      return
    }

    if (target.kind === 'trash' && payload.kind === 'installed') {
      await handleRemove(payload.skill)
      return
    }

    clearDragState()
  }

  async function handlePortraitDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    const payload = resolveLiveDragPayload(event)

    if (!payload) {
      clearDragState()
      return
    }

    if (payload.kind === 'catalog') {
      await handleInstall(payload.skill, inferRegistryGearSlot(payload.skill))
      return
    }

    const slot = gearLoadout.byPath[payload.skill.path] ?? inferGearSlot(payload.skill)
    assignSkillToSlot(payload.skill.slug, slot)
    playUiSound('equip')
    setNotice(`${payload.skill.slug} readied in ${SLOT_LABELS[slot]}.`)
    clearDragState()
  }

  async function handleGearSlotDrop(event: DragEvent<HTMLElement>, slot: GearSlot) {
    event.preventDefault()
    const payload = resolveLiveDragPayload(event)

    if (!payload) {
      clearDragState()
      return
    }

    if (payload.kind === 'catalog') {
      await handleInstall(payload.skill, slot)
      return
    }

    assignSkillToSlot(payload.skill.slug, slot)
    playUiSound('equip')
    setNotice(`Moved ${payload.skill.slug} to ${SLOT_LABELS[slot]}.`)
    clearDragState()
  }

  async function handleTrashDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    const payload = resolveLiveDragPayload(event)

    if (!payload || payload.kind !== 'installed') {
      clearDragState()
      return
    }

    await handleRemove(payload.skill)
  }

  const mobileQuestPanel =
    isMobileShell && activeConnectionMode === 'remote' && mobileQuestActivity ? (
      <div
        className={`quest-activity-window ${mobileQuestActivity.waitingForApproval ? 'quest-activity-window-warning' : ''}`}
        role="status"
      >
        <div className="quest-activity-head">
          <span>Quest in progress</span>
          <span className={`mini-chip ${mobileQuestActivity.waitingForApproval ? 'mini-chip-warning' : ''}`}>
            {mobileQuestActivity.statusLabel}
          </span>
        </div>
        <div className="quest-activity-copy">
          <strong>{`${adventurerName} is on a quest.`}</strong>
          <div className="quest-activity-meta">
            <span>
              Elapsed:{' '}
              {formatMobileQuestElapsed(
                mobileQuestActivity.startedAt,
                mobileQuestActivity.runtimeMs,
                mobileQuestClock,
              )}
            </span>
          </div>
        </div>
      </div>
    ) : null

  const displayedQuestBubble = clampQuestBubbleText(questBubble, isMobileShell)

  const questControls = (
    <div className="quest-controls">
      {mobileQuestPanel}

      <div className="quest-console">
        <label className="quest-field">
          <span>Quest prompt</span>
          <textarea
            ref={questInputRef}
            disabled={questBusy}
            enterKeyHint="enter"
            onChange={(event) => setQuestDraft(event.target.value)}
            placeholder="Fix the build, scout the web, guard the repo..."
            value={questDraft}
            rows={isMobileShell ? 3 : 2}
          />
        </label>
        <button
          className="pixel-button pixel-button-primary"
          disabled={questBusy}
          onClick={() => void handleQuestSubmit()}
          type="button"
        >
          {questBusy ? <LoaderCircle className="spin" size={16} /> : <MessageCircle size={16} />}
          {questBusy ? 'Sending' : isMobileShell ? (liveMobileRemoteQuests ? 'Quest' : 'Link Gateway') : 'Quest'}
        </button>
      </div>

      {questError ? (
        <div className="quest-error">
          <AlertTriangle size={16} />
          <span>{questError}</span>
        </div>
      ) : null}

      {questLogVisible && questLogEntries.length > 0 ? (
        <div className="quest-log" role="log">
          <div className="quest-log-head">
            <span>Quest Log</span>
            <span className={`mini-chip ${questBusy ? 'mini-chip-warning' : ''}`}>{questBusy ? 'Working' : 'Latest'}</span>
          </div>

          <div className="quest-log-list">
            {questLogEntries.map((entry) => (
              <div className={`quest-log-entry quest-log-entry-${entry.tone}`} key={entry.id}>
                <span className="quest-log-time">{formatQuestLogTimestamp(entry.timestamp)}</span>
                <div className="quest-log-copy">
                  <strong>{entry.title}</strong>
                  {entry.detail ? <span>{entry.detail}</span> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )

  const desktopShopLaunchers = !isMobileShell ? (
    <div className="desktop-shop-launchers">
      <button
        aria-controls="desktop-merchant-panel"
        aria-expanded={desktopShopOpen}
        className={`pixel-button desktop-shop-launcher desktop-shop-launcher-primary ${desktopShopOpen ? 'desktop-shop-launcher-active' : ''}`}
        onClick={() => {
          playUiSound('blip')
          setDesktopShopOpen((current) => !current)
        }}
        type="button"
      >
        <HandCoins size={18} />
        <span className="desktop-shop-launcher-copy">Skill Shop</span>
      </button>

      <button
        aria-expanded={partyOpen}
        className={`pixel-button desktop-shop-launcher ${partyOpen ? 'desktop-shop-launcher-primary desktop-shop-launcher-active' : ''}`}
        onClick={() => {
          playUiSound('blip')
          setPartyOpen((current) => !current)
        }}
        type="button"
      >
        <Users size={18} />
        <span className="desktop-shop-launcher-copy">Manage Party</span>
        <span className="mini-chip desktop-shop-launcher-count">
          {loadingParty ? <LoaderCircle className="spin" size={12} /> : cronJobs.length}
        </span>
      </button>

      <button
        className="pixel-button desktop-shop-launcher desktop-shop-launcher-disabled"
        disabled
        type="button"
      >
        <Construction size={18} />
        <span className="desktop-shop-launcher-copy">Potion Shop</span>
      </button>
    </div>
  ) : null

  const partyPanel = partyOpen || isMobileShell ? (
    <PartyRosterPanel
      activeCount={activePartyCount}
      error={partyError}
      jobs={partyMembers}
      loading={loadingParty}
      open={partyOpen}
      questingCount={questingPartyCount}
      troubleCount={troubledPartyCount}
    />
  ) : null

  return (
    <main
      className={`pixel-shell ${isDocked ? 'pixel-shell-docked' : ''} ${toolsOpen ? 'pixel-shell-tools-open' : ''} ${isMobileShell ? 'pixel-shell-mobile' : ''} ${mobileShopOpen ? 'mobile-shop-open' : ''} ${!isMobileShell && desktopShopOpen ? 'desktop-shop-open' : ''} ${!isMobileShell && !desktopShopOpen ? 'desktop-shop-collapsed' : ''}`}
      ref={shellViewportRef}
    >
      <section className={`game-screen ${isDocked ? 'game-screen-docked' : ''}`}>
        <header className="hud-bar">
          <div className="hud-brand" data-tauri-drag-region="" title="Drag window">
            <div className="brand-copy">
              <ClawQuestWordmark />
              <span>
                {isMobileShell
                  ? mobileGatewayReady
                    ? 'Mobile gateway linked'
                    : 'Link your OpenClaw Gateway'
                  : runtime
                    ? 'Desktop skill manager'
                    : 'Browser preview'}
              </span>
            </div>
          </div>

          <div className="hud-stats">
            {!isDocked || isMobileShell ? (
              <>
                <button className="pixel-button pixel-button-primary" disabled={busy} onClick={() => void handleRefresh()}>
                  {busy ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}
                  Refresh
                </button>
                <div className="hud-settings">
                  <button
                    aria-expanded={settingsOpen}
                    aria-label="Open settings"
                    className={`pixel-settings-button ${settingsOpen ? 'pixel-settings-button-active' : ''}`}
                    onClick={handleToggleSettings}
                    title="Settings"
                    type="button"
                  >
                    <PixelCogIcon />
                  </button>

                  {settingsOpen ? (
                    <div className="settings-menu">
                      <span className="settings-menu-title">Settings</span>
                      <button className="pixel-button settings-menu-action" onClick={handleToggleAudioMuted} type="button">
                        {audioMuted ? 'Unmute audio' : 'Mute audio'}
                      </button>
                      <button className="pixel-button settings-menu-action" onClick={handleToggleQuestLog} type="button">
                        {questLogVisible ? 'Hide quest log' : 'Show quest log'}
                      </button>
                      {!isMobileShell ? (
                        <button className="pixel-button settings-menu-action" onClick={() => void handleCenterWindow()} type="button">
                          Center window
                        </button>
                      ) : null}
                      <button className="pixel-button settings-menu-action" disabled={busy} onClick={handleResetLevel} type="button">
                        Reset character progress
                      </button>
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}
            {!isMobileShell ? (
              <>
                <button
                  aria-label={isDocked ? 'Return to full layout' : 'Switch to docked layout'}
                  className={`pixel-mode-button ${isDocked ? 'pixel-mode-button-active' : ''}`}
                  onClick={handleToggleDockedMode}
                  title={isDocked ? 'Return to full layout' : 'Switch to docked layout'}
                  type="button"
                >
                  <PixelDockIcon docked={isDocked} />
                </button>
                <button
                  aria-label="Exit Claw Quest"
                  className="pixel-close-button"
                  onClick={() => void handleCloseWindow()}
                  title="Exit Claw Quest"
                  type="button"
                >
                  <PixelCloseIcon />
                </button>
              </>
            ) : null}
          </div>
        </header>

        {error ? (
          <div className="message-strip message-strip-danger">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        ) : null}

        {!error && noticeLines.length ? (
          <div className="message-strip message-strip-neutral">
            <MessageCircle size={16} />
            <div className="message-strip-copy">
              <span className="message-strip-title">Messages</span>
              <div className="message-strip-lines">
                {noticeLines.map((line, index) => (
                  <span key={`${line}-${index}`}>{line}</span>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <div className={`board-grid ${isDocked ? 'board-grid-docked' : ''}`}>
          <section
            className={`board-pane inventory-pane ${isMobileShell ? 'inventory-pane-mobile' : ''}`}
            id="desktop-merchant-panel"
          >
            {isMobileShell ? <div className="mobile-sheet-handle" /> : null}
            <div className="merchant-window">
              <div
                className="shopkeeper-float"
                onFocus={() => playUiSound('blip')}
                onMouseEnter={() => playUiSound('blip')}
              >
                <div className="shopkeeper-orb">
                  <div className="shopkeeper-frame">
                    <ShopkeeperPortrait />
                  </div>
                </div>
                <div className="shopkeeper-speech">What are ya buyin' ?</div>
              </div>

              <div className="merchant-topbar">
                <div className="merchant-topcopy">
                  <div>
                    <div className="merchant-title">
                      <PixelMarketIcon size={22} />
                      <h2>Skill Market</h2>
                    </div>
                  </div>
                </div>

                <div className="search-row">
                  <label className="search-box">
                    <Search size={16} />
                    <input
                      onChange={(event) => setSearchText(event.target.value)}
                      placeholder="Search skills"
                      type="search"
                      value={searchText}
                    />
                  </label>

                  <label className="pixel-select">
                    <select onChange={(event) => setSort(event.target.value as BrowseSort)} value={sort}>
                      <option value="downloads">Popular</option>
                      <option value="newest">Newest</option>
                      <option value="trending">Trending</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="merchant-scroll">
                {catalogIssue ? (
                  <div className="catalog-status">
                    <AlertTriangle size={16} />
                    <span>{catalogIssue}</span>
                  </div>
                ) : null}

                <div className="catalog-grid merchant-grid">
              {loadingCatalog ? (
                <EmptyState
                  icon={<LoaderCircle className="spin" size={22} />}
                  text="Loading library"
                  title="Fetching skills"
                />
              ) : catalog.length === 0 ? (
                <EmptyState
                  icon={catalogIssue ? <AlertTriangle size={22} /> : <Search size={22} />}
                  text={catalogIssue || 'Try a different search.'}
                  title={catalogIssue ? 'Taking a short breather' : 'No matches'}
                />
              ) : (
                catalog.map((skill, index) => {
                  const installed = installedSlugs.has(skill.slug)
                  const isWorking = workingSlug === skill.slug
                  const slot = inferRegistryGearSlot(skill)
                  const rarity = deriveRegistrySkillRarity(skill, index, catalog.length, sort)

                  return (
                    <article
                      className={`skill-card skill-card-rarity-${rarity.tier} ${installed ? 'skill-card-installed' : ''}`}
                      draggable={!isMobileShell && !installed}
                      key={skill.slug}
                      onDoubleClick={() => {
                        if (isMobileShell && !installed && !isWorking) {
                          void handleInstall(skill, slot)
                        }
                      }}
                      onPointerDown={(event) => {
                        if (!isMobileShell && !installed) {
                          beginManualDrag(event, { kind: 'catalog', skill })
                        }
                      }}
                      onDragEnd={isMobileShell ? undefined : handleDragEnd}
                      onDragStart={isMobileShell ? undefined : (event) => handleCatalogDragStart(event, skill)}
                    >
                      <div className="skill-card-banner">
                        <span className="skill-slot-chip" title={SLOT_LABELS[slot]}>
                          <PixelGearIcon size={18} slot={slot} />
                        </span>
                        {installed ? <span className="stock-chip stock-chip-owned">Equipped</span> : null}
                      </div>

                      <div className="skill-card-body">
                        <div className="skill-card-icon">
                          <PixelGearIcon size={72} slot={slot} />
                        </div>

                        <strong className="skill-card-name">{skill.displayName}</strong>

                        <div className="skill-card-foot">
                          {!isMobileShell ? (
                            <div className="skill-card-meta">
                              <span className={`mini-chip rarity-chip rarity-chip-${rarity.tier}`}>{rarity.label}</span>
                              {skill.version ? <span className="mini-chip">v{skill.version}</span> : null}
                              {isWorking ? (
                                <span className="mini-chip">
                                  <LoaderCircle className="spin" size={14} />
                                  Equipping
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                          {isMobileShell ? (
                            <button
                              className="pixel-button skill-card-action"
                              disabled={installed || isWorking || busy}
                              onClick={(event) => {
                                event.stopPropagation()
                                void handleInstall(skill, slot)
                              }}
                              type="button"
                            >
                              {installed ? 'In Loadout' : isWorking ? 'Equipping' : 'Equip'}
                            </button>
                          ) : null}
                        </div>
                      </div>

                      <div className="skill-tooltip">
                        <strong>{skill.displayName}</strong>
                        <span>
                          {SLOT_LABELS[slot]}
                          {skill.version ? ` / v${skill.version}` : ''}
                        </span>
                        <span className={`tooltip-rarity tooltip-rarity-${rarity.tier}`}>
                          {rarity.label}
                          {` / ${rarity.metric}`}
                        </span>
                        <p>{skill.summary ?? 'No summary provided.'}</p>
                      </div>
                    </article>
                  )
                })
              )}
                </div>
              </div>
            </div>
          </section>

          <section className={`board-pane center-pane ${dropZone === 'equip' ? 'board-pane-active' : ''}`}>
            <div className="portrait-stage">
              {isMobileShell ? questControls : null}

              <div className={`portrait-card ${classTheme.cardClass}`}>
                <div className="portrait-speech">
                  <div className={`quest-bubble quest-bubble-${questMood}`}>{displayedQuestBubble}</div>
                </div>

                <div className="portrait-frame">
                  <PaperDollStage
                    activeSlot={hoveredGearSlot}
                    agentClass={displayedAgentClass}
                    agentRace={displayedAgentRace}
                    gearLoadout={gearLoadout}
                    isActive={dropZone === 'equip' && hoveredGearSlot === null}
                    motion={avatarMotion}
                    onSlotLeave={() => setHoveredGearSlot(null)}
                    onSlotDrop={(event, slot) => void handleGearSlotDrop(event, slot)}
                    onSlotHover={(event, slot) => {
                      const payload = resolveLiveDragPayload(event)
                      if (!payload) {
                        return
                      }

                      event.preventDefault()
                      setDropZone('equip')
                      setHoveredGearSlot(slot)
                    }}
                    onPortraitDrop={(event) => void handlePortraitDrop(event)}
                    onPortraitHover={(event) => {
                      const payload = resolveLiveDragPayload(event)
                      if (!payload) {
                        return
                      }

                      event.preventDefault()
                      setDropZone('equip')
                      setHoveredGearSlot(null)
                    }}
                  />
                </div>
              </div>

              <div className="portrait-details">
                {desktopShopLaunchers}
                {partyPanel}

                <div className={`class-card ${classTheme.cardClass}`}>
                  <div className="class-card-topline">
                    <span className="class-card-kicker">Adventurer</span>
                    <span className="mini-chip class-level-chip">Lv. {progress.level}</span>
                  </div>
                  <div className="class-card-name">{adventurerName}</div>
                  <div className="class-card-head">
                    <ClassIcon size={18} />
                    <strong>
                      {RACE_LABELS[displayedAgentRace]} {classTheme.label}
                    </strong>
                  </div>
                  <p>
                    {equippedCount} slots filled / {riskyCount} risky
                  </p>
                  <div className="class-progress">
                    <div className="class-progress-copy">
                      <span>{questsCompleted} quests cleared</span>
                      <strong>
                        {progress.isMaxLevel
                          ? 'Max level reached'
                          : `${progress.questsIntoLevel} / ${progress.questsForNextLevel} to next level`}
                      </strong>
                    </div>
                    <div aria-hidden="true" className="class-progress-track">
                      <div
                        className="class-progress-fill"
                        style={{
                          width: progress.isMaxLevel
                            ? '100%'
                            : `${Math.max(
                                10,
                                Math.round((progress.questsIntoLevel / Math.max(1, progress.questsForNextLevel)) * 100),
                              )}%`,
                        }}
                      />
                    </div>
                  </div>
                  <span className="class-card-summary">{classTheme.summary}</span>
                </div>

                {isMobileShell ? (
                  <div className={`mobile-prototype-note ${mobileGatewayReady ? 'mobile-prototype-note-linked' : ''}`}>
                    <Globe size={16} />
                    <div>
                      <strong>{mobileGatewayReady ? 'Gateway linked' : 'Gateway setup pending'}</strong>
                      <span>
                        {liveMobileRemoteQuests
                          ? 'Mobile quests and loadout now come from the linked OpenClaw gateway. Tap Equip in the shop to add skills from the phone.'
                          : 'Browse the guild ledger below. Link a live OpenClaw gateway to pull in your real loadout.'}
                      </span>
                    </div>
                  </div>
                ) : null}

                {!isMobileShell ? questControls : null}
              </div>
            </div>

            <section className="loadout-window">
              <div className="pane-head slot-headline">
                <div>
                  <h2>Loadout</h2>
                  <p>Equipped skills and scan status.</p>
                </div>
              </div>

              <div className="slot-grid">
                {state.installed.length === 0 ? (
                  <EmptyState
                    icon={<ArrowDownToLine size={22} />}
                    text="Connect OpenClaw to load your real skills and equipment."
                    title="Loadout empty"
                  />
                ) : (
                  state.installed.map((skill) => {
                    const tone = toneForStatus(skill.status === 'missing' ? 'missing' : skill.security.status)
                    const removing = removingPath === skill.path

                    return (
	                      <article
	                        className={`slot-card slot-card-${tone}`}
	                        draggable={!isMobileShell && !removing}
	                        key={skill.path}
	                        onPointerDown={(event) => {
                            if (!isMobileShell && !removing) {
                              beginManualDrag(event, { kind: 'installed', skill })
                            }
                          }}
	                        onDragEnd={isMobileShell ? undefined : handleDragEnd}
	                        onDragStart={isMobileShell ? undefined : (event) => handleInstalledDragStart(event, skill)}
	                      >
                        <div
                          className="slot-index"
                          title={SLOT_LABELS[gearLoadout.byPath[skill.path] ?? inferGearSlot(skill)]}
                        >
                          <PixelGearIcon size={28} slot={gearLoadout.byPath[skill.path] ?? inferGearSlot(skill)} />
                        </div>

                        <div className="slot-body">
                          <div className="slot-head">
                            <div>
                              <strong>{skill.slug}</strong>
                              <span>{skill.rootLabel}</span>
                            </div>

                            <StatusChip tone={tone} icon={iconForStatus(skill.status === 'missing' ? 'missing' : skill.security.status)}>
                              {labelForStatus(skill.status === 'missing' ? 'missing' : skill.security.status)}
                            </StatusChip>
                          </div>

                          <div className="slot-meta">
                            {skill.version ? <span className="mini-chip">v{skill.version}</span> : null}
                            {skill.security.hasKnownIssues ? <span className="mini-chip mini-chip-warning">Known issues</span> : null}
                            {removing ? <span className="mini-chip mini-chip-danger">Removing</span> : null}
                          </div>

                          <p className="skill-copy">
                            {skill.status === 'missing'
                              ? 'Files are missing from the selected skill root.'
                              : skill.security.summary}
                          </p>

                          {skill.security.reasonCodes.length > 0 ? (
                            <div className="reason-row">
                              {skill.security.reasonCodes.slice(0, 3).map((reason) => (
                                <span className="mini-chip" key={reason}>
                                  {formatReasonCode(reason)}
                                </span>
                              ))}
                            </div>
                          ) : null}

                          {skill.security.scanners.length > 0 ? (
                            <div className="reason-row">
                              {skill.security.scanners.slice(0, 2).map((scanner) => (
                                <span className="mini-chip" key={`${skill.path}-${scanner.name}`}>
                                  {scanner.name}: {labelForStatus(scanner.status)}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </article>
                    )
                  })
                )}
              </div>
            </section>
          </section>

          <aside className={`board-pane tool-pane ${toolsOpen ? 'tool-pane-open' : 'tool-pane-collapsed'}`}>
            <button
              aria-controls="desktop-tools-panel"
              aria-expanded={toolsOpen}
              className="submenu-toggle tool-pane-toggle"
              onClick={handleToggleToolsPane}
              type="button"
            >
              <span className="submenu-title">
                {toolsOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                Desktop Tools
              </span>
              <span className="tool-pane-toggle-hint">{toolsOpen ? 'Collapse' : 'Expand'}</span>
            </button>

            {toolsOpen ? (
              <div className="tool-pane-grid" id="desktop-tools-panel">
                <section className="tool-block">
                  <div className="pane-head">
                    <div>
                      <h2>Build Settings</h2>
                      <p>Choose local CLI, a remote Gateway, or a Docker container.</p>
                    </div>
                  </div>

                  <label className="pixel-field">
                    <span>Connection mode</span>
                    <label className="pixel-select">
                      <select
                        onChange={(event) =>
                          setDraftConfig((current) => ({
                            ...current,
                            connectionMode: event.target.value as ConnectionMode,
                          }))
                        }
                        value={draftConfig.connectionMode}
                      >
                        <option value="local">Local build</option>
                        <option value="remote">Remote Gateway</option>
                        <option value="docker">Docker container</option>
                      </select>
                    </label>
                  </label>

                  <label className="pixel-field">
                    <span>Build path</span>
                    <input
                      onChange={(event) =>
                        setDraftConfig((current) => ({ ...current, openclawPath: event.target.value }))
                      }
                      placeholder="C:\\OpenClaw"
                      type="text"
                      value={draftConfig.openclawPath}
                    />
                  </label>

                  <label className="pixel-field">
                    <span>Workdir</span>
                    <input
                      onChange={(event) => setDraftConfig((current) => ({ ...current, workdir: event.target.value }))}
                      placeholder="C:\\Users\\you\\OpenClawWorkspace"
                      type="text"
                      value={draftConfig.workdir}
                    />
                  </label>

                  <label className="pixel-field">
                    <span>Skills dir</span>
                    <input
                      onChange={(event) => setDraftConfig((current) => ({ ...current, skillsDir: event.target.value }))}
                      placeholder="C:\\Users\\you\\OpenClawWorkspace\\skills"
                      type="text"
                      value={draftConfig.skillsDir}
                    />
                  </label>

                  {draftConfig.connectionMode === 'remote' ? (
                    <>
                      <label className="pixel-field">
                        <span>Gateway URL</span>
                        <input
                          onChange={(event) =>
                            setDraftConfig((current) => ({ ...current, gatewayUrl: event.target.value }))
                          }
                          placeholder="ws://gateway-host:18789"
                          type="text"
                          value={draftConfig.gatewayUrl}
                        />
                      </label>

                      <label className="pixel-field">
                        <span>Gateway token</span>
                        <input
                          onChange={(event) =>
                            setDraftConfig((current) => ({ ...current, gatewayToken: event.target.value }))
                          }
                          placeholder="Optional token"
                          type="password"
                          value={draftConfig.gatewayToken}
                        />
                      </label>
                      <p className="tool-note">
                        Gateway tokens stay in memory only and require a secure https:// or wss:// URL.
                      </p>
                    </>
                  ) : null}

                  {draftConfig.connectionMode === 'docker' ? (
                    <>
                      <label className="pixel-field">
                        <span>Docker container</span>
                        <input
                          onChange={(event) =>
                            setDraftConfig((current) => ({ ...current, dockerContainer: event.target.value }))
                          }
                          placeholder="openclaw-gateway"
                          type="text"
                          value={draftConfig.dockerContainer}
                        />
                      </label>

                      <label className="pixel-field">
                        <span>Docker command</span>
                        <input
                          onChange={(event) =>
                            setDraftConfig((current) => ({ ...current, dockerCommand: event.target.value }))
                          }
                          placeholder="openclaw"
                          type="text"
                          value={draftConfig.dockerCommand}
                        />
                      </label>

                      <label className="pixel-field">
                        <span>Container workdir</span>
                        <input
                          onChange={(event) =>
                            setDraftConfig((current) => ({ ...current, dockerWorkdir: event.target.value }))
                          }
                          placeholder="/workspace"
                          type="text"
                          value={draftConfig.dockerWorkdir}
                        />
                      </label>
                    </>
                  ) : null}

                  <div className="tool-actions">
                    <button
                      className="pixel-button pixel-button-primary"
                      disabled={busy}
                      onClick={() => void applyDraft(draftConfig, 'Updated build settings.')}
                    >
                      <Wrench size={16} />
                      Apply
                    </button>

                    <button
                      className="pixel-button"
                      disabled={busy}
                      onClick={() =>
                        void applyDraft(
                          {
                            ...draftConfig,
                            openclawPath: '',
                          },
                          'Auto-find enabled.',
                        )
                      }
                    >
                      <RefreshCw size={16} />
                      Auto-find
                    </button>
                  </div>

                  <p className="tool-note">
                    Docker and Remote Gateway mode change quest transport. Skill install and remove still use the host
                    workspace, so Docker setups work best with a bind-mounted skills folder.
                  </p>
                </section>

                <CollapsibleMenu
                  count={state.openclawCandidates.length}
                  open={buildsOpen}
                  title="Detected Builds"
                  onToggle={() => setBuildsOpen((current) => !current)}
                >
                  <div className="choice-list">
                    {state.openclawCandidates.length === 0 ? (
                      <EmptyState icon={<HardDrive size={20} />} text="Try Auto-find." title="No builds found" />
                    ) : (
                      state.openclawCandidates.map((candidate) => (
                        <button
                          className={`choice-card ${candidate.selected ? 'choice-card-selected' : ''}`}
                          key={candidate.path}
                          onClick={() =>
                            void applyDraft(
                              {
                                ...draftConfig,
                                openclawPath: candidate.path,
                              },
                              `Using ${candidate.label}.`,
                            )
                          }
                          type="button"
                        >
                          <strong>{candidate.label}</strong>
                          <span>
                            {candidate.kind} / {candidate.source}
                          </span>
                          <code>{candidate.path}</code>
                        </button>
                      ))
                    )}
                  </div>
                </CollapsibleMenu>

                <CollapsibleMenu
                  count={state.skillRoots.length}
                  open={rootsOpen}
                  title="Skill Roots"
                  onToggle={() => setRootsOpen((current) => !current)}
                >
                  <div className="root-list">
                    {state.skillRoots.length === 0 ? (
                      <EmptyState icon={<FolderOpen size={20} />} text="No skill roots detected yet." title="No roots" />
                    ) : (
                      state.skillRoots.map((root) => <RootRow key={root.path} root={root} />)
                    )}
                  </div>
                </CollapsibleMenu>

                <section
                  className={`trash-zone ${dropZone === 'trash' ? 'trash-zone-active' : ''}`}
                  data-drop-zone="trash"
                  onDragLeave={() => {
                    if (dropZone === 'trash') {
                      setDropZone(null)
                    }
                  }}
                  onDragOver={(event) => {
                    const payload = resolveLiveDragPayload(event)
                    if (!payload || payload.kind !== 'installed') {
                      return
                    }

                    event.preventDefault()
                    setDropZone('trash')
                  }}
                  onDrop={(event) => void handleTrashDrop(event)}
                >
                  <PixelTrashCan active={dropZone === 'trash'} />
                  <strong>Trash</strong>
                  <span>Discard equipped skills</span>
                </section>
              </div>
            ) : null}
          </aside>
        </div>
      </section>

      {isMobileShell ? (
        <>
          {mobileShopOpen ? (
            <button aria-label="Hide skill shop" className="mobile-shop-scrim" onClick={() => setMobileShopOpen(false)} type="button" />
          ) : null}

          <div className="mobile-bottom-dock">
            <button
              className={`pixel-button mobile-dock-button ${mobileShopOpen ? 'mobile-dock-button-active' : ''}`}
              onClick={() => setMobileShopOpen((current) => !current)}
              type="button"
            >
              <Search size={16} />
              {mobileShopOpen ? 'Hide Shop' : 'Skill Shop'}
            </button>
            <button className="pixel-button mobile-dock-button" onClick={() => openMobileSetup(mobileGatewayReady ? 1 : 0)} type="button">
              <Globe size={16} />
              {mobileGatewayReady ? 'Gateway' : mobileDemoMode ? 'Setup' : 'Link Gate'}
            </button>
            <button className="pixel-button mobile-dock-button" disabled={busy} onClick={() => void handleRefresh()} type="button">
              <RefreshCw size={16} />
              Refresh
            </button>
          </div>
        </>
      ) : null}

      {isMobileShell && mobileSetupOpen ? (
        <div aria-label="Mobile setup wizard" aria-modal="true" className="mobile-setup-backdrop" role="dialog">
          <section className="mobile-setup-panel">
            <div className="mobile-setup-steps">
              <span className={`mobile-step-chip ${mobileSetupStep === 0 ? 'mobile-step-chip-active' : ''}`}>Welcome</span>
              <span className={`mobile-step-chip ${mobileSetupStep === 1 ? 'mobile-step-chip-active' : ''}`}>Gateway</span>
            </div>

            {mobileSetupStep === 0 ? (
              <div className="mobile-setup-copy">
                <span className="mobile-setup-kicker">Setup Wizard</span>
                <h2>Connect Claw Quest the easy way</h2>
                <p>
                  Install the <code>clawquest-connect</code> skill on the desktop OpenClaw host you want this phone
                  to talk to, then ask OpenClaw:
                  {' '}
                  <strong>I want to connect ClawQuest</strong>.
                </p>
                <p>
                  That helper can send the gateway URL and auth token to you over WhatsApp for easy copy and paste,
                  then auto-approve the next Android pairing attempt once.
                </p>

                {mobileDemoMode ? (
                  <div className="mobile-setup-helper-box">
                    <strong>Demo mode is active right now.</strong>
                    <span>Quests stay local to this phone until you switch back to a real OpenClaw gateway.</span>
                  </div>
                ) : null}

                <div className="mobile-setup-paths">
                  <button className="pixel-button" onClick={() => setMobileSetupStep(1)} type="button">
                    <Globe size={16} />
                    Manual Setup
                  </button>
                  <button className="pixel-button" onClick={handleEnableMobileDemo} type="button">
                    <MessageCircle size={16} />
                    Try Demo
                  </button>
                </div>
                <div className="mobile-setup-actions">
                  <button
                    className="pixel-button pixel-button-primary"
                    onClick={() => setMobileSetupStep(1)}
                    type="button"
                  >
                    Start Setup
                  </button>
                  <button className="pixel-button" onClick={handleDismissMobileSetup} type="button">
                    Skip for now
                  </button>
                </div>
              </div>
            ) : (
              <div className="mobile-setup-copy">
                <span className="mobile-setup-kicker">Gateway</span>
                <h2>Enter your gateway details</h2>

                <p>
                  Use the helper on your OpenClaw host if you want it to send the current gateway URL and auth token
                  over WhatsApp, then auto-approve the next Android pairing attempt once.
                </p>

                <label className="pixel-field">
                  <span>Gateway URL</span>
                  <input
                    onChange={(event) =>
                      {
                        setMobileSetupError('')
                        setDraftConfig((current) => ({
                          ...current,
                          connectionMode: 'remote',
                          gatewayUrl: event.target.value,
                        }))
                      }
                    }
                    placeholder="wss://your-gateway.example.com"
                    type="text"
                    value={draftConfig.gatewayUrl}
                  />
                </label>

                <label className="pixel-field">
                  <span>Gateway token</span>
                  <input
                    onChange={(event) =>
                      {
                        setMobileSetupError('')
                        setDraftConfig((current) => ({
                          ...current,
                          connectionMode: 'remote',
                          gatewayToken: event.target.value,
                        }))
                      }
                    }
                    placeholder="Gateway token or password"
                    type="password"
                    value={draftConfig.gatewayToken}
                  />
                </label>

                <p className="tool-note">
                  The gateway URL is saved on this phone. The current token stays in memory for this session only.
                </p>

                {mobileSetupError ? (
                  <div className="quest-error mobile-setup-error">
                    <AlertTriangle size={16} />
                    <span>{mobileSetupError}</span>
                  </div>
                ) : null}

                <div className="mobile-setup-actions">
                  <button className="pixel-button" onClick={() => setMobileSetupStep(0)} type="button">
                    Back
                  </button>
                  <button
                    className="pixel-button pixel-button-primary"
                    disabled={mobileSetupWorking}
                    onClick={() => void handleCompleteMobileSetup()}
                    type="button"
                  >
                    {mobileSetupWorking ? <LoaderCircle className="spin" size={16} /> : <Globe size={16} />}
                    {mobileSetupWorking ? 'Linking' : 'Link Gateway'}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      ) : null}

      {manualDrag ? (
        <DragGhost
          payload={manualDrag.payload}
          x={manualDrag.x - manualDrag.offsetX}
          y={manualDrag.y - manualDrag.offsetY}
        />
      ) : null}
    </main>
  )
}

function RootRow({ root }: { root: SkillRoot }) {
  return (
    <div className={`choice-card root-card ${root.selected ? 'choice-card-selected' : ''}`}>
      <strong>{root.label}</strong>
      <span>
        {root.selected ? 'Selected' : 'Detected'} / {root.exists ? 'available' : 'missing'}
      </span>
      <code>{root.path}</code>
    </div>
  )
}

function CollapsibleMenu({
  children,
  count,
  open,
  title,
  onToggle,
}: {
  children: ReactNode
  count: number
  open: boolean
  title: string
  onToggle: () => void
}) {
  const ToggleIcon = open ? ChevronDown : ChevronRight

  return (
    <section className="tool-block">
      <button className="submenu-toggle" onClick={onToggle} type="button">
        <span className="submenu-title">
          <ToggleIcon size={16} />
          {title}
        </span>
        <span className="submenu-count">{count}</span>
      </button>

      {open ? <div className="submenu-panel">{children}</div> : null}
    </section>
  )
}

function StatusChip({
  children,
  icon: Icon,
  tone,
}: {
  children: ReactNode
  icon?: LucideIcon
  tone: Tone
}) {
  return (
    <span className={`status-chip status-chip-${tone}`}>
      {Icon ? <Icon size={14} /> : null}
      {children}
    </span>
  )
}

function EmptyState({
  icon,
  text,
  title,
}: {
  icon: ReactNode
  text: string
  title: string
}) {
  return (
    <div className="empty-card">
      <div className="empty-icon">{icon}</div>
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  )
}

function PartyRosterPanel({
  activeCount,
  error,
  jobs,
  loading,
  open,
  questingCount,
  troubleCount,
}: {
  activeCount: number
  error: string
  jobs: PartyAdventurer[]
  loading: boolean
  open: boolean
  questingCount: number
  troubleCount: number
}) {
  return (
    <section className={`party-panel ${open ? 'party-panel-open' : ''}`}>
      <div className="party-panel-head">
        <div>
          <div className="party-panel-title">
            <Users size={18} />
            <h2>Manage Party</h2>
          </div>
          <p>OpenClaw cron jobs show up here as adventurers with recurring quests.</p>
        </div>
        <div className="party-panel-summary">
          <span className="mini-chip">{jobs.length} total</span>
          <span className="mini-chip">{activeCount} active</span>
          <span className={`mini-chip ${questingCount > 0 ? 'mini-chip-warning' : ''}`}>
            {questingCount} questing
          </span>
          <span className={`mini-chip ${troubleCount > 0 ? 'mini-chip-danger' : ''}`}>
            {troubleCount} trouble
          </span>
        </div>
      </div>

      {error ? (
        <div className="quest-error">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      ) : null}

      {loading ? (
        <EmptyState
          icon={<LoaderCircle className="spin" size={22} />}
          text="Checking the OpenClaw party roster."
          title="Summoning adventurers"
        />
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={<Users size={22} />}
          text="Create an OpenClaw cron job and refresh. It will appear here as a new adventurer."
          title="No party members yet"
        />
      ) : (
        <div className="party-grid">
          {jobs.map((member) => {
            const running = Boolean(member.job.state?.runningAtMs)
            const scheduleTone =
              member.statusTone === 'danger'
                ? 'danger'
                : running
                  ? 'warning'
                  : member.job.enabled
                    ? 'clean'
                    : 'neutral'

            return (
              <article className={`party-card party-card-${member.statusTone}`} key={member.id}>
                <div className="party-card-avatar">
                  <PixelAvatar
                    agentClass={member.agentClass}
                    agentRace={member.agentRace}
                    motion={running ? 'walking' : 'idle'}
                  />
                </div>

                <div className="party-card-body">
                  <div className="party-card-head">
                    <div>
                      <strong>{member.name}</strong>
                      <span>{member.classLabel}</span>
                    </div>
                    <div className="party-card-badges">
                      <span className="mini-chip class-level-chip">Lv. {member.level}</span>
                      <StatusChip tone={member.statusTone}>{member.statusLabel}</StatusChip>
                    </div>
                  </div>

                  <div className="party-card-meta">
                    <span className="mini-chip">{member.job.enabled ? 'Enabled' : 'Paused'}</span>
                    <span className={`mini-chip mini-chip-${scheduleTone}`}>{member.cadenceLabel}</span>
                    {member.job.schedule?.tz ? <span className="mini-chip">{member.job.schedule.tz}</span> : null}
                  </div>

                  <div className="party-card-quest">
                    <span>Daily Quest</span>
                    <p>{member.dailyQuest}</p>
                  </div>

                  <div className="party-card-timeline">
                    <div className="party-card-timeline-row">
                      <Clock3 size={14} />
                      <span>
                        Next run: {formatPartyTimestamp(member.job.state?.nextRunAtMs)}
                      </span>
                    </div>
                    <div className="party-card-timeline-row">
                      <ScrollText size={14} />
                      <span>
                        Last report: {formatPartyRunSummary(member.job)}
                      </span>
                    </div>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

function PixelAvatar({
  agentClass,
  agentRace,
  motion,
}: {
  agentClass: AgentClass
  agentRace: AgentRace
  motion: AvatarMotion
}) {
  const palette = {
    ...PIXEL_PALETTES[agentClass],
    ...RACE_PIXEL_PALETTE_OVERRIDES[agentRace],
  }
  const rects = [...BASE_PIXEL_RECTS, ...CLASS_PIXEL_RECTS[agentClass], ...RACE_PIXEL_RECTS[agentRace]]
  const headRects = rects.filter(([, y]) => y < 11)
  const bodyRects = rects.filter(([, y]) => y >= 11)

  return (
    <div
      className={`avatar-canvas avatar-canvas-${agentClass} avatar-canvas-race-${agentRace} avatar-canvas-${motion} ${motion === 'walking' ? 'avatar-canvas-questing' : ''}`}
    >
      <div className="avatar-actor">
        <svg aria-hidden="true" className="pixel-svg" shapeRendering="crispEdges" viewBox="0 0 16 20">
          <g className="avatar-head">
            {headRects.map(([x, y, width, height, fill], index) => (
              <rect
                fill={palette[fill]}
                height={height}
                key={`${agentClass}-${agentRace}-head-${index}`}
                width={width}
                x={x}
                y={y}
              />
            ))}
          </g>
          <g className="avatar-body">
            {bodyRects.map(([x, y, width, height, fill], index) => (
              <rect
                fill={palette[fill]}
                height={height}
                key={`${agentClass}-${agentRace}-body-${index}`}
                width={width}
                x={x}
                y={y}
              />
            ))}
          </g>
        </svg>
      </div>
    </div>
  )
}

function ShopkeeperPortrait() {
  return (
    <div className="shopkeeper-canvas">
      <svg aria-hidden="true" className="pixel-svg" shapeRendering="crispEdges" viewBox="3 2 10 9">
        {SHOPKEEPER_PIXEL_RECTS.map(([x, y, width, height, fill], index) => (
          <rect fill={fill} height={height} key={`shopkeeper-${index}`} width={width} x={x} y={y} />
        ))}
      </svg>
    </div>
  )
}

function ClawQuestWordmark() {
  return <img alt="Claw Quest" className="brand-wordmark" src={clawQuestWordmarkUrl} />
}

function PixelCloseIcon() {
  return (
    <svg aria-hidden="true" className="pixel-close-icon" shapeRendering="crispEdges" viewBox="0 0 12 12">
      <rect fill="#fff7ea" height="2" width="2" x="2" y="2" />
      <rect fill="#fff7ea" height="2" width="2" x="8" y="2" />
      <rect fill="#fff7ea" height="2" width="2" x="4" y="4" />
      <rect fill="#fff7ea" height="2" width="2" x="6" y="4" />
      <rect fill="#fff7ea" height="2" width="2" x="4" y="6" />
      <rect fill="#fff7ea" height="2" width="2" x="6" y="6" />
      <rect fill="#fff7ea" height="2" width="2" x="2" y="8" />
      <rect fill="#fff7ea" height="2" width="2" x="8" y="8" />
    </svg>
  )
}

function PixelCogIcon() {
  return (
    <svg aria-hidden="true" className="pixel-close-icon" shapeRendering="crispEdges" viewBox="0 0 12 12">
      <rect fill="#fff7ea" height="2" width="2" x="5" y="5" />
      <rect fill="#fff7ea" height="1" width="2" x="5" y="2" />
      <rect fill="#fff7ea" height="1" width="2" x="5" y="9" />
      <rect fill="#fff7ea" height="2" width="1" x="2" y="5" />
      <rect fill="#fff7ea" height="2" width="1" x="9" y="5" />
      <rect fill="#fff7ea" height="1" width="1" x="3" y="3" />
      <rect fill="#fff7ea" height="1" width="1" x="8" y="3" />
      <rect fill="#fff7ea" height="1" width="1" x="3" y="8" />
      <rect fill="#fff7ea" height="1" width="1" x="8" y="8" />
    </svg>
  )
}

function PixelDockIcon({ docked }: { docked: boolean }) {
  return (
    <svg aria-hidden="true" className="pixel-close-icon" shapeRendering="crispEdges" viewBox="0 0 12 12">
      <rect fill="#fff7ea" height="8" width="8" x="2" y="2" />
      <rect fill="#6e4b30" height="1" width="8" x="2" y="2" />
      <rect fill="#6e4b30" height="1" width="8" x="2" y="9" />
      <rect fill="#6e4b30" height="8" width="1" x="2" y="2" />
      <rect fill="#6e4b30" height="8" width="1" x="9" y="2" />
      <rect fill="#6e4b30" height="8" width="1" x={docked ? 8 : 5} y="2" />
      <rect fill="#d8aa55" height="8" width="1" x={docked ? 3 : 8} y="2" />
    </svg>
  )
}

function PixelMarketIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      className="slot-glyph"
      height={size}
      shapeRendering="crispEdges"
      viewBox="0 0 12 12"
      width={size}
    >
      {MARKET_BAG_PIXEL_RECTS.map(([x, y, width, height, fill], index) => (
        <rect fill={fill} height={height} key={`market-${index}`} width={width} x={x} y={y} />
      ))}
    </svg>
  )
}

function DragGhost({
  payload,
  x,
  y,
}: {
  payload: Exclude<DragPayload, null>
  x: number
  y: number
}) {
  const slot = payload.kind === 'catalog' ? inferRegistryGearSlot(payload.skill) : inferGearSlot(payload.skill)
  const label = payload.kind === 'catalog' ? payload.skill.displayName : payload.skill.slug

  return (
    <div className="drag-ghost" style={{ left: x, top: y }}>
      <PixelGearIcon size={22} slot={slot} />
      <strong>{label}</strong>
    </div>
  )
}

function PixelGearIcon({
  className,
  size = 18,
  slot,
}: {
  className?: string
  size?: number
  slot: GearSlot
}) {
  const classes = ['slot-glyph', className].filter(Boolean).join(' ')

  return (
    <svg
      aria-hidden="true"
      className={classes}
      height={size}
      shapeRendering="crispEdges"
      viewBox="0 0 12 12"
      width={size}
    >
      {SLOT_ICON_RECTS[slot].map(([x, y, width, height, fill], index) => (
        <rect fill={fill} height={height} key={`${slot}-${index}`} width={width} x={x} y={y} />
      ))}
    </svg>
  )
}

function PaperDollStage({
  activeSlot,
  agentClass,
  agentRace,
  gearLoadout,
  isActive,
  motion,
  onPortraitDrop,
  onPortraitHover,
  onSlotLeave,
  onSlotDrop,
  onSlotHover,
}: {
  activeSlot: GearSlot | null
  agentClass: AgentClass
  agentRace: AgentRace
  gearLoadout: ReturnType<typeof resolveGearLoadout>
  isActive: boolean
  motion: AvatarMotion
  onPortraitDrop: (event: DragEvent<HTMLElement>) => void
  onPortraitHover: (event: DragEvent<HTMLElement>) => void
  onSlotLeave: () => void
  onSlotDrop: (event: DragEvent<HTMLElement>, slot: GearSlot) => void
  onSlotHover: (event: DragEvent<HTMLElement>, slot: GearSlot) => void
}) {
  return (
    <div className={`paper-doll ${isActive ? 'paper-doll-active' : ''}`}>
      {SLOT_ORDER.map((slot, index) => {
        const skill = gearLoadout.bySlot[slot]
        const tone = skill ? toneForStatus(skill.status === 'missing' ? 'missing' : skill.security.status) : 'neutral'

        return (
          <div
            className={`paper-slot paper-slot-${index + 1} paper-slot-${skill ? 'filled' : 'empty'} paper-slot-tone-${tone} ${activeSlot === slot ? 'paper-slot-active' : ''}`}
            data-gear-slot={slot}
            key={slot}
            onDragLeave={onSlotLeave}
            onDragOver={(event) => onSlotHover(event, slot)}
            onDrop={(event) => onSlotDrop(event, slot)}
          >
            <span className="paper-slot-label" title={SLOT_LABELS[slot]}>
              <PixelGearIcon size={22} slot={slot} />
            </span>
            <strong>{skill ? shortSkillName(skill.slug) : 'Empty'}</strong>
          </div>
        )
      })}

      <div
        className={`paper-portrait ${isActive ? 'paper-portrait-active' : ''} ${motion === 'walking' ? 'paper-portrait-questing' : ''}`}
        data-drop-zone="equip"
        onDragLeave={onSlotLeave}
        onDragOver={onPortraitHover}
        onDrop={onPortraitDrop}
      >
        <PixelAvatar agentClass={agentClass} agentRace={agentRace} motion={motion} />
      </div>
    </div>
  )
}

function PixelTrashCan({ active }: { active: boolean }) {
  const body = active ? '#dc6a64' : '#b7a07a'
  const lid = active ? '#f29882' : '#dcc9a2'
  const outline = '#20171a'

  return (
    <svg aria-hidden="true" className="trash-svg" shapeRendering="crispEdges" viewBox="0 0 24 24">
      <rect fill={outline} height="1" width="8" x="8" y="4" />
      <rect fill={lid} height="2" width="12" x="6" y="5" />
      <rect fill={outline} height="1" width="14" x="5" y="7" />
      <rect fill={outline} height="11" width="1" x="7" y="8" />
      <rect fill={outline} height="11" width="1" x="17" y="8" />
      <rect fill={body} height="10" width="9" x="8" y="8" />
      <rect fill={outline} height="1" width="11" x="7" y="18" />
      <rect fill={outline} height="6" width="1" x="10" y="10" />
      <rect fill={outline} height="6" width="1" x="14" y="10" />
    </svg>
  )
}

function classifyAgentLoadout(installed: InstalledSkill[]): AgentClass {
  const ready = installed.filter((skill) => skill.status === 'ready')

  if (ready.length === 0) {
    return 'cleric'
  }

  if (ready.every((skill) => skill.security.status === 'clean')) {
    return 'paladin'
  }

  const riskyCount = ready.filter((skill) => isRiskyStatus(skill.security.status)).length
  if (riskyCount >= Math.max(1, Math.ceil(ready.length / 3))) {
    return 'rogue'
  }

  let clericScore = 0
  let rangerScore = 0

  for (const skill of ready) {
    const source = `${skill.slug} ${skill.source} ${skill.security.summary}`.toLowerCase()
    clericScore += keywordScore(source, DEV_KEYWORDS)
    rangerScore += keywordScore(source, RANGER_KEYWORDS)
  }

  return rangerScore > clericScore ? 'ranger' : 'cleric'
}

function keywordScore(source: string, keywords: readonly string[]) {
  let score = 0

  for (const keyword of keywords) {
    if (source.includes(keyword)) {
      score += 1
    }
  }

  return score
}

function toneForStatus(status: string): Tone {
  switch (status) {
    case 'clean':
      return 'clean'
    case 'malicious':
    case 'missing':
      return 'danger'
    case 'suspicious':
      return 'warning'
    default:
      return 'neutral'
  }
}

function labelForStatus(status: string) {
  switch (status) {
    case 'clean':
      return 'Clean'
    case 'malicious':
      return 'Blocked'
    case 'suspicious':
      return 'Review'
    case 'pending':
      return 'Scanning'
    case 'missing':
      return 'Missing'
    default:
      return 'Unknown'
  }
}

function iconForStatus(status: string): LucideIcon {
  switch (status) {
    case 'clean':
      return ShieldCheck
    case 'malicious':
    case 'missing':
      return AlertTriangle
    case 'suspicious':
      return ShieldAlert
    default:
      return Shield
  }
}

function isRiskyStatus(status: string) {
  return status === 'suspicious' || status === 'malicious'
}

function configFromDraft(draft: DraftConfig): ManagerConfig | undefined {
  const config: ManagerConfig = {}

  if (draft.workdir.trim()) {
    config.workdir = draft.workdir.trim()
  }

  if (draft.skillsDir.trim()) {
    config.skillsDir = draft.skillsDir.trim()
  }

  if (draft.openclawPath.trim()) {
    config.openclawPath = draft.openclawPath.trim()
  }

  config.connectionMode = draft.connectionMode

  if (draft.gatewayUrl.trim()) {
    config.gatewayUrl = draft.gatewayUrl.trim()
  }

  if (draft.gatewayToken.trim()) {
    config.gatewayToken = draft.gatewayToken.trim()
  }

  if (draft.dockerContainer.trim()) {
    config.dockerContainer = draft.dockerContainer.trim()
  }

  if (draft.dockerCommand.trim()) {
    config.dockerCommand = draft.dockerCommand.trim()
  }

  if (draft.dockerWorkdir.trim()) {
    config.dockerWorkdir = draft.dockerWorkdir.trim()
  }

  return Object.keys(config).length > 0 ? config : undefined
}

function draftFromConfig(config: ManagerConfig | undefined): DraftConfig {
  return {
    ...EMPTY_DRAFT,
    workdir: config?.workdir ?? '',
    skillsDir: config?.skillsDir ?? '',
    openclawPath: config?.openclawPath ?? '',
    connectionMode: config?.connectionMode ?? 'local',
    gatewayUrl: config?.gatewayUrl ?? '',
    gatewayToken: config?.gatewayToken ?? '',
    dockerContainer: config?.dockerContainer ?? '',
    dockerCommand: config?.dockerCommand ?? 'openclaw',
    dockerWorkdir: config?.dockerWorkdir ?? '',
  }
}

function mergeDraftWithState(state: ManagerState, fallbackDraft?: Partial<DraftConfig>): DraftConfig {
  return {
    ...EMPTY_DRAFT,
    ...fallbackDraft,
    workdir: state.resolvedWorkdir,
    skillsDir: state.resolvedSkillsDir,
    openclawPath: state.openclawTarget?.path ?? '',
  }
}

function mergeStoredConnectionSettings(baseDraft: DraftConfig): DraftConfig {
  return {
    ...baseDraft,
    ...readStoredConnectionSettings(),
  }
}

function detectMobileShell() {
  if (typeof window === 'undefined') {
    return false
  }

  const userAgent = window.navigator.userAgent.toLowerCase()
  const isMobileUserAgent = /android|iphone|ipad|mobile/.test(userAgent)
  const isNarrowViewport = window.innerWidth <= MOBILE_SHELL_BREAKPOINT_PX
  const hasCoarsePointer =
    typeof window.matchMedia === 'function' ? window.matchMedia('(pointer: coarse)').matches : false

  return isMobileUserAgent || (isNarrowViewport && hasCoarsePointer)
}

function resizeQuestComposer(element: HTMLTextAreaElement | null) {
  if (!element) {
    return
  }

  element.style.height = '0px'

  const computed = window.getComputedStyle(element)
  const lineHeight = Number.parseFloat(computed.lineHeight) || 20
  const borderTop = Number.parseFloat(computed.borderTopWidth) || 0
  const borderBottom = Number.parseFloat(computed.borderBottomWidth) || 0
  const paddingTop = Number.parseFloat(computed.paddingTop) || 0
  const paddingBottom = Number.parseFloat(computed.paddingBottom) || 0
  const maxHeight = lineHeight * 3 + borderTop + borderBottom + paddingTop + paddingBottom
  const nextHeight = Math.min(element.scrollHeight, maxHeight)

  element.style.height = `${Math.max(nextHeight, lineHeight + borderTop + borderBottom + paddingTop + paddingBottom)}px`
  element.style.overflowY = element.scrollHeight > maxHeight ? 'auto' : 'hidden'
}

function hasGatewayWizardConfig(draft: DraftConfig) {
  return draft.connectionMode === 'remote' && draft.gatewayUrl.trim().length > 0
}

function readStoredConnectionSettings(): Partial<DraftConfig> {
  try {
    const raw = window.localStorage.getItem(CONNECTION_SETTINGS_STORAGE_KEY)
    return parseStoredConnectionSettings(raw)
  } catch {
    return {}
  }
}

function writeStoredConnectionSettings(draft: DraftConfig) {
  window.localStorage.setItem(
    CONNECTION_SETTINGS_STORAGE_KEY,
    JSON.stringify(
      buildStoredConnectionSettings({
        connectionMode: draft.connectionMode,
        gatewayUrl: draft.gatewayUrl,
        gatewayToken: draft.gatewayToken,
        dockerContainer: draft.dockerContainer,
        dockerCommand: draft.dockerCommand,
        dockerWorkdir: draft.dockerWorkdir,
      }),
    ),
  )
}

function isFeatureDemoMode() {
  if (typeof window === 'undefined') {
    return false
  }

  const searchParams = new URLSearchParams(window.location.search)
  return searchParams.get(FEATURE_DEMO_QUERY_KEY) === FEATURE_DEMO_QUERY_VALUE
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function buildFeatureDemoCatalog(query: string, sort: BrowseSort) {
  const normalizedQuery = query.trim().toLowerCase()
  const filtered = FEATURE_DEMO_CATALOG_SEEDS.filter((seed) => {
    if (!normalizedQuery) {
      return true
    }

    const haystack = `${seed.slug} ${seed.displayName} ${seed.summary}`.toLowerCase()
    return haystack.includes(normalizedQuery)
  })

  return filtered
    .slice()
    .sort((left, right) => compareFeatureDemoSeeds(left, right, sort))
    .map((seed) => buildFeatureDemoRegistrySkill(seed))
}

function buildFeatureDemoInstalledSkills() {
  return FEATURE_DEMO_INSTALLED_SEEDS.map((seed, index) => buildFeatureDemoInstalledSkill(seed, index))
}

function buildFeatureDemoRegistrySkill(seed: DemoSkillSeed): RegistrySkill {
  return {
    slug: seed.slug,
    displayName: seed.displayName,
    summary: seed.summary,
    version: seed.version,
    updatedAt: seed.updatedAt,
    score: seed.score,
    downloads: seed.downloads,
    rating: seed.rating,
  }
}

function buildFeatureDemoInstalledSkill(skill: DemoSkillSeed | RegistrySkill, index: number): InstalledSkill {
  const securitySummary =
    'securitySummary' in skill && typeof skill.securitySummary === 'string'
      ? skill.securitySummary
      : FEATURE_DEMO_SECURITY_SUMMARY
  const securityStatus =
    'securityStatus' in skill && typeof skill.securityStatus === 'string' ? skill.securityStatus : 'clean'
  const reasonCodes =
    'reasonCodes' in skill && Array.isArray(skill.reasonCodes) ? skill.reasonCodes : ['preview_scan_clean']
  const skillDir = joinWindowsPath(joinWindowsPath('C:\\Users\\Player\\OpenClawWorkspace\\skills', skill.slug), 'SKILL.md')

  return {
    slug: skill.slug,
    version: skill.version ?? '1.0.0',
    installedAt: Date.parse('2026-03-23T09:00:00Z') + index * 60_000,
    path: skillDir,
    rootLabel: 'Workspace skills',
    registry: 'https://clawhub.ai',
    source: skill.displayName,
    status: 'ready',
    security: {
      status: securityStatus,
      summary: securitySummary,
      checkedAt: Date.parse('2026-03-23T09:20:00Z'),
      hasKnownIssues: false,
      hasScanResult: true,
      reasonCodes,
      model: 'preview-demo',
      virustotalUrl: null,
      versionContext: 'installed',
      sourceVersion: skill.version ?? '1.0.0',
      matchesRequestedVersion: true,
      scanners: [
        {
          name: 'Preview Shield',
          status: securityStatus,
          verdict: securityStatus === 'clean' ? 'verified' : securityStatus,
          summary: securitySummary,
          checkedAt: Date.parse('2026-03-23T09:20:00Z'),
          confidence: 'high',
          source: 'Feature demo',
        },
      ],
    },
  }
}

function compareFeatureDemoSeeds(left: DemoSkillSeed, right: DemoSkillSeed, sort: BrowseSort) {
  if (sort === 'newest') {
    return right.updatedAt - left.updatedAt
  }

  if (sort === 'trending') {
    return right.score - left.score
  }

  return right.downloads - left.downloads
}

function buildPreviewManagerState(
  config: ManagerConfig | undefined,
  installed: InstalledSkill[],
): ManagerState {
  const draft = draftFromConfig(config)
  const workdir = draft.workdir.trim() || 'C:\\Users\\Player\\OpenClawWorkspace'
  const skillsDir = draft.skillsDir.trim() || joinWindowsPath(workdir, 'skills')
  const openclawPath = draft.openclawPath.trim() || 'C:\\Program Files\\OpenClaw'
  const openclawTarget: OpenClawTarget = {
    path: openclawPath,
    label: `Folder: ${leafName(openclawPath) || 'OpenClaw'}`,
    source: draft.openclawPath ? 'Manual override' : 'Preview auto-find',
    kind: 'directory',
    exists: true,
    selected: true,
  }

  return {
    agentName: 'OpenClaw Agent',
    resolvedWorkdir: workdir,
    resolvedSkillsDir: skillsDir,
    workspaceSource: draft.openclawPath ? 'manual override' : 'preview auto-find',
    registry: 'https://clawhub.ai',
    skillRoots: [
      {
        path: skillsDir,
        label: 'Workspace skills',
        selected: true,
        exists: true,
      },
      {
        path: joinWindowsPath(openclawPath, 'skills'),
        label: 'OpenClaw install',
        selected: false,
        exists: true,
      },
    ],
    openclawTarget,
    openclawCandidates: [
      openclawTarget,
      {
        path: 'C:\\Games\\OpenClaw',
        label: 'Folder: OpenClaw',
        source: 'Detected build',
        kind: 'directory',
        exists: true,
        selected: openclawPath === 'C:\\Games\\OpenClaw',
      },
    ],
    installed,
  }
}

function resolveGearLoadout(installed: InstalledSkill[], preferences: SlotPreferenceMap) {
  const bySlot = Object.fromEntries(SLOT_ORDER.map((slot) => [slot, null])) as Record<
    GearSlot,
    InstalledSkill | null
  >
  const byPath: Record<string, GearSlot> = {}
  const assignedPaths = new Set<string>()

  for (const slot of SLOT_ORDER) {
    const match = installed.find((skill) => preferences[skill.slug] === slot)
    if (!match || assignedPaths.has(match.path)) {
      continue
    }

    bySlot[slot] = match
    byPath[match.path] = slot
    assignedPaths.add(match.path)
  }

  for (const skill of installed) {
    if (assignedPaths.has(skill.path)) {
      continue
    }

    const slot = inferGearSlot(skill)
    if (!bySlot[slot]) {
      bySlot[slot] = skill
      byPath[skill.path] = slot
      assignedPaths.add(skill.path)
      continue
    }

    const fallback = SLOT_ORDER.find((candidate) => !bySlot[candidate])
    if (fallback) {
      bySlot[fallback] = skill
      byPath[skill.path] = fallback
      assignedPaths.add(skill.path)
    }
  }

  return { byPath, bySlot }
}

function inferRegistryGearSlot(skill: RegistrySkill) {
  return inferGearSlotFromSource(`${skill.slug} ${skill.displayName} ${skill.summary ?? ''}`)
}

function deriveRegistrySkillRarity(
  skill: RegistrySkill,
  index: number,
  total: number,
  sort: BrowseSort,
): SkillRarityDetails {
  if (typeof skill.rating === 'number' && Number.isFinite(skill.rating) && skill.rating > 0) {
    const value = Math.max(0, Math.min(5, skill.rating))
    const tier = rarityFromRating(value)
    return {
      tier,
      label: SKILL_RARITY_LABELS[tier],
      metric: `${value.toFixed(1)} rating`,
    }
  }

  if (typeof skill.downloads === 'number' && Number.isFinite(skill.downloads) && skill.downloads > 0) {
    const value = Math.max(0, Math.floor(skill.downloads))
    const tier = rarityFromDownloads(value)
    return {
      tier,
      label: SKILL_RARITY_LABELS[tier],
      metric: `${COMPACT_NUMBER_FORMAT.format(value)} downloads`,
    }
  }

  if (typeof skill.score === 'number' && Number.isFinite(skill.score)) {
    const value = Math.round(skill.score)
    const tier = rarityFromScore(value)
    return {
      tier,
      label: SKILL_RARITY_LABELS[tier],
      metric: `Score ${value}`,
    }
  }

  if (sort === 'downloads' || sort === 'trending') {
    const tier = rarityFromMarketRank(index, total)
    return {
      tier,
      label: SKILL_RARITY_LABELS[tier],
      metric: `${sort === 'downloads' ? 'Popular' : 'Trending'} #${index + 1}`,
    }
  }

  return {
    tier: 'common',
    label: SKILL_RARITY_LABELS.common,
    metric: 'Market stock',
  }
}

function inferGearSlot(skill: InstalledSkill) {
  return inferGearSlotFromSource(`${skill.slug} ${skill.source} ${skill.security.summary}`)
}

function inferGearSlotFromSource(source: string): GearSlot {
  const normalized = source.toLowerCase()

  if (includesAny(normalized, ['shield', 'secure', 'guard', 'defend', 'protect', 'auth'])) {
    return 'shield'
  }

  if (includesAny(normalized, ['boot', 'step', 'route', 'deploy', 'travel', 'sync', 'move'])) {
    return 'boots'
  }

  if (includesAny(normalized, ['helm', 'head', 'crown', 'vision', 'watch', 'scan', 'search', 'scout'])) {
    return 'helm'
  }

  if (includesAny(normalized, ['weapon', 'blade', 'sword', 'strike', 'shell', 'execute', 'crawl', 'fetch'])) {
    return 'weapon'
  }

  if (includesAny(normalized, ['charm', 'trinket', 'prompt', 'format', 'note', 'chat', 'helper'])) {
    return 'charm'
  }

  return 'core'
}

function rarityFromRating(rating: number): SkillRarity {
  if (rating >= 4.8) {
    return 'legendary'
  }

  if (rating >= 4.4) {
    return 'epic'
  }

  if (rating >= 3.8) {
    return 'rare'
  }

  if (rating >= 2.8) {
    return 'common'
  }

  return 'junk'
}

function rarityFromDownloads(downloads: number): SkillRarity {
  const magnitude = Math.log10(Math.max(1, downloads))
  if (magnitude >= 5) {
    return 'legendary'
  }

  if (magnitude >= 4) {
    return 'epic'
  }

  if (magnitude >= 3) {
    return 'rare'
  }

  if (magnitude >= 2) {
    return 'common'
  }

  return 'junk'
}

function rarityFromScore(score: number): SkillRarity {
  if (score >= 92) {
    return 'legendary'
  }

  if (score >= 82) {
    return 'epic'
  }

  if (score >= 72) {
    return 'rare'
  }

  if (score >= 55) {
    return 'common'
  }

  return 'junk'
}

function rarityFromMarketRank(index: number, total: number): SkillRarity {
  if (total <= 1) {
    return 'common'
  }

  if (index === 0 && total >= 4) {
    return 'legendary'
  }

  const percentile = (index + 1) / Math.max(total, 1)
  if (percentile <= 0.18) {
    return 'epic'
  }

  if (percentile <= 0.45) {
    return 'rare'
  }

  if (percentile <= 0.82) {
    return 'common'
  }

  return 'junk'
}

function setTransferPayload(event: DragEvent<HTMLElement>, payload: DragTransferData) {
  event.dataTransfer.setData(DRAG_TRANSFER_KEY, JSON.stringify(payload))
  event.dataTransfer.setData('text/plain', serializeTransferPayload(payload))
}

function readTransferPayload(event: DragEvent<HTMLElement>): DragTransferData | null {
  const customRaw = event.dataTransfer.getData(DRAG_TRANSFER_KEY)
  if (customRaw) {
    try {
      return JSON.parse(customRaw) as DragTransferData
    } catch {
      // Fall through to the plain text payload.
    }
  }

  return deserializeTransferPayload(event.dataTransfer.getData('text/plain'))
}

function serializeTransferPayload(payload: DragTransferData) {
  return `claw-quest:${JSON.stringify(payload)}`
}

function deserializeTransferPayload(raw: string): DragTransferData | null {
  if (!raw.startsWith('claw-quest:')) {
    return null
  }

  try {
    return JSON.parse(raw.slice('claw-quest:'.length)) as DragTransferData
  } catch {
    return null
  }
}

function includesAny(source: string, keywords: readonly string[]) {
  return keywords.some((keyword) => source.includes(keyword))
}

function seedSlotPreferences(installed: InstalledSkill[], current: SlotPreferenceMap): SlotPreferenceMap {
  const installedSlugs = new Set(installed.map((skill) => skill.slug))
  const next: SlotPreferenceMap = {}
  const claimedSlots = new Set<GearSlot>()
  const claimedSlugs = new Set<string>()

  for (const [slug, slot] of Object.entries(current)) {
    if (!slot || !installedSlugs.has(slug)) {
      continue
    }

    if (claimedSlots.has(slot)) {
      continue
    }

    next[slug] = slot
    claimedSlots.add(slot)
    claimedSlugs.add(slug)
  }

  for (const slot of SLOT_ORDER) {
    if (claimedSlots.has(slot)) {
      continue
    }

    const candidates = installed.filter(
      (skill) => skill.status === 'ready' && !claimedSlugs.has(skill.slug) && inferGearSlot(skill) === slot,
    )

    if (candidates.length === 0) {
      continue
    }

    const selected = candidates[Math.floor(Math.random() * candidates.length)]
    next[selected.slug] = slot
    claimedSlots.add(slot)
    claimedSlugs.add(selected.slug)
  }

  return slotPreferenceMapsEqual(current, next) ? current : next
}

function slotPreferenceMapsEqual(left: SlotPreferenceMap, right: SlotPreferenceMap) {
  const leftEntries = Object.entries(left).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
  const rightEntries = Object.entries(right).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))

  if (leftEntries.length !== rightEntries.length) {
    return false
  }

  return leftEntries.every(([leftKey, leftValue], index) => {
    const [rightKey, rightValue] = rightEntries[index]
    return leftKey === rightKey && leftValue === rightValue
  })
}

function readSlotPreferences(): SlotPreferenceMap {
  try {
    const raw = window.localStorage.getItem(SLOT_STORAGE_KEY)
    if (!raw) {
      return {}
    }

    const parsed = JSON.parse(raw) as Record<string, GearSlot>
    return parsed ?? {}
  } catch {
    return {}
  }
}

function writeSlotPreferences(preferences: SlotPreferenceMap) {
  try {
    window.localStorage.setItem(SLOT_STORAGE_KEY, JSON.stringify(preferences))
  } catch {
    // Ignore storage write issues in restricted environments.
  }
}

function readOrCreateAgentRace(): AgentRace {
  try {
    const raw = window.localStorage.getItem(AGENT_RACE_STORAGE_KEY)
    if (raw && isAgentRace(raw)) {
      return raw
    }

    const rolled = AGENT_RACE_OPTIONS[Math.floor(Math.random() * AGENT_RACE_OPTIONS.length)] ?? 'human'
    window.localStorage.setItem(AGENT_RACE_STORAGE_KEY, rolled)
    return rolled
  } catch {
    return 'human'
  }
}

function rerollAgentRace(currentRace?: AgentRace): AgentRace {
  try {
    const pool = AGENT_RACE_OPTIONS.filter((race) => race !== currentRace)
    const nextRace = pool[Math.floor(Math.random() * pool.length)] ?? AGENT_RACE_OPTIONS[0] ?? 'human'
    window.localStorage.setItem(AGENT_RACE_STORAGE_KEY, nextRace)
    return nextRace
  } catch {
    return AGENT_RACE_OPTIONS.find((race) => race !== currentRace) ?? 'human'
  }
}

function isAgentRace(value: string): value is AgentRace {
  return AGENT_RACE_OPTIONS.includes(value as AgentRace)
}

function readAudioMuted() {
  try {
    return window.localStorage.getItem(AUDIO_MUTED_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function writeAudioMuted(muted: boolean) {
  try {
    if (muted) {
      window.localStorage.setItem(AUDIO_MUTED_STORAGE_KEY, '1')
    } else {
      window.localStorage.removeItem(AUDIO_MUTED_STORAGE_KEY)
    }
  } catch {
    // Ignore storage write issues in restricted environments.
  }
}

function readMobileDemoMode() {
  try {
    return window.localStorage.getItem(MOBILE_DEMO_MODE_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function writeMobileDemoMode(enabled: boolean) {
  try {
    if (enabled) {
      window.localStorage.setItem(MOBILE_DEMO_MODE_STORAGE_KEY, '1')
    } else {
      window.localStorage.removeItem(MOBILE_DEMO_MODE_STORAGE_KEY)
    }
  } catch {
    // Ignore storage write issues in restricted environments.
  }
}

function readQuestLogVisible() {
  try {
    return window.localStorage.getItem(QUEST_LOG_VISIBLE_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function writeQuestLogVisible(visible: boolean) {
  try {
    if (visible) {
      window.localStorage.setItem(QUEST_LOG_VISIBLE_STORAGE_KEY, '1')
    } else {
      window.localStorage.removeItem(QUEST_LOG_VISIBLE_STORAGE_KEY)
    }
  } catch {
    // Ignore storage write issues in restricted environments.
  }
}

function readQuestProgress() {
  try {
    const raw = window.localStorage.getItem(QUEST_PROGRESS_STORAGE_KEY)
    if (!raw) {
      return 0
    }

    const parsed = Number.parseInt(raw, 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  } catch {
    return 0
  }
}

function writeQuestProgress(questsCompleted: number) {
  try {
    window.localStorage.setItem(QUEST_PROGRESS_STORAGE_KEY, String(Math.max(0, Math.floor(questsCompleted))))
  } catch {
    // Ignore storage write issues in restricted environments.
  }
}

function cleanupLegacyClientState() {
  try {
    for (const key of [
      'claw-pg-slot-preferences-v1',
      'claw-pg-adventurer-race-v1',
      'claw-pg-adventurer-progress-v1',
      'clawhub-slot-preferences-v1',
      'clawhub-adventurer-race-v1',
      'clawhub-adventurer-progress-v1',
    ]) {
      window.localStorage.removeItem(key)
    }
  } catch {
    // Ignore storage cleanup issues in restricted environments.
  }
}

function questsNeededForNextLevel(level: number) {
  if (level >= 99) {
    return 0
  }

  const tier = Math.max(0, level - 1)
  return Math.max(2, Math.floor(2 + tier * 0.45 + (tier * tier) / 220))
}

function deriveAdventurerProgress(questsCompleted: number): AdventurerProgress {
  let level = 1
  let spentQuests = 0
  const totalCompleted = Math.max(0, Math.floor(questsCompleted))

  while (level < 99) {
    const cost = questsNeededForNextLevel(level)
    if (totalCompleted < spentQuests + cost) {
      break
    }

    spentQuests += cost
    level += 1
  }

  const questsForNextLevel = questsNeededForNextLevel(level)
  const questsIntoLevel = level >= 99 ? 0 : totalCompleted - spentQuests

  return {
    questsCompleted: totalCompleted,
    level,
    questsIntoLevel,
    questsForNextLevel,
    remainingToNextLevel: level >= 99 ? 0 : Math.max(0, questsForNextLevel - questsIntoLevel),
    isMaxLevel: level >= 99,
  }
}

function buildPartyAdventurers(
  jobs: OpenClawCronJob[],
  reservedCombo: { agentClass: AgentClass; agentRace: AgentRace },
): PartyAdventurer[] {
  const sortedJobs = [...jobs].sort((left, right) => compareCronJobsForDisplay(left, right))
  const allCombos = buildPartyComboPool(reservedCombo)
  const usedCombos = new Set<string>()

  return sortedJobs.map((job, index) => {
    const preferredClass = deriveCronJobClass(job)
    const preferredRace = deriveCronJobRace(job)
    const preferredKey = partyComboKey({ agentClass: preferredClass, agentRace: preferredRace })
    const preferredIndex = allCombos.findIndex((combo) => partyComboKey(combo) === preferredKey)
    const startIndex = preferredIndex >= 0 ? preferredIndex : hashQuestVoiceSeed(job.id) % Math.max(allCombos.length, 1)
    const combo = pickUniquePartyCombo(allCombos, usedCombos, startIndex, index)
    usedCombos.add(partyComboKey(combo))

    return {
      agentClass: combo.agentClass,
      agentRace: combo.agentRace,
      cadenceLabel: formatCronCadence(job.schedule),
      classLabel: `${RACE_LABELS[combo.agentRace]} ${CLASS_THEMES[combo.agentClass].label}`,
      dailyQuest: summarizeCronQuest(job),
      id: job.id,
      job,
      level: Math.max(0, job.runCount ?? 0),
      name: job.name?.trim() || 'Unnamed adventurer',
      statusLabel: formatCronJobStatus(job),
      statusTone: toneForCronJob(job),
    }
  })
}

function buildPartyComboPool(reservedCombo: { agentClass: AgentClass; agentRace: AgentRace }) {
  const classes: AgentClass[] = ['cleric', 'ranger', 'rogue', 'paladin']
  const combos = classes.flatMap((agentClass) =>
    AGENT_RACE_OPTIONS.map((agentRace) => ({
      agentClass,
      agentRace,
    })),
  )

  const reservedKey = partyComboKey(reservedCombo)
  return combos.filter((combo) => partyComboKey(combo) !== reservedKey)
}

function pickUniquePartyCombo(
  combos: Array<{ agentClass: AgentClass; agentRace: AgentRace }>,
  used: Set<string>,
  startIndex: number,
  fallbackSeed: number,
) {
  if (combos.length === 0) {
    return { agentClass: 'ranger' as AgentClass, agentRace: 'human' as AgentRace }
  }

  for (let offset = 0; offset < combos.length; offset += 1) {
    const combo = combos[(startIndex + offset) % combos.length] ?? combos[0]
    if (combo && !used.has(partyComboKey(combo))) {
      return combo
    }
  }

  return combos[fallbackSeed % combos.length] ?? combos[0] ?? { agentClass: 'ranger', agentRace: 'human' }
}

function partyComboKey(combo: { agentClass: AgentClass; agentRace: AgentRace }) {
  return `${combo.agentClass}:${combo.agentRace}`
}

function compareCronJobsForDisplay(left: OpenClawCronJob, right: OpenClawCronJob) {
  const leftRunning = left.state?.runningAtMs ?? 0
  const rightRunning = right.state?.runningAtMs ?? 0
  if (leftRunning !== rightRunning) {
    return rightRunning - leftRunning
  }

  if (left.enabled !== right.enabled) {
    return left.enabled ? -1 : 1
  }

  const leftNext = left.state?.nextRunAtMs ?? Number.MAX_SAFE_INTEGER
  const rightNext = right.state?.nextRunAtMs ?? Number.MAX_SAFE_INTEGER
  if (leftNext !== rightNext) {
    return leftNext - rightNext
  }

  return (left.name ?? left.id).localeCompare(right.name ?? right.id)
}

function deriveCronJobClass(job: OpenClawCronJob): AgentClass {
  const source = cronJobText(job).toLowerCase()
  const paladinKeywords = [
    ...AUTH_ERROR_KEYWORDS,
    'alert',
    'guard',
    'health',
    'monitor',
    'security',
    'watch',
  ]
  const rogueKeywords = ['backup', 'cleanup', 'deliver', 'delivery', 'digest', 'report', 'sweep']
  const scores: Array<[AgentClass, number]> = [
    ['cleric', keywordScore(source, [...DEV_KEYWORDS, ...FORGE_ERROR_KEYWORDS])],
    ['ranger', keywordScore(source, RANGER_KEYWORDS)],
    ['paladin', keywordScore(source, paladinKeywords)],
    ['rogue', keywordScore(source, rogueKeywords)],
  ]

  const sorted = [...scores].sort((left, right) => right[1] - left[1])
  if ((sorted[0]?.[1] ?? 0) > 0) {
    return sorted[0]?.[0] ?? 'ranger'
  }

  const classes: AgentClass[] = ['cleric', 'ranger', 'rogue', 'paladin']
  return classes[hashQuestVoiceSeed(job.id) % classes.length] ?? 'ranger'
}

function deriveCronJobRace(job: OpenClawCronJob): AgentRace {
  return AGENT_RACE_OPTIONS[hashQuestVoiceSeed(`${job.id}:${job.name ?? ''}`) % AGENT_RACE_OPTIONS.length] ?? 'human'
}

function cronJobText(job: OpenClawCronJob) {
  return [job.name, job.description, job.payload?.message].filter(Boolean).join(' ')
}

function summarizeCronQuest(job: OpenClawCronJob) {
  const source =
    job.description?.trim() ||
    job.payload?.message?.trim() ||
    job.name?.trim() ||
    'Await orders from the guild.'
  return summarizeQuestTextForLog(source, 168)
}

function toneForCronJob(job: OpenClawCronJob): Tone {
  if (job.state?.consecutiveErrors && job.state.consecutiveErrors > 0) {
    return 'danger'
  }

  const status = (job.state?.lastStatus ?? job.state?.lastRunStatus ?? '').trim().toLowerCase()
  if (['error', 'failed', 'failure'].includes(status)) {
    return 'danger'
  }

  if (job.state?.runningAtMs) {
    return 'warning'
  }

  if (!job.enabled) {
    return 'neutral'
  }

  if (['ok', 'success', 'completed'].includes(status)) {
    return 'clean'
  }

  return 'neutral'
}

function formatCronJobStatus(job: OpenClawCronJob) {
  if (job.state?.runningAtMs) {
    return 'Questing now'
  }

  if (!job.enabled) {
    return 'At camp'
  }

  if (job.state?.consecutiveErrors && job.state.consecutiveErrors > 0) {
    return `${job.state.consecutiveErrors} failed run${job.state.consecutiveErrors === 1 ? '' : 's'}`
  }

  const status = (job.state?.lastStatus ?? job.state?.lastRunStatus ?? '').trim().toLowerCase()
  if (status === 'ok' || status === 'success' || status === 'completed') {
    return 'Ready for next quest'
  }

  if (status === 'paused') {
    return 'Paused'
  }

  return 'Awaiting orders'
}

function formatCronCadence(schedule: OpenClawCronJob['schedule']) {
  if (!schedule) {
    return 'No schedule'
  }

  if (schedule.kind === 'cron') {
    return schedule.expr ? `Cron ${schedule.expr}` : 'Cron schedule'
  }

  const intervalMs = schedule.intervalMs ?? schedule.everyMs ?? null
  if (intervalMs) {
    return `Every ${formatCronDuration(intervalMs)}`
  }

  if (schedule.kind?.trim()) {
    return schedule.kind
  }

  return 'Scheduled'
}

function formatCronDuration(durationMs: number) {
  const totalSeconds = Math.max(1, Math.round(durationMs / 1000))
  if (totalSeconds < 60) {
    return `${totalSeconds}s`
  }

  const totalMinutes = Math.max(1, Math.round(durationMs / 60_000))
  if (totalMinutes < 60) {
    return `${totalMinutes}m`
  }

  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours < 24) {
    return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`
  }

  const days = Math.floor(hours / 24)
  const remainderHours = hours % 24
  return remainderHours === 0 ? `${days}d` : `${days}d ${remainderHours}h`
}

function formatPartyTimestamp(timestamp?: number | null) {
  if (!timestamp) {
    return 'Unscheduled'
  }

  return new Date(timestamp).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatPartyRunSummary(job: OpenClawCronJob) {
  if (job.state?.runningAtMs) {
    return `Started ${formatPartyTimestamp(job.state.runningAtMs)}`
  }

  const parts: string[] = []
  if (job.state?.lastRunStatus?.trim()) {
    parts.push(job.state.lastRunStatus)
  } else if (job.state?.lastStatus?.trim()) {
    parts.push(job.state.lastStatus)
  }

  if (job.state?.lastRunAtMs) {
    parts.push(formatPartyTimestamp(job.state.lastRunAtMs))
  }

  if (job.state?.lastDurationMs) {
    parts.push(formatCronDuration(job.state.lastDurationMs))
  }

  if (parts.length === 0) {
    return 'No run history yet'
  }

  return parts.join(' / ')
}

function formatReasonCode(code: string) {
  return code
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (value) => value.toUpperCase())
}

function formatQuestReplyForNotice(reply: string, agentClass: AgentClass, agentRace: AgentRace) {
  const normalized = reply.trim()

  if (!normalized) {
    return emptyQuestReplyForClass(agentClass, agentRace)
  }

  return normalized
}

function formatQuestCompletionNotice(
  reply: string,
  agentClass: AgentClass,
  agentRace: AgentRace,
  levelUpTo?: number | null,
) {
  const lines = [questCompletionLeadForReply(reply, agentClass, agentRace)]

  if (typeof levelUpTo === 'number' && Number.isFinite(levelUpTo)) {
    lines.push(`Level up! Lv. ${levelUpTo}.`)
  }

  const normalizedReply = reply.trim()
  if (normalizedReply) {
    lines.push(normalizedReply)
  }

  return lines.join('\n')
}

function questVoiceComboKey(agentClass: AgentClass, agentRace: AgentRace) {
  return `${agentClass}:${agentRace}`
}

function questActivityCategoryForPrompt(source: string): QuestActivityCategory {
  const normalized = source.toLowerCase()

  if (
    includesAny(normalized, [
      'write',
      'file',
      'files',
      'patch',
      'edit',
      'update',
      'create',
      'draft',
      'compose',
      'json',
      'markdown',
      'readme',
      'document',
      'docs',
      'commit',
      'save',
    ])
  ) {
    return 'writing'
  }

  if (
    includesAny(normalized, [
      'research',
      'investigate',
      'analysis',
      'analyze',
      'assess',
      'compare',
      'study',
      'feasibility',
      'look into',
      'review',
      'summarize',
      'find out',
      'inspect',
    ])
  ) {
    return 'research'
  }

  if (
    includesAny(normalized, [
      'internet',
      'web',
      'website',
      'online',
      'browse',
      'google',
      'movie times',
      'weather',
      'near me',
      'download',
      'fetch',
      'http',
      'https',
      'url',
      'link',
      'news',
      'api',
    ])
  ) {
    return 'internet'
  }

  if (
    includesAny(normalized, [
      'fight',
      'battle',
      'monster',
      'slay',
      'defeat',
      'kill',
      'dragon',
      'beast',
      'hunt',
      'combat',
      'quarry',
      'bug',
      'boss',
    ])
  ) {
    return 'combat'
  }

  return 'busywork'
}

function classifyQuestResponseType(reply: string): QuestResponseType {
  const normalized = reply.trim().toLowerCase()
  if (!normalized) {
    return 'completed'
  }

  if (
    normalized.includes('?') ||
    includesAny(normalized, [
      'permission',
      'clarify',
      'clarification',
      'need your',
      'need more',
      'please provide',
      'please confirm',
      'should i',
      'would you like',
      'which ',
      'what ',
      'where ',
      'when ',
      'how ',
      'approve',
      'approval',
      'confirm',
      'choose',
      'question',
      'before i continue',
    ])
  ) {
    return 'needs_input'
  }

  if (
    includesAny(normalized, [
      'cannot',
      "can't",
      'unable',
      'failed',
      'error',
      'blocked',
      'rejected',
      'refused',
      'missing',
      'denied',
      'could not',
      "couldn't",
      'timed out',
      'forbidden',
      'no access',
      'not possible',
      'unavailable',
    ])
  ) {
    return 'blocked'
  }

  return 'completed'
}

function looksLikeQuestAcknowledgement(reply: string) {
  const normalized = reply.trim().toLowerCase()
  if (!normalized || classifyQuestResponseType(reply) !== 'completed') {
    return false
  }

  return includesAny(normalized, [
    "i'll",
    'i will',
    'let me',
    'working on it',
    'on it',
    'looking into',
    'digging into',
    'checking now',
    'searching now',
    'gathering that',
    'give me a moment',
    'one moment',
    'hang tight',
    'stand by',
    'fetching that',
    'finding that',
    'i can do that',
    'will do',
    'right away',
  ])
}

function formatMobileQuestActivityStatus(status: string | null | undefined, waitingForApproval?: boolean) {
  if (waitingForApproval) {
    return 'Needs host approval'
  }

  const normalized = status?.trim().toLowerCase()
  if (!normalized) {
    return 'Quest in progress'
  }

  if (includesAny(normalized, ['running', 'active', 'working', 'busy'])) {
    return 'Quest underway'
  }
  if (includesAny(normalized, ['queued', 'pending'])) {
    return 'Awaiting return'
  }
  if (includesAny(normalized, ['blocked', 'error', 'failed'])) {
    return 'Quest impeded'
  }
  if (includesAny(normalized, ['done', 'completed', 'ended'])) {
    return 'Returning'
  }

  return 'Quest in progress'
}

function synthesizeMobileQuestActivitySummary(
  status: string | null | undefined,
  actorName: string,
  waitingForApproval?: boolean,
) {
  if (waitingForApproval) {
    return 'The task reached a host-side approval gate. OpenClaw needs confirmation before it can keep going.'
  }

  const normalized = status?.trim().toLowerCase()
  if (!normalized) {
    return ''
  }

  if (includesAny(normalized, ['running', 'active', 'working', 'busy'])) {
    return `${actorName} is still out in the field working through this quest.`
  }
  if (includesAny(normalized, ['queued', 'pending'])) {
    return `${actorName} has the quest in hand and is waiting on the next step.`
  }
  if (includesAny(normalized, ['blocked', 'error', 'failed'])) {
    return `${actorName} hit trouble on the trail and may need help from the host.`
  }
  if (includesAny(normalized, ['done', 'completed', 'ended'])) {
    return `${actorName} appears to be wrapping things up.`
  }

  return ''
}

function formatMobileQuestElapsed(startedAt: number, runtimeMs: number | null | undefined, now: number) {
  const elapsedMs = runtimeMs && runtimeMs > 0 ? runtimeMs : Math.max(0, now - startedAt)
  const totalSeconds = Math.max(1, Math.round(elapsedMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes > 0 ? `${minutes}m ${seconds.toString().padStart(2, '0')}s` : `${seconds}s`
}

function clampQuestBubbleText(text: string, mobileShell: boolean) {
  const normalized = text.trim().replace(/\s+/g, ' ')
  if (!normalized) {
    return ''
  }

  const maxChars = mobileShell ? 44 : 58
  if (normalized.length <= maxChars) {
    return normalized
  }

  const words = normalized.split(' ')
  let next = ''
  for (const word of words) {
    const candidate = next ? `${next} ${word}` : word
    if (candidate.length > maxChars) {
      break
    }
    next = candidate
  }

  const base = next || normalized.slice(0, maxChars)
  return `${base.trimEnd().replace(/[.,;:!?-]+$/u, '')}...`
}

function hashQuestVoiceSeed(source: string) {
  let hash = 0
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}

function rotateVoiceLines(lines: string[], seedSource: string, count: number) {
  if (lines.length === 0) {
    return []
  }

  const start = hashQuestVoiceSeed(seedSource) % lines.length
  const next: string[] = []
  const targetCount = Math.min(count, lines.length)
  for (let index = 0; index < targetCount; index += 1) {
    next.push(lines[(start + index) % lines.length] ?? lines[0] ?? '')
  }
  return next.filter(Boolean)
}

function pickVoiceLine(lines: string[], seedSource: string, fallback: string) {
  if (lines.length === 0) {
    return fallback
  }

  return lines[hashQuestVoiceSeed(seedSource) % lines.length] ?? fallback
}

function defaultQuestCompletionLead(agentClass: AgentClass, responseType: QuestResponseType) {
  switch (responseType) {
    case 'needs_input':
      switch (agentClass) {
        case 'paladin':
          return "I return for thy guidance before I proceed."
        case 'cleric':
          return 'I return with a question that asks thy judgment.'
        case 'ranger':
          return 'Trail splits here. I need your call.'
        case 'rogue':
          return 'Small snag. I need your word before I keep moving.'
      }
    case 'blocked':
      switch (agentClass) {
        case 'paladin':
          return 'I return with a barrier plainly named.'
        case 'cleric':
          return 'The work met troubled resistance, and I bring the obstacle plainly.'
        case 'ranger':
          return 'The trail is blocked, and here is why.'
        case 'rogue':
          return 'Locked tight. Here is the snag.'
      }
    default:
      switch (agentClass) {
        case 'paladin':
          return "I have completed my quest, m'lord."
        case 'cleric':
          return 'I have completed my quest in peace.'
        case 'ranger':
          return 'I have completed my quest and returned from the trail.'
        case 'rogue':
          return 'I have completed my quest and slipped back unseen.'
      }
  }
}

function questCompletionLeadForReply(reply: string, agentClass: AgentClass, agentRace: AgentRace) {
  const responseType = classifyQuestResponseType(reply)
  const lines = QUEST_VOICE_PACK.questReturnLeads[responseType] ?? []
  return pickVoiceLine(
    lines,
    `${questVoiceComboKey(agentClass, agentRace)}:${responseType}:${reply}`,
    defaultQuestCompletionLead(agentClass, responseType),
  )
}

function questDepartureBubble(
  prompt: string,
  agentClass: AgentClass,
  agentRace: AgentRace,
  connectionMode: ConnectionMode,
) {
  return buildQuestProgressBubbles(prompt, agentClass, agentRace, connectionMode)[0] ?? 'I am upon the task.'
}

function buildQuestProgressBubbles(
  prompt: string,
  agentClass: AgentClass,
  agentRace: AgentRace,
  connectionMode: ConnectionMode,
) {
  const comboKey = questVoiceComboKey(agentClass, agentRace)
  const activityCategory = questActivityCategoryForPrompt(prompt)
  const connectionLead = connectionModeProgressBubble(connectionMode)
  const comboBuckets = QUEST_VOICE_PACK.activityBubblesByCombo[comboKey]
  const selected = rotateVoiceLines(
    comboBuckets?.[activityCategory] ?? [],
    `${comboKey}:${activityCategory}:${connectionMode}:${prompt}`,
    4,
  )

  if (connectionLead) {
    return [connectionLead, ...selected]
  }

  return selected.length > 0 ? selected : [questGeneralBubbleForClass(agentClass)]
}

function formatQuestProgressEventBubble(
  progressEvent: QuestProgressEvent,
  prompt: string,
  agentClass: AgentClass,
  agentRace: AgentRace,
  connectionMode: ConnectionMode,
) {
  const progressBubbles = buildQuestProgressBubbles(prompt, agentClass, agentRace, connectionMode)

  switch (progressEvent.stage) {
    case 'remote-config':
      return connectionModeProgressBubble(connectionMode) ?? progressBubbles[0] ?? 'I make ready the road.'
    case 'runner-cached':
      return 'I know this road well and take the swifter path.'
    case 'runner-discovery':
      return 'I seek the surest road into the matter.'
    case 'runner-direct':
      return progressBubbles[0] ?? questGeneralBubbleForClass(agentClass)
    case 'gateway-fallback':
      return 'The first gate was barred. I seek another road through.'
    case 'gateway-health':
      return 'I test the old hinges before I knock again.'
    case 'runner-fallback':
      return 'Another road stands open. I press on at once.'
    case 'docker-direct':
      return 'I descend into the iron vessel without delay.'
    case 'docker-health':
      return 'I test the iron vessel for a true reply.'
    case 'docker-retry':
      return 'The iron vessel answers. I venture in once more.'
    case 'agent-working':
      return progressBubbles[1] ?? progressBubbles[0] ?? 'I am upon the task.'
    case 'agent-delayed':
      return progressBubbles[2] ?? progressBubbles[1] ?? progressBubbles[0] ?? 'I am still at work.'
    case 'agent-long-wait':
      return progressBubbles[3] ?? progressBubbles[2] ?? progressBubbles[1] ?? 'Still I press on.'
    case 'agent-output':
      return progressBubbles[4] ?? progressBubbles[3] ?? progressBubbles[2] ?? 'At last, the trail yields.'
    default:
      return null
  }
}

function formatQuestProgressEventLog(
  progressEvent: QuestProgressEvent,
  connectionMode: ConnectionMode,
  gatewayUrl: string,
  mobileShell: boolean,
): Omit<QuestLogEntry, 'id' | 'timestamp'> | null {
  switch (progressEvent.stage) {
    case 'remote-config':
      return {
        tone: 'neutral',
        title: 'Prepared the remote gateway profile',
        detail: `Using ${formatGatewayEndpointLabel(gatewayUrl)} for this quest.`,
      }
    case 'gateway-direct':
      return {
        tone: 'neutral',
        title: 'Sending the quest to the gateway',
        detail: mobileShell
          ? `The phone is calling ${formatGatewayEndpointLabel(gatewayUrl)} directly through the Tauri backend.`
          : `Claw Quest is sending the quest directly through ${formatGatewayEndpointLabel(gatewayUrl)}.`
      }
    case 'runner-cached':
      return {
        tone: 'neutral',
        title: 'Using the cached OpenClaw runner',
        detail: mobileShell
          ? 'Claw Quest is checking for a device-local runner before any gateway handoff.'
          : 'Claw Quest reused the last known working OpenClaw runner.',
      }
    case 'runner-discovery':
      return {
        tone: 'neutral',
        title: 'Looking for an OpenClaw runner',
        detail:
          connectionMode === 'remote'
            ? 'Remote mode still starts by locating a local OpenClaw runner.'
            : 'Searching the current machine for a usable OpenClaw command.',
      }
    case 'runner-direct':
      return {
        tone: 'neutral',
        title: 'Launching OpenClaw',
        detail:
          connectionMode === 'remote'
            ? 'Starting the local runner with the saved gateway profile.'
            : connectionMode === 'docker'
              ? 'Starting the Docker-backed OpenClaw runner.'
              : 'Starting the local OpenClaw runner directly.',
      }
    case 'gateway-fallback':
      return {
        tone: 'warning',
        title: 'Primary runner path failed',
        detail: 'Claw Quest is checking whether a gateway-backed fallback route can recover the quest.',
      }
    case 'gateway-health':
      return {
        tone: 'warning',
        title: 'Checking gateway health',
        detail:
          connectionMode === 'docker'
            ? 'Testing whether the Docker OpenClaw Gateway is actually up.'
            : `Testing whether ${formatGatewayEndpointLabel(gatewayUrl)} answers health checks.`,
      }
    case 'runner-fallback':
      return {
        tone: 'warning',
        title: 'Retrying through a fallback runner',
        detail: 'A different runner path looked viable, so Claw Quest is trying once more.',
      }
    case 'docker-direct':
      return {
        tone: 'neutral',
        title: 'Trying Docker transport',
        detail: 'Claw Quest is sending the quest through the configured Docker container.',
      }
    case 'docker-health':
      return {
        tone: 'warning',
        title: 'Checking Docker gateway health',
        detail: 'The first Docker attempt failed, so Claw Quest is probing the container gateway.',
      }
    case 'docker-retry':
      return {
        tone: 'warning',
        title: 'Retrying inside Docker',
        detail: 'The container answered health checks, so Claw Quest is attempting the quest again.',
      }
    case 'agent-working':
      return {
        tone: 'neutral',
        title: 'OpenClaw accepted the quest',
        detail: 'The agent process is running and Claw Quest is waiting for output.',
      }
    case 'agent-delayed':
      return {
        tone: 'warning',
        title: 'Still waiting for first output',
        detail: 'OpenClaw is running, but nothing readable has come back yet.',
      }
    case 'agent-long-wait':
      return {
        tone: 'warning',
        title: 'The quest is taking longer than usual',
        detail: 'Claw Quest is still connected and waiting for the agent to finish.',
      }
    case 'agent-output':
      return {
        tone: 'clean',
        title: 'OpenClaw started returning output',
        detail: 'The connection is alive and the agent has begun streaming a response.',
      }
    default:
      return null
  }
}

function shouldSurfaceQuestProgressStage(stage: QuestProgressEvent['stage']) {
  switch (stage) {
    case 'gateway-fallback':
    case 'docker-retry':
    case 'agent-delayed':
    case 'agent-long-wait':
    case 'agent-output':
      return true
    default:
      return false
  }
}

function shouldThrottleQuestProgressStage(stage: QuestProgressEvent['stage']) {
  switch (stage) {
    case 'agent-delayed':
    case 'agent-long-wait':
      return false
    default:
      return true
  }
}

function formatQuestErrorBubble(error: string, prompt: string, agentClass: AgentClass) {
  const normalized = error.trim().toLowerCase()
  const theme = classifyQuestTheme(`${prompt}\n${error}`)

  if (includesAny(normalized, AUTH_ERROR_KEYWORDS)) {
    return 'Mine seal of passage hath expired. I must sign in anew.'
  }

  if (includesAny(normalized, GATEWAY_ERROR_KEYWORDS)) {
    return 'The far gate is shut, and I cannot pass.'
  }

  if (
    normalized.includes('timeout') ||
    normalized.includes('did not respond within') ||
    normalized.includes('stopped waiting') ||
    normalized.includes('went silent') ||
    normalized.includes('gave no sign')
  ) {
    return 'I tarried overlong, and no answer came.'
  }

  if (normalized.includes('access is denied') || normalized.includes('forbidden') || normalized.includes('permission')) {
    return 'I am denied the key to that chamber.'
  }

  if (theme === 'texts') {
    return 'I am unfamiliar with these ancient texts.'
  }

  if (includesAny(normalized, FORGE_ERROR_KEYWORDS)) {
    return 'The forge doth spit sparks and protest.'
  }

  switch (agentClass) {
    case 'paladin':
      return "The quest was thwarted, m'lord."
    case 'cleric':
      return 'The work met troubled omens.'
    case 'ranger':
      return 'The trail went queer, and I found no sure path.'
    case 'rogue':
      return 'Bah. The job turned crooked.'
  }
}

function buildQuestAttemptLogEntries(
  prompt: string,
  connectionMode: ConnectionMode,
  gatewayUrl: string,
): Array<Omit<QuestLogEntry, 'id' | 'timestamp'>> {
  const entries: Array<Omit<QuestLogEntry, 'id' | 'timestamp'>> = [
    {
      tone: 'neutral',
      title: 'Quest queued',
      detail: summarizeQuestTextForLog(prompt, 120),
    },
    {
      tone: 'neutral',
      title: `Transport: ${formatConnectionModeLabel(connectionMode)}`,
      detail:
        connectionMode === 'remote'
          ? `Target: ${formatGatewayEndpointLabel(gatewayUrl)}`
          : connectionMode === 'docker'
            ? 'Routing the quest through the configured Docker container.'
            : 'Routing the quest through the local OpenClaw runner.',
    },
  ]

  return entries
}

function buildQuestFailureLogEntries({
  rawError,
  displayError,
  connectionMode,
  gatewayUrl,
}: {
  rawError: string
  displayError: string
  connectionMode: ConnectionMode
  gatewayUrl: string
}): Array<Omit<QuestLogEntry, 'id' | 'timestamp'>> {
  const entries: Array<Omit<QuestLogEntry, 'id' | 'timestamp'>> = [
    {
      tone: 'danger',
      title: 'Quest failed',
      detail:
        connectionMode === 'remote'
          ? `${displayError} Target: ${formatGatewayEndpointLabel(gatewayUrl)}`
          : displayError,
    },
  ]

  const normalizedRawError = rawError.trim()
  const normalizedDisplayError = displayError.trim()
  if (normalizedRawError && normalizedRawError !== normalizedDisplayError) {
    entries.push({
      tone: 'warning',
      title: 'Raw OpenClaw detail',
      detail: summarizeQuestTextForLog(normalizedRawError, 280),
    })
  }

  return entries
}

function formatMobileQuestUnavailableMessage(connectionMode: ConnectionMode, gatewayUrl: string) {
  if (connectionMode === 'remote') {
    return `Android could not send a live request to ${formatGatewayEndpointLabel(gatewayUrl)} from this session.`
  }

  if (connectionMode === 'docker') {
    return 'Android only sends live quests through Remote Gateway mode. No live Docker request was sent from the phone.'
  }

  return 'Android only sends live quests through Remote Gateway mode. No live local OpenClaw request was sent from the phone.'
}

function formatMobileQuestUnavailableReason(connectionMode: ConnectionMode) {
  if (connectionMode === 'remote') {
    return 'Reconnect the linked Remote Gateway session, then try the quest again.'
  }

  if (connectionMode === 'docker') {
    return 'Docker quest transport is not available from the Android shell. Switch to Remote Gateway mode.'
  }

  return 'The Android shell does not bundle a local OpenClaw CLI runner. Switch to Remote Gateway mode.'
}

function formatConnectionModeLabel(connectionMode: ConnectionMode) {
  switch (connectionMode) {
    case 'remote':
      return 'Remote Gateway'
    case 'docker':
      return 'Docker'
    default:
      return 'Local OpenClaw'
  }
}

function summarizeQuestTextForLog(text: string, maxLength: number) {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= maxLength) {
    return collapsed
  }

  return `${collapsed.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`
}

function formatQuestLogTimestamp(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function classifyQuestTheme(source: string) {
  const normalized = source.toLowerCase()

  if (includesAny(normalized, RANGER_KEYWORDS)) {
    return 'texts' as const
  }

  if (includesAny(normalized, [...AUTH_ERROR_KEYWORDS, 'credential', 'gateway', 'login', 'secure', 'security'])) {
    return 'wards' as const
  }

  if (includesAny(normalized, [...DEV_KEYWORDS, ...FORGE_ERROR_KEYWORDS, 'fix', 'repo'])) {
    return 'forge' as const
  }

  return 'general' as const
}

function questOutputBubbleForTheme(
  theme: ReturnType<typeof classifyQuestTheme>,
  agentClass: AgentClass,
) {
  switch (theme) {
    case 'texts':
      return 'These ancient texts yield a few marks at last.'
    case 'wards':
      return 'The wards answer, though grudgingly.'
    case 'forge':
      return 'The forge answers with sparks and clatter.'
    default:
      switch (agentClass) {
        case 'paladin':
          return "The matter doth stir, m'lord."
        case 'cleric':
          return 'The work begins to answer.'
        case 'ranger':
          return 'The trail is warming now.'
        case 'rogue':
          return 'Aye. I have a lead now.'
      }
  }
}

function questDelayBubbleForTheme(
  theme: ReturnType<typeof classifyQuestTheme>,
  agentClass: AgentClass,
) {
  switch (theme) {
    case 'texts':
      return 'These texts are dense indeed, yet I read on.'
    case 'wards':
      return 'The wards are stubborn, yet I keep at them.'
    case 'forge':
      return 'The forge is fussy work. I am still at it.'
    default:
      switch (agentClass) {
        case 'paladin':
          return "The road is longer than first it seemed, m'lord."
        case 'cleric':
          return 'The work is slow, yet steady.'
        case 'ranger':
          return 'The trail runs long, but I have not lost it.'
        case 'rogue':
          return 'It is a longer job than I was promised.'
      }
  }
}

function questLongWaitBubbleForTheme(
  theme: ReturnType<typeof classifyQuestTheme>,
  agentClass: AgentClass,
) {
  switch (theme) {
    case 'texts':
      return 'Still I sift these ancient leaves for useful signs.'
    case 'wards':
      return 'These old seals yield slowly, but they do yield.'
    case 'forge':
      return 'The forge is hot and stubborn still.'
    default:
      switch (agentClass) {
        case 'paladin':
          return "Still I labor for thee, m'lord."
        case 'cleric':
          return 'The task is not lost. It only asks more time.'
        case 'ranger':
          return 'I am yet on the trail.'
        case 'rogue':
          return 'Aye, aye. I am still working it.'
      }
  }
}

function connectionModeProgressBubble(connectionMode: ConnectionMode) {
  switch (connectionMode) {
    case 'remote':
      return 'I hail the far gate and set forth.'
    case 'docker':
      return 'I descend into the iron vessel.'
    default:
      return null
  }
}

function questForgeBubbleForClass(agentClass: AgentClass) {
  switch (agentClass) {
    case 'paladin':
      return "I make for the forge, m'lord."
    case 'cleric':
      return 'I go now to mend the craft.'
    case 'ranger':
      return 'I check the kit and mend what I can.'
    case 'rogue':
      return 'I am at the lock and hinges already.'
  }
}

function questGeneralBubbleForClass(agentClass: AgentClass) {
  switch (agentClass) {
    case 'paladin':
      return "By thy leave, m'lord, I am upon it."
    case 'cleric':
      return 'I go now, with patient hand.'
    case 'ranger':
      return 'I am on the trail.'
    case 'rogue':
      return 'Right. I am on it.'
  }
}

function buildCatalogCacheKey(config: ManagerConfig | undefined, query: string, sort: BrowseSort) {
  return JSON.stringify({
    connectionMode: config?.connectionMode ?? 'local',
    query: query.toLowerCase(),
    registry: config?.registry?.trim().toLowerCase() ?? '',
    sort,
  })
}

function readCatalogCache(cache: Map<string, CatalogCacheEntry>, key: string) {
  const cached = cache.get(key)
  if (!cached) {
    return null
  }

  if (Date.now() - cached.cachedAt > CATALOG_CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }

  return cached.items
}

function writeCatalogCache(cache: Map<string, CatalogCacheEntry>, key: string, items: RegistrySkill[]) {
  cache.set(key, {
    cachedAt: Date.now(),
    items,
  })

  if (cache.size <= CATALOG_CACHE_MAX_ENTRIES) {
    return
  }

  const oldestEntries = [...cache.entries()].sort(([, left], [, right]) => left.cachedAt - right.cachedAt)
  while (oldestEntries.length > CATALOG_CACHE_MAX_ENTRIES) {
    const [oldestKey] = oldestEntries.shift() ?? []
    if (!oldestKey) {
      break
    }
    cache.delete(oldestKey)
  }
}

function parseCatalogRateLimit(message: string) {
  const normalized = message.trim().toLowerCase()
  if (!normalized) {
    return null
  }

  if (!normalized.includes('too many requests') && !normalized.includes('rate limit')) {
    return null
  }

  const retryMatch = message.match(/try again in (\d+)s/i)
  const retryAfterMs = retryMatch
    ? Math.max(1, Number.parseInt(retryMatch[1] ?? '0', 10)) * 1000
    : CATALOG_RATE_LIMIT_FALLBACK_MS

  return { retryAfterMs }
}

function formatCatalogRateLimitMessage(retryAfterMs: number, query: string) {
  const retryLabel = formatCatalogRetryDelay(retryAfterMs)

  if (query) {
    return `The registry asked us to slow down while searching for "${query}". We'll try again in about ${retryLabel}.`
  }

  return `The registry asked us to slow down for a moment. We'll refresh the market again in about ${retryLabel}.`
}

function formatCatalogRetryDelay(retryAfterMs: number) {
  const totalSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000))
  if (totalSeconds < 60) {
    return `${totalSeconds}s`
  }

  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`
}

function validateGatewayDraftInput(
  draft: Pick<DraftConfig, 'gatewayUrl' | 'gatewayToken'>,
  options: { allowInsecureToken?: boolean } = {},
) {
  const gatewayUrl = draft.gatewayUrl.trim()
  if (!gatewayUrl) {
    return 'Enter your OpenClaw Gateway URL first.'
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(gatewayUrl)
  } catch {
    return 'The Gateway URL is not valid. Use a full address like wss://gateway.example.com or ws://192.168.1.20:18789.'
  }

  if (!['http:', 'https:', 'ws:', 'wss:'].includes(parsedUrl.protocol)) {
    return 'The Gateway URL must start with http://, https://, ws://, or wss://.'
  }

  if (
    draft.gatewayToken.trim() &&
    !options.allowInsecureToken &&
    !['https:', 'wss:'].includes(parsedUrl.protocol)
  ) {
    return 'Gateway tokens only work with a secure https:// or wss:// address.'
  }

  return null
}

function formatAndroidGatewayConnectionErrorMessage(
  detail: string,
  gatewayUrl: string | undefined,
  action: GatewayFailureAction,
) {
  const normalized = detail.trim().toLowerCase()
  const target = formatGatewayEndpointLabel(gatewayUrl)

  if (
    includesAny(normalized, [
      'openclaw http agent unable to connect',
      'http agent unable to connect',
      'unable to connect to the openclaw http agent',
      'unable to connect to openclaw',
      'agent unable to connect',
    ])
  ) {
    return `Claw Quest reached ${target}, but that gateway could not connect to OpenClaw on the gateway machine. Check the gateway host first: OpenClaw may not be running there, may need a fresh sign-in, or the gateway may be pointed at the wrong local agent address or port.`
  }

  if (
    includesAny(normalized, [
      'pairing approval',
      'pairing required',
      'needs pairing approval',
    ])
  ) {
    return `Claw Quest reached ${target}, but this phone still needs pairing approval on the gateway host before it can send quests.`
  }

  if (
    includesAny(normalized, [
      'device identity',
      'device signature',
      'device-auth handshake',
      'device auth',
    ])
  ) {
    return `Claw Quest reached ${target}, but the gateway rejected this phone during device authentication. If the gateway recently restarted or rotated auth settings, try again or re-pair this device from the gateway host.`
  }

  if (
    includesAny(normalized, [
      'origin not allowed',
      'allowedorigins',
      'allowed origins',
      'control ui',
      'handshake timeout',
      'closed before connect',
      'connect challenge timeout',
      'connect challenge missing nonce',
    ])
  ) {
    if (includesAny(normalized, ['origin not allowed', 'allowedorigins', 'allowed origins', 'control ui'])) {
      return `Claw Quest reached ${target}, but the gateway refused this connection because the request origin was not allowed. This usually means the gateway is applying Control UI origin rules to this route, or the tunnel/proxy is sending it through the wrong endpoint.`
    }

    return `Claw Quest reached ${target}, but the gateway websocket handshake never finished. That usually means the gateway closed the connection before this phone completed connect, often because it was restarting, the tunnel/proxy interrupted the websocket, or device auth was rejected early.`
  }

  return formatGatewayConnectionErrorMessage(detail, gatewayUrl, action)
}

function formatGatewayConnectionErrorMessage(
  detail: string,
  gatewayUrl: string | undefined,
  action: GatewayFailureAction,
) {
  const normalized = detail.trim().toLowerCase()
  const target = formatGatewayEndpointLabel(gatewayUrl)
  const actionPhrase =
    action === 'link' ? 'link to' : action === 'refresh' ? 'reach' : 'send the quest through'

  if (!normalized) {
    return `Claw Quest could not ${actionPhrase} ${target}. Check the Gateway URL, token, and that the gateway host is online.`
  }

  if (
    normalized.includes('chatcompletions.enabled') ||
    normalized.includes('http agent endpoint') ||
    normalized.includes('bearer token') ||
    normalized.includes('returned http ')
  ) {
    return detail.trim()
  }

  if (normalized.includes('enter a valid gateway url') || normalized.includes('gateway url must')) {
    return detail.trim()
  }

  if (
    includesAny(normalized, [
      'refresh_token_reused',
      're-authenticate',
      're authenticate',
      'sign in to openai codex again',
      'needs you to sign in to openai codex again',
    ])
  ) {
    return `Claw Quest reached ${target}, but OpenClaw behind that gateway needs a fresh OpenAI Codex sign-in. Re-authenticate on the gateway host, then try again.`
  }

  if (
    includesAny(normalized, [
      'unauthorized',
      'forbidden',
      'invalid token',
      'token required',
      'bad token',
      'http 401',
      'http 403',
      'status code 401',
      'status code 403',
    ])
  ) {
    return `Claw Quest reached ${target}, but the gateway rejected the token. Recopy the token or leave it blank if this gateway does not require one.`
  }

  if (
    includesAny(normalized, [
      'connection refused',
      'actively refused',
      'econnrefused',
      'closed before connect',
      'could not reach the saved openclaw gateway',
      'no running openclaw gateway found',
    ])
  ) {
    return `Nothing answered at ${target}. Make sure the OpenClaw Gateway is running, the port is correct, and this phone can reach that machine on the network.`
  }

  if (
    includesAny(normalized, [
      'timed out',
      'timeout',
      'handshake timeout',
      'gave no sign',
      'went silent',
      'stopped waiting',
    ])
  ) {
    return `Claw Quest found ${target}, but the connection timed out. The gateway may be offline, on the wrong port, or blocked by VPN, proxy, or firewall rules.`
  }

  if (
    includesAny(normalized, [
      'no such host',
      'could not resolve',
      'name or service not known',
      'failed to lookup address information',
      'enotfound',
      'dns',
    ])
  ) {
    return `This device could not find ${target}. Check the hostname spelling or use the gateway machine's local IP address instead.`
  }

  if (
    includesAny(normalized, [
      'certificate',
      'tls',
      'ssl',
      'self-signed',
      'unknown ca',
      'certificate verify failed',
    ])
  ) {
    return `This device could not trust ${target}. Use a valid HTTPS/WSS certificate on the gateway, or test without a token on a trusted local connection.`
  }

  if (
    includesAny(normalized, [
      'failovererror',
      'gateway unavailable',
      'errorcode=unavailable',
      'websocket',
      'socket',
      'unavailable',
    ])
  ) {
    return `Claw Quest could talk to ${target}, but the gateway could not open a working OpenClaw session. Check that the gateway itself is healthy and that OpenClaw behind it is actually running.`
  }

  if (
    includesAny(normalized, [
      'could not launch the openclaw command',
      'the system cannot find the file specified',
      'os error 2',
      'command not found',
    ])
  ) {
    return `Claw Quest reached the saved gateway settings, but OpenClaw was not available behind that gateway. Make sure the gateway host can actually launch OpenClaw before retrying.`
  }

  return `Claw Quest could not ${actionPhrase} ${target}. ${detail.trim()}`
}

function formatGatewayEndpointLabel(gatewayUrl?: string) {
  const trimmed = gatewayUrl?.trim()
  if (!trimmed) {
    return 'the saved OpenClaw Gateway'
  }

  try {
    const parsedUrl = new URL(trimmed)
    const path = parsedUrl.pathname && parsedUrl.pathname !== '/' ? parsedUrl.pathname : ''
    return `${parsedUrl.protocol}//${parsedUrl.host}${path}`
  } catch {
    return trimmed
  }
}

function returnedBubbleForReply(reply: string, agentClass: AgentClass, agentRace: AgentRace) {
  const responseType = classifyQuestResponseType(reply)
  const comboKey = questVoiceComboKey(agentClass, agentRace)
  return pickVoiceLine(
    QUEST_VOICE_PACK.returnBubblesByCombo[comboKey]?.[responseType] ?? [],
    `${comboKey}:${responseType}:bubble:${reply}`,
    emptyQuestReplyForClass(agentClass, agentRace),
  )
}

function emptyQuestReplyForClass(agentClass: AgentClass, agentRace: AgentRace) {
  const responseType: QuestResponseType = 'completed'
  const comboKey = questVoiceComboKey(agentClass, agentRace)
  const fallback = (() => {
    switch (agentClass) {
      case 'paladin':
        return "By thy leave, m'lord, the deed is done."
      case 'cleric':
        return 'Peace be with thee. The work now rests complete.'
      case 'ranger':
        return "Trail's clear. Job's done."
      case 'rogue':
        return 'Heh. Done and dusted.'
    }
  })()

  const comboLines = QUEST_VOICE_PACK.returnBubblesByCombo[comboKey]?.[responseType] ?? []
  if (comboLines.length > 0) {
    return comboLines[0] ?? fallback
  }

  switch (agentClass) {
    case 'paladin':
      return fallback
    case 'cleric':
      return fallback
    case 'ranger':
      return fallback
    case 'rogue':
      return fallback
  }
}

function leafName(path?: string | null) {
  if (!path) {
    return ''
  }

  const segments = path.split(/[\\/]/).filter(Boolean)
  return segments.at(-1) ?? path
}

function shortSkillName(slug: string) {
  return slug
    .split(/[-_]+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function joinWindowsPath(left: string, right: string) {
  return `${left.replace(/[\\\/]+$/, '')}\\${right.replace(/^[\\\/]+/, '')}`
}
