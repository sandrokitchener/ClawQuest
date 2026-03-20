import {
  AlertTriangle,
  ArrowDownToLine,
  ChevronDown,
  ChevronRight,
  Code2,
  FolderOpen,
  Globe,
  HardDrive,
  LoaderCircle,
  MessageCircle,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Skull,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import {
  browseRegistrySkills,
  closeDesktopWindow,
  type ConnectionMode,
  installRegistrySkill,
  isTauriRuntime,
  loadManagerState,
  normalizeCommandError,
  searchRegistrySkills,
  sendOpenClawPrompt,
  setDesktopWindowDocked,
  uninstallRegistrySkill,
  type BrowseSort,
  type InstalledSkill,
  type InstalledSkillSecurity,
  type ManagerConfig,
  type ManagerState,
  type OpenClawTarget,
  type RegistrySkill,
  type SkillRoot,
} from './lib/tauri'

type AgentClass = 'cleric' | 'ranger' | 'rogue' | 'paladin'
type AgentRace = 'elf' | 'orc' | 'human' | 'halfling' | 'tiefling' | 'goblin'
type GearSlot = 'helm' | 'weapon' | 'shield' | 'core' | 'boots' | 'charm'
type SkillRarity = 'junk' | 'common' | 'rare' | 'epic' | 'legendary'
type DropZone = 'equip' | 'trash' | null
type Tone = 'clean' | 'warning' | 'danger' | 'neutral'
type QuestMood = 'idle' | 'busy' | 'returned'
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
const DRAG_TRANSFER_KEY = 'application/x-claw-quest-skill'
const AVATAR_SPEAKING_MS = 2600
const CATALOG_SEARCH_DEBOUNCE_MS = 420
const CATALOG_CACHE_TTL_MS = 60_000
const CATALOG_CACHE_MAX_ENTRIES = 18
const CATALOG_RATE_LIMIT_FALLBACK_MS = 30_000
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
  'fetch',
  'http',
  'internet',
  'scrape',
  'search',
  'site',
  'spider',
  'url',
  'web',
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

const PREVIEW_CATALOG: RegistrySkill[] = [
  {
    slug: 'repo-healer',
    displayName: 'Repo Healer',
    summary: 'Fixes common codebase breakage and nudges builds back into shape.',
    version: '1.4.2',
    updatedAt: previewTime(3),
    score: 88,
  },
  {
    slug: 'patch-cleric',
    displayName: 'Patch Cleric',
    summary: 'Focused on tests, release prep, dependency checks, and repo cleanup.',
    version: '2.0.1',
    updatedAt: previewTime(6),
    score: 93,
  },
  {
    slug: 'site-hawk',
    displayName: 'Site Hawk',
    summary: 'Searches docs, scrapes pages, and follows links for web-heavy tasks.',
    version: '0.9.7',
    updatedAt: previewTime(1),
    score: 76,
  },
  {
    slug: 'crawler-quiver',
    displayName: 'Crawler Quiver',
    summary: 'Multi-site search and crawl helper for internet-facing workflows.',
    version: '0.6.4',
    updatedAt: previewTime(10),
    score: 67,
  },
  {
    slug: 'shell-shadow',
    displayName: 'Shell Shadow',
    summary: 'Aggressive terminal automation with looser safety rails.',
    version: '0.3.8',
    updatedAt: previewTime(2),
    score: 54,
  },
]

const PREVIEW_INSTALLED: InstalledSkill[] = [
  createPreviewInstalled(
    PREVIEW_CATALOG[0],
    'C:\\Users\\Player\\OpenClawWorkspace\\skills\\repo-healer',
    'Workspace skills',
    {
      status: 'clean',
      summary: 'Registry scan found no known issues.',
      hasKnownIssues: false,
      hasScanResult: true,
      reasonCodes: [],
      scanners: [{ name: 'registry', status: 'clean', summary: 'Known-good release' }],
    },
  ),
  createPreviewInstalled(
    PREVIEW_CATALOG[1],
    'C:\\Users\\Player\\OpenClawWorkspace\\skills\\patch-cleric',
    'Workspace skills',
    {
      status: 'clean',
      summary: 'Security scan passed for the installed version.',
      hasKnownIssues: false,
      hasScanResult: true,
      reasonCodes: [],
      scanners: [{ name: 'llm', status: 'clean', summary: 'No obvious risky behavior' }],
    },
  ),
  createPreviewInstalled(
    PREVIEW_CATALOG[2],
    'C:\\Users\\Player\\OpenClawWorkspace\\skills\\site-hawk',
    'Workspace skills',
    {
      status: 'pending',
      summary: 'Scan queued for the installed version.',
      hasKnownIssues: false,
      hasScanResult: false,
      reasonCodes: ['scan_pending'],
      scanners: [{ name: 'registry', status: 'pending', summary: 'Awaiting scan result' }],
    },
  ),
]

export default function App() {
  const runtime = isTauriRuntime()
  const [managerState, setManagerState] = useState<ManagerState | null>(null)
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
  const [booted, setBooted] = useState(false)
  const [loadingState, setLoadingState] = useState(true)
  const [loadingCatalog, setLoadingCatalog] = useState(true)
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
  const [agentRace] = useState<AgentRace>(() => readOrCreateAgentRace())
  const [questsCompleted, setQuestsCompleted] = useState(() => readQuestProgress())
  const [isDocked, setIsDocked] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [questDraft, setQuestDraft] = useState('')
  const [questBubble, setQuestBubble] = useState('Send me on a quest!')
  const [questMood, setQuestMood] = useState<QuestMood>('idle')
  const [questBusy, setQuestBusy] = useState(false)
  const [questError, setQuestError] = useState('')
  const [avatarSpeaking, setAvatarSpeaking] = useState(false)
  const didInitRef = useRef(false)
  const catalogRequestRef = useRef(0)
  const catalogCacheRef = useRef<Map<string, CatalogCacheEntry>>(new Map())
  const dragPayloadRef = useRef<DragPayload>(null)
  const avatarSpeakingTimeoutRef = useRef<number | null>(null)
  const toolsPaneScrollFrameRef = useRef<number | null>(null)
  const shellViewportRef = useRef<HTMLElement | null>(null)
  const soundRefs = useRef<Partial<Record<UiSound, HTMLAudioElement>>>({})

  const state = managerState ?? EMPTY_STATE
  const installedSlugs = new Set(state.installed.map((skill) => skill.slug))
  const readySkills = state.installed.filter((skill) => skill.status === 'ready')
  const riskyCount = readySkills.filter((skill) => isRiskyStatus(skill.security.status)).length
  const derivedAgentClass = classifyAgentLoadout(state.installed)
  const displayedAgentClass = derivedAgentClass
  const displayedAgentRace = agentRace
  const classTheme = CLASS_THEMES[displayedAgentClass]
  const ClassIcon = classTheme.icon
  const adventurerName = state.agentName?.trim() || 'Adventurer'
  const gearLoadout = resolveGearLoadout(state.installed, slotPreferences)
  const equippedCount = SLOT_ORDER.filter((slot) => gearLoadout.bySlot[slot]).length
  const progress = deriveAdventurerProgress(questsCompleted)
  const installedKey = state.installed
    .map((skill) => `${skill.slug}:${skill.path}`)
    .sort()
    .join('|')
  const busy = loadingState || loadingCatalog || Boolean(workingSlug) || Boolean(removingPath) || questBusy
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
        await refreshState(undefined)
      } finally {
        setBooted(true)
      }
    })()
  }, [])

  useEffect(() => {
    if (!booted) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      void refreshCatalog(appliedConfig, searchText, sort)
    }, CATALOG_SEARCH_DEBOUNCE_MS)

    return () => window.clearTimeout(timeoutId)
  }, [appliedConfig, booted, searchText, sort])

  useEffect(() => {
    if (!booted || catalogCooldownUntil === null) {
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
  }, [appliedConfig, booted, catalogCooldownUntil, searchText, sort])

  useEffect(() => {
    writeSlotPreferences(slotPreferences)
  }, [slotPreferences])

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

    const handleMove = (event: MouseEvent) => {
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

    const handleUp = (event: MouseEvent) => {
      const target = resolveDropTargetAtPoint(event.clientX, event.clientY, manualDrag.payload)
      setManualDrag(null)
      void completeManualDrop(target, manualDrag.payload)
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    document.body.classList.add('skill-dragging')

    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
      document.body.classList.remove('skill-dragging')
    }
  }, [manualDrag])

  function playUiSound(sound: UiSound) {
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

  async function refreshState(nextConfig?: ManagerConfig) {
    setLoadingState(true)
    setError('')

    try {
      if (!runtime) {
        const nextState = buildPreviewManagerState(nextConfig, managerState?.installed ?? PREVIEW_INSTALLED)
        const nextDraft = mergeDraftWithState(nextState, nextConfig ? draftFromConfig(nextConfig) : draftConfig)
        setManagerState(nextState)
        setDraftConfig(nextDraft)
        setAppliedConfig(configFromDraft(nextDraft))
        return nextState
      }

      const nextState = await loadManagerState(nextConfig)
      const nextDraft = mergeDraftWithState(nextState, nextConfig ? draftFromConfig(nextConfig) : draftConfig)
      setManagerState(nextState)
      setDraftConfig(nextDraft)
      setAppliedConfig(configFromDraft(nextDraft))
      return nextState
    } catch (caughtError) {
      setError(normalizeCommandError(caughtError))
      return null
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
      if (!runtime) {
        const previewItems = buildPreviewCatalog(query, nextSort)
        if (requestId === catalogRequestRef.current) {
          setCatalog(previewItems)
          setCatalogIssue('')
          setCatalogCooldownUntil(null)
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
          setCatalogIssue('')
          setCatalogCooldownUntil(null)
          setError(message)
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
    const nextState = await refreshState(configFromDraft(nextDraft))
    if (nextState) {
      playUiSound('blip')
      setNotice(successMessage)
    }
  }

  async function handleRefresh() {
    const nextConfig = appliedConfig ?? configFromDraft(draftConfig)
    const nextState = await refreshState(nextConfig)
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
    const nextDocked = !isDocked
    setIsDocked(nextDocked)
    setSettingsOpen(false)
    setNotice(nextDocked ? 'Docked mode enabled.' : 'Full layout restored.')

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
    setQuestsCompleted(0)
    writeQuestProgress(0)
    setSettingsOpen(false)
    playUiSound('blip')
    setNotice('Adventurer progress reset to Lv. 1.')
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

  function beginManualDrag(
    event: ReactMouseEvent<HTMLElement>,
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

    if (!runtime) {
      setManagerState((current) => {
        const baseState = current ?? buildPreviewManagerState(configFromDraft(draftConfig), PREVIEW_INSTALLED)
        if (baseState.installed.some((item) => item.slug === skill.slug)) {
          return baseState
        }

        return {
          ...baseState,
          installed: [
            createPreviewInstalled(
              skill,
              joinWindowsPath(baseState.resolvedSkillsDir || 'C:\\Users\\Player\\OpenClawWorkspace\\skills', skill.slug),
              'Workspace skills',
              previewSecurityForSlug(skill.slug),
            ),
            ...baseState.installed,
          ],
        }
      })
      if (preferredSlot) {
        assignSkillToSlot(skill.slug, preferredSlot)
      }
      playUiSound('coin')
      setNotice(`Installed ${skill.slug} in preview mode.`)
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

    if (!runtime) {
      setManagerState((current) =>
        current
          ? {
              ...current,
              installed: current.installed.filter((item) => item.path !== skill.path),
            }
          : current,
      )
      playUiSound('blip')
      setNotice(`Removed ${skill.slug} in preview mode.`)
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

  return (
    <main
      className={`pixel-shell ${isDocked ? 'pixel-shell-docked' : ''} ${toolsOpen ? 'pixel-shell-tools-open' : ''}`}
      ref={shellViewportRef}
    >
      <section className={`game-screen ${isDocked ? 'game-screen-docked' : ''}`}>
        <header className="hud-bar">
          <div className="hud-brand" data-tauri-drag-region="" title="Drag window">
            <div className="brand-copy">
              <ClawQuestWordmark />
              <span>{runtime ? 'Desktop skill manager' : 'Browser preview'}</span>
            </div>
          </div>

          <div className="hud-stats">
            {!isDocked ? (
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
                      <button className="pixel-button settings-menu-action" disabled={busy} onClick={handleResetLevel} type="button">
                        Reset Level
                      </button>
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}
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
          <section className="board-pane inventory-pane">
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
                      draggable={false}
                      key={skill.slug}
                      onMouseDown={(event) => !installed && beginManualDrag(event, { kind: 'catalog', skill })}
                      onDragEnd={handleDragEnd}
                      onDragStart={(event) => handleCatalogDragStart(event, skill)}
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
              <div className={`portrait-card ${classTheme.cardClass}`}>
                <div className="portrait-speech">
                  <div className={`quest-bubble quest-bubble-${questMood}`}>{questBubble}</div>
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

                <form
                  className="quest-console"
                  onSubmit={async (event) => {
                    event.preventDefault()
                    const prompt = questDraft.trim()

                    if (!prompt) {
                      setQuestError('Enter a quest prompt first.')
                      return
                    }

                    setQuestBusy(true)
                    setQuestError('')
                    setQuestMood('busy')
                    setQuestBubble('Farewell.')
                    setAvatarSpeaking(false)
                    playUiSound('questSend')

                    if (!runtime) {
                      setQuestBubble('Desktop build required for live quests.')
                      setQuestMood('idle')
                      setNotice('Quest preview only in browser mode.')
                      setQuestBusy(false)
                      return
                    }

                    try {
                      const outcome = await sendOpenClawPrompt(appliedConfig, prompt)
                      const nextQuestCount = questsCompleted + 1
                      const previousLevel = progress.level
                      const nextProgress = deriveAdventurerProgress(nextQuestCount)
                      const replyNotice = formatQuestReplyForNotice(outcome.reply, displayedAgentClass)
                      setQuestsCompleted(nextQuestCount)
                      writeQuestProgress(nextQuestCount)
                      setQuestBubble(returnedBubbleForClass(displayedAgentClass))
                      setQuestMood('returned')
                      triggerAvatarSpeaking()
                      setQuestDraft('')
                      playUiSound(nextProgress.level > previousLevel ? 'levelUp' : 'goodNews')
                      setNotice(
                        nextProgress.level > previousLevel
                          ? `Level up! Lv. ${nextProgress.level}.\n${replyNotice}`
                          : replyNotice,
                      )
                    } catch (caughtError) {
                      const nextError = normalizeCommandError(caughtError)
                      setQuestError(nextError)
                      setQuestBubble(returnedBubbleForClass(displayedAgentClass))
                      setQuestMood('returned')
                      triggerAvatarSpeaking()
                    } finally {
                      setQuestBusy(false)
                    }
                  }}
                >
                  <label className="quest-field">
                    <span>Quest prompt</span>
                    <input
                      disabled={questBusy}
                      onChange={(event) => setQuestDraft(event.target.value)}
                      placeholder="Fix the build, scout the web, guard the repo..."
                      type="text"
                      value={questDraft}
                    />
                  </label>
                  <button className="pixel-button pixel-button-primary" disabled={questBusy} type="submit">
                    {questBusy ? <LoaderCircle className="spin" size={16} /> : <MessageCircle size={16} />}
                    {questBusy ? 'Sending' : 'Quest'}
                  </button>
                </form>

                {questError ? (
                  <div className="quest-error">
                    <AlertTriangle size={16} />
                    <span>{questError}</span>
                  </div>
                ) : null}
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
                    text="Pull skills in from the library."
                    title="Nothing equipped"
                  />
                ) : (
                  state.installed.map((skill) => {
                    const tone = toneForStatus(skill.status === 'missing' ? 'missing' : skill.security.status)
                    const removing = removingPath === skill.path

                    return (
                      <article
                        className={`slot-card slot-card-${tone}`}
                        draggable={false}
                        key={skill.path}
                        onMouseDown={(event) => !removing && beginManualDrag(event, { kind: 'installed', skill })}
                        onDragEnd={handleDragEnd}
                        onDragStart={(event) => handleInstalledDragStart(event, skill)}
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

function readStoredConnectionSettings(): Partial<DraftConfig> {
  try {
    const raw = window.localStorage.getItem(CONNECTION_SETTINGS_STORAGE_KEY)
    if (!raw) {
      return {}
    }

    const parsed = JSON.parse(raw) as Partial<DraftConfig>
    return {
      connectionMode:
        parsed.connectionMode === 'remote' || parsed.connectionMode === 'docker' ? parsed.connectionMode : 'local',
      gatewayUrl: typeof parsed.gatewayUrl === 'string' ? parsed.gatewayUrl : '',
      gatewayToken: '',
      dockerContainer: typeof parsed.dockerContainer === 'string' ? parsed.dockerContainer : '',
      dockerCommand: typeof parsed.dockerCommand === 'string' && parsed.dockerCommand.trim() ? parsed.dockerCommand : 'openclaw',
      dockerWorkdir: typeof parsed.dockerWorkdir === 'string' ? parsed.dockerWorkdir : '',
    }
  } catch {
    return {}
  }
}

function writeStoredConnectionSettings(draft: DraftConfig) {
  window.localStorage.setItem(
    CONNECTION_SETTINGS_STORAGE_KEY,
    JSON.stringify({
      connectionMode: draft.connectionMode,
      gatewayUrl: draft.gatewayUrl,
      dockerContainer: draft.dockerContainer,
      dockerCommand: draft.dockerCommand,
      dockerWorkdir: draft.dockerWorkdir,
    }),
  )
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

function buildPreviewCatalog(query: string, sort: BrowseSort) {
  const loweredQuery = query.trim().toLowerCase()
  const filtered = PREVIEW_CATALOG.filter((skill) => {
    if (!loweredQuery) {
      return true
    }

    const source = `${skill.slug} ${skill.displayName} ${skill.summary ?? ''}`.toLowerCase()
    return source.includes(loweredQuery)
  })

  return [...filtered].sort((left, right) => {
    if (sort === 'newest') {
      return (right.updatedAt ?? 0) - (left.updatedAt ?? 0)
    }

    return (right.score ?? 0) - (left.score ?? 0)
  })
}

function createPreviewInstalled(
  skill: RegistrySkill,
  path: string,
  rootLabel: string,
  security: Partial<InstalledSkillSecurity>,
): InstalledSkill {
  return {
    slug: skill.slug,
    version: skill.version,
    installedAt: previewTime(0),
    path,
    rootLabel,
    registry: 'https://clawhub.ai',
    source: skill.summary ?? skill.displayName,
    status: 'ready',
    security: {
      status: security.status ?? 'unknown',
      summary: security.summary ?? 'No preview scan result.',
      checkedAt: previewTime(0),
      hasKnownIssues: security.hasKnownIssues ?? false,
      hasScanResult: security.hasScanResult ?? true,
      reasonCodes: security.reasonCodes ?? [],
      model: null,
      virustotalUrl: null,
      versionContext: 'installed',
      sourceVersion: skill.version ?? null,
      matchesRequestedVersion: true,
      scanners: security.scanners ?? [],
    },
  }
}

function previewSecurityForSlug(slug: string): Partial<InstalledSkillSecurity> {
  if (slug.includes('shadow')) {
    return {
      status: 'suspicious',
      summary: 'Registry flagged this skill for manual review.',
      hasKnownIssues: true,
      hasScanResult: true,
      reasonCodes: ['manual_review'],
      scanners: [{ name: 'registry', status: 'suspicious', summary: 'Manual review required' }],
    }
  }

  if (slug.includes('hawk') || slug.includes('crawler')) {
    return {
      status: 'pending',
      summary: 'Scan queued for this install.',
      hasKnownIssues: false,
      hasScanResult: false,
      reasonCodes: ['scan_pending'],
      scanners: [{ name: 'registry', status: 'pending', summary: 'Awaiting scan result' }],
    }
  }

  return {
    status: 'clean',
    summary: 'Registry scan found no known issues.',
    hasKnownIssues: false,
    hasScanResult: true,
    reasonCodes: [],
    scanners: [{ name: 'registry', status: 'clean', summary: 'Known-good release' }],
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

function isAgentRace(value: string): value is AgentRace {
  return AGENT_RACE_OPTIONS.includes(value as AgentRace)
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

function formatReasonCode(code: string) {
  return code
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (value) => value.toUpperCase())
}

function formatQuestReplyForNotice(reply: string, agentClass: AgentClass) {
  const normalized = reply.trim()

  if (!normalized) {
    return emptyQuestReplyForClass(agentClass)
  }

  return normalized
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

function returnedBubbleForClass(agentClass: AgentClass) {
  switch (agentClass) {
    case 'paladin':
      return "I return, m'lord."
    case 'cleric':
      return 'I return in peace.'
    case 'ranger':
      return 'Back from the trail.'
    case 'rogue':
      return 'Back in one piece.'
  }
}

function emptyQuestReplyForClass(agentClass: AgentClass) {
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

function previewTime(daysAgo: number) {
  return Date.now() - daysAgo * 24 * 60 * 60 * 1000
}
