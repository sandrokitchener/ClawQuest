import { Volume2, VolumeX } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

const MOBILE_AUDIO_STORAGE_KEY = 'clawhub-mobile-background-music-muted-v1'
const MOBILE_AUDIO_MEDIA_QUERY = '(max-width: 960px), (hover: none) and (pointer: coarse)'
const MOBILE_AUDIO_URL = '/crpg-loop.wav'
const MOBILE_AUDIO_VOLUME = 0.14

export function MobileBackgroundMusic() {
  const [muted, setMuted] = useState(() => readStoredMuted())
  const [isMobile, setIsMobile] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const activatedRef = useRef(false)
  const isMobileRef = useRef(false)
  const mutedRef = useRef(muted)

  function startBackgroundMusic() {
    const audio = audioRef.current
    if (!audio || mutedRef.current || !isMobileRef.current || document.hidden || !activatedRef.current) {
      return
    }

    if (!audio.paused) {
      return
    }

    audio.volume = MOBILE_AUDIO_VOLUME
    void audio.play().catch(() => {})
  }

  function pauseBackgroundMusic() {
    audioRef.current?.pause()
  }

  useEffect(() => {
    mutedRef.current = muted
    writeStoredMuted(muted)

    if (muted) {
      pauseBackgroundMusic()
      return
    }

    startBackgroundMusic()
  }, [muted])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const mediaQuery = window.matchMedia(MOBILE_AUDIO_MEDIA_QUERY)
    const syncMobileState = () => {
      const nextIsMobile = mediaQuery.matches
      isMobileRef.current = nextIsMobile
      setIsMobile(nextIsMobile)
    }

    syncMobileState()
    mediaQuery.addEventListener('change', syncMobileState)
    return () => mediaQuery.removeEventListener('change', syncMobileState)
  }, [])

  useEffect(() => {
    if (!isMobile) {
      pauseBackgroundMusic()
      return
    }

    startBackgroundMusic()
  }, [isMobile])

  useEffect(() => {
    const audio = new Audio(MOBILE_AUDIO_URL)
    audio.preload = 'auto'
    audio.loop = true
    audio.volume = MOBILE_AUDIO_VOLUME
    audioRef.current = audio

    const activateAudio = () => {
      activatedRef.current = true
      startBackgroundMusic()
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        pauseBackgroundMusic()
        return
      }

      startBackgroundMusic()
    }

    window.addEventListener('pointerdown', activateAudio, { passive: true })
    window.addEventListener('keydown', activateAudio)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('pointerdown', activateAudio)
      window.removeEventListener('keydown', activateAudio)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      audio.pause()
      audio.src = ''
      audioRef.current = null
    }
  }, [])

  if (!isMobile) {
    return null
  }

  return (
    <button
      aria-label={muted ? 'Enable background music' : 'Mute background music'}
      aria-pressed={!muted}
      className="mobile-music-toggle"
      onClick={() => {
        activatedRef.current = true
        setMuted((current) => !current)
      }}
      type="button"
    >
      {muted ? <VolumeX className="h-4 w-4" aria-hidden="true" /> : <Volume2 className="h-4 w-4" aria-hidden="true" />}
      <span>{muted ? 'Music off' : 'Music on'}</span>
    </button>
  )
}

function readStoredMuted() {
  if (typeof window === 'undefined') {
    return false
  }

  try {
    return window.localStorage.getItem(MOBILE_AUDIO_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function writeStoredMuted(muted: boolean) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    if (muted) {
      window.localStorage.setItem(MOBILE_AUDIO_STORAGE_KEY, '1')
    } else {
      window.localStorage.removeItem(MOBILE_AUDIO_STORAGE_KEY)
    }
  } catch {
    // Ignore storage failures and keep the app interactive.
  }
}
