/**
 * Formular „Belohnung“ (anlegen/bearbeiten): Werte, Prüfregeln und Umwandlung in einen `RewardDraft`.
 * Reine Funktionen – die Regeln entsprechen denen des Repositorys (`createReward`/`updateReward`).
 */
import { DEFAULT_REWARD_ICON, MAX_REWARD_PRICE } from '../../data/repository'
import type { RewardDraft } from '../../data/repository'
import type { Reward } from '../../domain/types'
import type { RewardSuggestion } from './rewardSuggestions'

export const REWARD_TITLE_MAX = 60
export const REWARD_DESCRIPTION_MAX = 200
export const REWARD_PRICE_MIN = 1
export const REWARD_PRICE_MAX = MAX_REWARD_PRICE
export const DEFAULT_REWARD_PRICE = 200
export { DEFAULT_REWARD_ICON }

/** Schnellauswahl für den Preis (Gold). */
export const REWARD_PRICE_PRESETS: readonly number[] = [100, 250, 500, 1000, 2500]

export interface RewardFormValues {
  icon: string
  title: string
  description: string
  /** `null` = leer. */
  price: number | null
  repeatable: boolean
}

export type RewardFormField = 'title' | 'description' | 'price'
export type RewardFormErrors = Partial<Record<RewardFormField, string>>

/** Reihenfolge der Felder im Formular (für „zum ersten Fehler springen“). */
export const REWARD_FIELD_ORDER: readonly RewardFormField[] = ['title', 'description', 'price']

/** Startwerte: die Belohnung, ein Vorschlag oder ein leeres Formular. */
export function initialRewardFormValues(reward?: Reward, suggestion?: RewardSuggestion): RewardFormValues {
  if (reward) {
    return {
      icon: reward.icon,
      title: reward.title,
      description: reward.description ?? '',
      price: reward.price,
      repeatable: reward.repeatable,
    }
  }
  if (suggestion) {
    return {
      icon: suggestion.icon,
      title: suggestion.title,
      description: suggestion.description,
      price: suggestion.price,
      repeatable: suggestion.repeatable,
    }
  }
  return { icon: DEFAULT_REWARD_ICON, title: '', description: '', price: DEFAULT_REWARD_PRICE, repeatable: true }
}

/** Prüft die Eingaben. Liefert je Feld eine deutsche Fehlermeldung (leeres Objekt = alles in Ordnung). */
export function validateRewardForm(values: RewardFormValues): RewardFormErrors {
  const errors: RewardFormErrors = {}
  const title = values.title.trim()
  if (title === '') errors.title = 'Bitte gib der Belohnung einen Namen.'
  else if (title.length > REWARD_TITLE_MAX)
    errors.title = `Der Name darf höchstens ${REWARD_TITLE_MAX} Zeichen lang sein.`

  if (values.description.trim().length > REWARD_DESCRIPTION_MAX) {
    errors.description = `Die Beschreibung darf höchstens ${REWARD_DESCRIPTION_MAX} Zeichen lang sein.`
  }

  const { price } = values
  if (price === null) errors.price = 'Bitte gib einen Preis ein.'
  else if (!Number.isInteger(price))
    errors.price = 'Der Preis muss eine ganze Zahl sein – Gold gibt es nur in ganzen Münzen.'
  else if (price < REWARD_PRICE_MIN || price > REWARD_PRICE_MAX) {
    errors.price = `Der Preis muss zwischen ${REWARD_PRICE_MIN.toLocaleString('de-DE')} und ${REWARD_PRICE_MAX.toLocaleString('de-DE')} Gold liegen.`
  }
  return errors
}

export function hasRewardErrors(errors: RewardFormErrors): boolean {
  return Object.values(errors).some((message) => message !== undefined)
}

/** Gültige Werte → Entwurf fürs Repository (getrimmt, leere Beschreibung entfällt). */
export function rewardDraftFromValues(values: RewardFormValues): RewardDraft {
  const description = values.description.trim()
  return {
    icon: values.icon.trim() || DEFAULT_REWARD_ICON,
    title: values.title.trim(),
    description: description === '' ? undefined : description,
    price: values.price ?? DEFAULT_REWARD_PRICE,
    repeatable: values.repeatable,
  }
}

export function sameRewardFormValues(a: RewardFormValues, b: RewardFormValues): boolean {
  return (
    a.icon === b.icon &&
    a.title === b.title &&
    a.description === b.description &&
    a.price === b.price &&
    a.repeatable === b.repeatable
  )
}

/**
 * Wie lange das Sparen bei bisherigem Tempo etwa dauert: Gold aus XP pro Abenteuertag. Erst ab dem dritten Tag
 * (davor sagt der Schnitt wenig) und nur mit verdientem Gold – sonst `undefined`.
 */
export function daysToEarn(price: number, goldFromXp: number, adventureDay: number): number | undefined {
  if (!Number.isFinite(price) || price <= 0 || adventureDay < 3 || goldFromXp <= 0) return undefined
  const perDay = goldFromXp / adventureDay
  return Math.max(1, Math.ceil(price / perDay))
}
