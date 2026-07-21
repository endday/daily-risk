import { computed, onMounted, onUnmounted, ref } from 'vue'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

interface NavigatorWithStandalone extends Navigator {
  standalone?: boolean
}

const installPrompt = ref<BeforeInstallPromptEvent | null>(null)
const isInstalled = ref(false)
const isIos = ref(false)
const isIosSafari = ref(false)

function detectEnvironment() {
  const navigatorWithStandalone = navigator as NavigatorWithStandalone
  const userAgent = navigator.userAgent
  const iPadDesktopMode = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1

  isIos.value = /iPad|iPhone|iPod/.test(userAgent) || iPadDesktopMode
  isIosSafari.value = isIos.value
    && /Safari/.test(userAgent)
    && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(userAgent)
  isInstalled.value = window.matchMedia('(display-mode: standalone)').matches
    || navigatorWithStandalone.standalone === true
}

export function usePwaInstall() {
  const handleBeforeInstallPrompt = (event: Event) => {
    event.preventDefault()
    installPrompt.value = event as BeforeInstallPromptEvent
  }

  const handleInstalled = () => {
    installPrompt.value = null
    isInstalled.value = true
  }

  onMounted(() => {
    detectEnvironment()
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)
  })

  onUnmounted(() => {
    window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.removeEventListener('appinstalled', handleInstalled)
  })

  const canInstall = computed(() => !isInstalled.value && (isIos.value || Boolean(installPrompt.value)))

  const requestInstall = async () => {
    if (isIos.value) return 'manual' as const
    if (!installPrompt.value) return 'unavailable' as const

    const prompt = installPrompt.value
    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    installPrompt.value = null
    return outcome
  }

  return {
    canInstall,
    isIosSafari,
    requestInstall,
  }
}
