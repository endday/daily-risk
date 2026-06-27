import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchEventsByDate, fetchMarketTemperature } from '../services/api'
import type { CalendarEffects, MarketTemperatureResponse, RiskEvent } from '../services/api'
import type { HolidayEntry } from '../../../shared/types'
import { getMonday, getToday, dateShort, formatDateParts, offsetDate } from '../../../shared/date-utils'
export type TabName = 'overview' | 'events' | 'stats'

export function useHomePage() {
  const route = useRoute()
  const router = useRouter()
  const today = getToday()

  const dateEventsMap = ref<Record<string, RiskEvent[]>>({})
  const dateRiskMap = ref<Record<string, number>>({})
  const dateCalendarMap = ref<Record<string, CalendarEffects | null>>({})
  const holidayMap = ref<Record<string, HolidayEntry>>({})
  const temperature = ref<MarketTemperatureResponse | null>(null)
  const selectedDate = ref(today)
  const loadingDay = ref(false)
  const lastCalendar = ref<CalendarEffects | null>(null)
  const baseMonday = ref(getMonday(today))

  const displayDate = computed(() => formatDateParts(selectedDate.value))
  const displayWeekday = computed(() => {
    const { year, month, day } = displayDate.value
    return new Date(year, month - 1, day).getDay()
  })

  const activeTab = computed<TabName>(() => (route.params.tab as TabName) || 'overview')
  const calendar = computed(() => dateCalendarMap.value[selectedDate.value] ?? null)
  const selectedDayEvents = computed(() => dateEventsMap.value[selectedDate.value] || [])
  const topEvents = computed(() => selectedDayEvents.value.slice(0, 2))
  const selectedEvents = computed(() => dateEventsMap.value[selectedDate.value] || [])
  const selectedRisk = computed(() => dateRiskMap.value[selectedDate.value] || 0)
  const selectedCalendar = computed(() => dateCalendarMap.value[selectedDate.value] ?? lastCalendar.value)
  const shortRating = computed(() => calendar.value?.almanac?.short_term?.rating ?? null)
  const shortLabel = computed(() => calendar.value?.almanac?.short_term?.signal?.label ?? '--')
  const shortDesc = computed(() => calendar.value?.almanac?.short_term?.signal?.description ?? '--')
  const dailyCalendar = computed(() => calendar.value?.daily_calendar ?? [])
  const monthNames = ['', '1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
  const nextMonthName = computed(() => monthNames[displayDate.value.month % 12 + 1])
  const nextDayShort = computed(() => {
    const nextTradingDay = calendar.value?.next_trading_day
    return nextTradingDay?.date ? dateShort(nextTradingDay.date) : ''
  })

  const dateStrip = computed(() => {
    const labels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
    return labels.map((label, index) => {
      const date = offsetDate(baseMonday.value, index)
      const holiday = holidayMap.value[date]

      return {
        date,
        label,
        short: dateShort(date),
        isToday: date === today,
        isHoliday: index >= 5 ? true : Boolean(holiday && !holiday.is_trading_day),
        holidayName: holiday?.name || '',
      }
    })
  })

  function setTab(tab: TabName) {
    if (tab === 'overview') {
      router.push({ path: '/' })
      return
    }

    router.push({ name: 'home', params: { tab } })
  }

  async function fetchDateEvents(date: string) {
    if (dateEventsMap.value[date] !== undefined) return

    try {
      const data = await fetchEventsByDate(date)
      dateEventsMap.value[date] = data.events || []
      dateRiskMap.value[date] = data.risk_index || 0

      if (data.calendar_effects) {
        dateCalendarMap.value[date] = data.calendar_effects
        lastCalendar.value = data.calendar_effects
      }

      for (const holiday of data.holidays || []) {
        holidayMap.value[holiday.date] = holiday
      }
    } catch (error) {
      console.error(`Failed to fetch ${date}:`, error)
      dateEventsMap.value[date] = []
      dateRiskMap.value[date] = 0
    }
  }

  async function selectDate(date: string) {
    selectedDate.value = date
    loadingDay.value = true
    await fetchDateEvents(date)
    loadingDay.value = false
  }

  async function handleCalendarDateSelect(date: string) {
    await selectDate(date)
  }

  function changeWeek(offset: number) {
    const [year, month, day] = baseMonday.value.split('-').map(Number)
    const nextMonday = new Date(Date.UTC(year, month - 1, day + offset * 7))
    baseMonday.value = `${nextMonday.getUTCFullYear()}-${String(nextMonday.getUTCMonth() + 1).padStart(2, '0')}-${String(nextMonday.getUTCDate()).padStart(2, '0')}`
  }

  function goToday() {
    baseMonday.value = getMonday(today)
    void selectDate(today)
  }

  function goToDate(date: string) {
    baseMonday.value = getMonday(date)
    void selectDate(date)
  }

  onMounted(async () => {
    void fetchDateEvents(today)
    try {
      temperature.value = await fetchMarketTemperature()
    } catch (error) {
      console.error('Failed to fetch market temperature:', error)
    }
  })

  return {
    activeTab,
    baseMonday,
    calendar,
    changeWeek,
    dailyCalendar,
    dateRiskMap,
    dateStrip,
    displayDate,
    displayWeekday,
    fetchDateEvents,
    goToDate,
    goToday,
    handleCalendarDateSelect,
    holidayMap,
    lastCalendar,
    loadingDay,
    nextDayShort,
    nextMonthName,
    selectDate,
    selectedCalendar,
    selectedDate,
    selectedDayEvents,
    selectedEvents,
    selectedRisk,
    setTab,
    shortDesc,
    shortLabel,
    shortRating,
    temperature,
    today,
    topEvents,
  }
}
