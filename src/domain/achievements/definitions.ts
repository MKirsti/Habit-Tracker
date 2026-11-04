/**
 * Erfolge (Phase 2a): reine Daten plus je eine reine `progress(stats)`-Funktion.
 *
 * Regeln für die Definitionen (geprüft in `definitions.test.ts`):
 * - `id` ist stabil (wird in `AchievementUnlock` gespeichert) und kebab-case. Stufen einer Reihe heißen
 *   `<reihe>-<zahl>` (z. B. `streak-7`, `streak-30`) – nie umbenennen, sonst gehen Freischaltungen verloren.
 * - `progress` liest nur `AchievementStats`, ist rein und in jedem Wert monoton (mehr erreicht ⇒ nie weniger
 *   Fortschritt). `target` ist fest. `current` wird auf `0 … target` begrenzt, damit eine Anzeige „7 / 7“ nie
 *   überläuft – freigeschaltet ist ein Erfolg, sobald `current ≥ target` (bzw. dauerhaft gespeichert).
 * - Reihenfolge: nach Kategorie (`ACHIEVEMENT_CATEGORY_ORDER`), darin nach Schwierigkeit (Bronze → Silber → Gold).
 * - Gold-Belohnung nach Stufe aus `BALANCING.achievementGold`. Ausnahmen: die zwei größten Ziele (ein Jahr Streak,
 *   drei gemeisterte Kampagnen) geben 300, die geheime „Glückszahl“ passend 77.
 * - Fortschritt (geprüft mit Spielständen aus Simulationen, siehe Test „Spieltempo“): In der ersten Woche fallen
 *   mehrere Bronze-Erfolge, Silber folgt nach Wochen bis Monaten, Gold ist ein Ziel für Monate bis Jahre. Bei
 *   ~50 Gold am Tag sind Bronze (25) ein halber Tag, Silber (75) anderthalb, Gold (200) vier Tage Spiel – ein
 *   Bonus, keine Hauptquelle (alle Erfolge zusammen ≈ 70 Tage Gold).
 * - Texte: Du-Form, deutsche Typografie, Zahlen wie in der UI (`1.000`). Die Beschreibung nennt das Ziel; bei
 *   geheimen Erfolgen (erst nach dem Freischalten sichtbar) feiert sie, was erreicht wurde.
 * - Titel möglichst geschlechtsneutral – Questlog wird von mehreren Held:innen gespielt.
 */
import { ATTRIBUTE_IDS } from '../attributes'
import { BALANCING } from '../balancing'
import type { AchievementCategory, AchievementDefinition, AchievementStats, AchievementTier } from '../types'

/** Anzeige-Reihenfolge der Kategorien (auch die Reihenfolge von `ACHIEVEMENTS`). */
export const ACHIEVEMENT_CATEGORY_ORDER: AchievementCategory[] = [
  'consistency',
  'diligence',
  'perfection',
  'campaigns',
  'growth',
  'treasury',
  'special',
]

export const ACHIEVEMENT_CATEGORY_LABELS: Record<AchievementCategory, string> = {
  consistency: 'Beständigkeit',
  diligence: 'Fleiß',
  perfection: 'Perfektion',
  campaigns: 'Kampagnen',
  growth: 'Wachstum',
  treasury: 'Schatzkammer',
  special: 'Besondere Momente',
}

export const ACHIEVEMENT_TIER_LABELS: Record<AchievementTier, string> = {
  bronze: 'Bronze',
  silver: 'Silber',
  gold: 'Gold',
}

const GOLD = BALANCING.achievementGold

/** Gold für die größten Erfolge (ein Jahr Streak, drei gemeisterte Kampagnen) – bewusst etwas mehr als Gold-Stufe. */
const LEGENDARY_GOLD = 300

/** Die geheime „Glückszahl“ (7.777 XP) zahlt passend 77 Gold – im Rahmen der Silber-Stufe. */
const LUCKY_GOLD = 77

/** Fortschritt „Wert erreicht Ziel“: current = Wert, begrenzt auf 0 … target (NaN zählt als 0). */
function reach(read: (stats: AchievementStats) => number, target: number): AchievementDefinition['progress'] {
  return (stats) => ({ current: Math.min(Math.max(read(stats) || 0, 0), target), target })
}

/** Höchstes Attribut-Level. */
function highestAttributeLevel(stats: AchievementStats): number {
  return Math.max(...ATTRIBUTE_IDS.map((id) => stats.attributeLevels[id] ?? 0))
}

/** Anzahl der Attribute mit mindestens diesem Level. */
function attributesAtLeast(stats: AchievementStats, level: number): number {
  return ATTRIBUTE_IDS.filter((id) => (stats.attributeLevels[id] ?? 0) >= level).length
}

export const ACHIEVEMENTS: AchievementDefinition[] = [
  // --- Beständigkeit: Streaks -------------------------------------------------------------------------------
  {
    id: 'streak-7',
    title: 'Erste Flamme',
    description: 'Erreiche bei einer Quest einen Streak von 7 Tagen. Aus dem Funken wird eine Flamme.',
    icon: '🔥',
    tier: 'bronze',
    category: 'consistency',
    goldReward: GOLD.bronze,
    progress: reach((s) => s.bestDayStreak, 7),
  },
  {
    id: 'week-streak-4',
    title: 'Woche um Woche',
    description: 'Erreiche bei einer Wochenquest einen Streak von 4 Wochen – einen ganzen Monat im Takt.',
    icon: '📅',
    tier: 'bronze',
    category: 'consistency',
    goldReward: GOLD.bronze,
    progress: reach((s) => s.bestWeekStreak, 4),
  },
  {
    id: 'streak-30',
    title: 'Ein ganzer Mond',
    description: 'Erreiche bei einer Quest einen Streak von 30 Tagen – von Vollmond zu Vollmond.',
    icon: '🌙',
    tier: 'silver',
    category: 'consistency',
    goldReward: GOLD.silver,
    progress: reach((s) => s.bestDayStreak, 30),
  },
  {
    id: 'week-streak-12',
    title: 'Eine ganze Jahreszeit',
    description: 'Erreiche bei einer Wochenquest einen Streak von 12 Wochen. Die Blätter fallen, du bleibst dran.',
    icon: '🍂',
    tier: 'silver',
    category: 'consistency',
    goldReward: GOLD.silver,
    progress: reach((s) => s.bestWeekStreak, 12),
  },
  {
    id: 'streak-100',
    title: 'Ewige Flamme',
    description: 'Erreiche bei einer Quest einen Streak von 100 Tagen. Dein Feuer brennt beständig.',
    icon: '🕯️',
    tier: 'gold',
    category: 'consistency',
    goldReward: GOLD.gold,
    progress: reach((s) => s.bestDayStreak, 100),
  },
  {
    id: 'week-streak-26',
    title: 'Sonnenwende',
    description: 'Erreiche bei einer Wochenquest einen Streak von 26 Wochen – ein halbes Jahr lang, Sommer wie Winter.',
    icon: '☀️',
    tier: 'gold',
    category: 'consistency',
    goldReward: GOLD.gold,
    progress: reach((s) => s.bestWeekStreak, 26),
  },
  {
    id: 'streak-365',
    title: 'Unsterblich',
    description: 'Erreiche bei einer Quest einen Streak von 365 Tagen. Legenden vergehen nicht.',
    icon: '👑',
    tier: 'gold',
    category: 'consistency',
    goldReward: LEGENDARY_GOLD,
    progress: reach((s) => s.bestDayStreak, 365),
  },

  // --- Fleiß: erledigte Quests, aktive Tage, Nebenquests ----------------------------------------------------
  {
    id: 'quests-10',
    title: 'Erste Schritte',
    description: 'Erledige 10 Quests. Jede große Reise beginnt mit einem Schritt.',
    icon: '👣',
    tier: 'bronze',
    category: 'diligence',
    goldReward: GOLD.bronze,
    progress: reach((s) => s.questsCompleted, 10),
  },
  {
    id: 'side-quests-1',
    title: 'Abseits des Weges',
    description: 'Erledige deine erste Nebenquest. Manchmal lohnt sich ein Umweg.',
    icon: '🧭',
    tier: 'bronze',
    category: 'diligence',
    goldReward: GOLD.bronze,
    progress: reach((s) => s.sideQuestsCompleted, 1),
  },
  {
    id: 'quests-100',
    title: 'Geschärfte Klinge',
    description: 'Erledige 100 Quests. Jede Tat schärft deine Klinge.',
    icon: '🗡️',
    tier: 'bronze',
    category: 'diligence',
    goldReward: GOLD.bronze,
    progress: reach((s) => s.questsCompleted, 100),
  },
  {
    id: 'side-quests-10',
    title: 'Das Schwarze Brett',
    description: 'Erledige 10 Nebenquests. Kein Aushang bleibt lange hängen.',
    icon: '📌',
    tier: 'bronze',
    category: 'diligence',
    goldReward: GOLD.bronze,
    progress: reach((s) => s.sideQuestsCompleted, 10),
  },
  {
    id: 'active-days-30',
    title: 'Stets zur Stelle',
    description: 'Erledige an 30 verschiedenen Tagen mindestens eine Quest. Auf dich ist Verlass.',
    icon: '🎒',
    tier: 'bronze',
    category: 'diligence',
    goldReward: GOLD.bronze,
    progress: reach((s) => s.activeDays, 30),
  },
  {
    id: 'quests-500',
    title: 'Eiserner Wille',
    description: 'Erledige 500 Quests. Geschmiedet Tag für Tag.',
    icon: '⚒️',
    tier: 'silver',
    category: 'diligence',
    goldReward: GOLD.silver,
    progress: reach((s) => s.questsCompleted, 500),
  },
  {
    id: 'side-quests-50',
    title: 'Liebling der Taverne',
    description: 'Erledige 50 Nebenquests. In jeder Taverne kennt man deinen Namen.',
    icon: '🍺',
    tier: 'silver',
    category: 'diligence',
    goldReward: GOLD.silver,
    progress: reach((s) => s.sideQuestsCompleted, 50),
  },
  {
    id: 'active-days-100',
    title: 'Hundert Tage unterwegs',
    description: 'Erledige an 100 verschiedenen Tagen mindestens eine Quest. Der Weg ist dein Zuhause.',
    icon: '🏕️',
    tier: 'silver',
    category: 'diligence',
    goldReward: GOLD.silver,
    progress: reach((s) => s.activeDays, 100),
  },
  {
    id: 'quests-1000',
    title: 'Tausend Taten',
    description: 'Erledige 1.000 Quests. Die Barden singen von dir.',
    icon: '⚔️',
    tier: 'gold',
    category: 'diligence',
    goldReward: GOLD.gold,
    progress: reach((s) => s.questsCompleted, 1000),
  },

  // --- Perfektion: Perfekte Tage ----------------------------------------------------------------------------
  {
    id: 'perfect-days-1',
    title: 'Makellos',
    description: 'Erledige an einem Tag alle Tagesquests – dein erster Perfekter Tag.',
    icon: '✨',
    tier: 'bronze',
    category: 'perfection',
    goldReward: GOLD.bronze,
    progress: reach((s) => s.perfectDays, 1),
  },
  {
    id: 'perfect-days-7',
    title: 'Sieben Sterne',
    description: 'Sammle 7 Perfekte Tage – für jeden einen Stern.',
    icon: '⭐',
    tier: 'bronze',
    category: 'perfection',
    goldReward: GOLD.bronze,
    progress: reach((s) => s.perfectDays, 7),
  },
  {
    id: 'perfect-days-30',
    title: 'Sternbild',
    description: 'Sammle 30 Perfekte Tage – genug für ein eigenes Sternbild.',
    icon: '🌟',
    tier: 'silver',
    category: 'perfection',
    goldReward: GOLD.silver,
    progress: reach((s) => s.perfectDays, 30),
  },
  {
    id: 'perfect-days-100',
    title: 'Sternenhimmel',
    description: 'Sammle 100 Perfekte Tage. Über dir leuchtet ein ganzer Himmel.',
    icon: '🌠',
    tier: 'gold',
    category: 'perfection',
    goldReward: GOLD.gold,
    progress: reach((s) => s.perfectDays, 100),
  },

  // --- Kampagnen: Kapitel, gemeisterte und gleichzeitige Kampagnen -----------------------------------------
  {
    id: 'chapters-1',
    title: 'Das erste Kapitel',
    description: 'Schließe dein erstes Kapitel einer Kampagne ab. Deine Geschichte beginnt.',
    icon: '📖',
    tier: 'bronze',
    category: 'campaigns',
    goldReward: GOLD.bronze,
    progress: reach((s) => s.chaptersCompleted, 1),
  },
  {
    // Bewusst kein Erfolg für „3 Kampagnen gleichzeitig“: Viele parallele Kampagnen sollen nicht belohnt werden
    // (Wunsch des Spielers – das stresst eher). Belohnt wird das Dranbleiben an Kapiteln.
    id: 'chapters-3',
    title: 'Der rote Faden',
    description: 'Schließe 3 Kapitel ab. Deine Geschichte nimmt Gestalt an.',
    icon: '🧵',
    tier: 'bronze',
    category: 'campaigns',
    goldReward: GOLD.bronze,
    progress: reach((s) => s.chaptersCompleted, 3),
  },
  {
    id: 'chapters-10',
    title: 'Die Chronik wächst',
    description: 'Schließe 10 Kapitel ab. Seite um Seite schreibst du deine eigene Saga.',
    icon: '🖋️',
    tier: 'silver',
    category: 'campaigns',
    goldReward: GOLD.silver,
    progress: reach((s) => s.chaptersCompleted, 10),
  },
  {
    id: 'campaigns-1',
    title: 'Erster Triumph',
    description: 'Meistere deine erste Kampagne: Schließe all ihre Kapitel ab.',
    icon: '🏰',
    tier: 'gold',
    category: 'campaigns',
    goldReward: GOLD.gold,
    progress: reach((s) => s.campaignsCompleted, 1),
  },
  {
    id: 'campaigns-3',
    title: 'Hallen des Ruhms',
    description: 'Meistere 3 Kampagnen. In deiner Ruhmeshalle hängen ihre Banner.',
    icon: '🏛️',
    tier: 'gold',
    category: 'campaigns',
    goldReward: LEGENDARY_GOLD,
    progress: reach((s) => s.campaignsCompleted, 3),
  },

  // --- Wachstum: Level und Attribute ------------------------------------------------------------------------
  {
    id: 'level-5',
    title: 'Auf Wanderschaft',
    description: 'Erreiche Level 5 und damit den Rang Wanderer. Die Straße liegt vor dir.',
    icon: '🥾',
    tier: 'bronze',
    category: 'growth',
    goldReward: GOLD.bronze,
    progress: reach((s) => s.level, 5),
  },
  {
    id: 'attribute-level-5',
    title: 'Erwachtes Talent',
    description: 'Bringe ein Attribut auf Level 5. Was in dir schlummert, regt sich.',
    icon: '🌱',
    tier: 'bronze',
    category: 'growth',
    goldReward: GOLD.bronze,
    progress: reach(highestAttributeLevel, 5),
  },
  {
    id: 'level-10',
    title: 'Zweistellig',
    description: 'Erreiche Level 10. Der Gipfel rückt näher.',
    icon: '⛰️',
    tier: 'silver',
    category: 'growth',
    goldReward: GOLD.silver,
    progress: reach((s) => s.level, 10),
  },
  {
    id: 'all-attributes-3',
    title: 'Im Gleichgewicht',
    description: 'Bringe alle 6 Attribute auf mindestens Level 3. Körper, Geist und Herz im Einklang.',
    icon: '⚖️',
    tier: 'silver',
    category: 'growth',
    goldReward: GOLD.silver,
    progress: reach((s) => attributesAtLeast(s, 3), ATTRIBUTE_IDS.length),
  },
  {
    id: 'attribute-level-10',
    title: 'Ausnahmetalent',
    description: 'Bringe ein Attribut auf Level 10. Aus dem Keimling ist ein Baum geworden.',
    icon: '🌳',
    tier: 'silver',
    category: 'growth',
    goldReward: GOLD.silver,
    progress: reach(highestAttributeLevel, 10),
  },
  {
    id: 'level-20',
    title: 'Champion',
    description: 'Erreiche Level 20 und damit den Rang Champion.',
    icon: '🏆',
    tier: 'gold',
    category: 'growth',
    goldReward: GOLD.gold,
    progress: reach((s) => s.level, 20),
  },

  // --- Schatzkammer: Einlösen und Gold-Verdienst ------------------------------------------------------------
  {
    id: 'purchases-1',
    title: 'Beim Händler',
    description: 'Löse deine erste Belohnung in der Schatzkammer ein. Gönn dir etwas!',
    icon: '🛍️',
    tier: 'bronze',
    category: 'treasury',
    goldReward: GOLD.bronze,
    progress: reach((s) => s.purchases, 1),
  },
  {
    id: 'gold-1000',
    title: 'Gefüllter Beutel',
    description: 'Verdiene mit deinen XP insgesamt 1.000 Gold. Der Beutel wird schwer.',
    icon: '💰',
    tier: 'bronze',
    category: 'treasury',
    goldReward: GOLD.bronze,
    progress: reach((s) => s.goldFromXp, 1000),
  },
  {
    id: 'purchases-10',
    title: 'Wohlverdient',
    description: 'Löse 10 Belohnungen in der Schatzkammer ein. Du weißt, wie man Erfolge feiert.',
    icon: '🎁',
    tier: 'silver',
    category: 'treasury',
    goldReward: GOLD.silver,
    progress: reach((s) => s.purchases, 10),
  },
  {
    id: 'gold-10000',
    title: 'Drachenhort',
    description: 'Verdiene mit deinen XP insgesamt 10.000 Gold – ein Hort, um den dich Drachen beneiden.',
    icon: '🐉',
    tier: 'gold',
    category: 'treasury',
    goldReward: GOLD.gold,
    progress: reach((s) => s.goldFromXp, 10000),
  },

  // --- Besondere Momente (geheim) ---------------------------------------------------------------------------
  {
    id: 'phoenix',
    title: 'Phönix',
    description: 'Nach einer Pause von mindestens 7 Tagen hast du wieder eine Quest erledigt. Willkommen zurück!',
    icon: '🪶',
    tier: 'silver',
    category: 'special',
    goldReward: GOLD.silver,
    secret: true,
    progress: reach((s) => s.comebacks, 1),
  },
  {
    id: 'lucky-7777',
    title: 'Glückszahl',
    description: 'Du hast 7.777 XP gesammelt. Wenn das kein gutes Omen ist!',
    icon: '🍀',
    tier: 'silver',
    category: 'special',
    goldReward: LUCKY_GOLD,
    secret: true,
    progress: reach((s) => s.totalXp, 7777),
  },
  {
    id: 'adventure-days-365',
    title: 'Ein Jahr Abenteuer',
    description: 'Tag 365 deines Abenteuers – ein ganzes Jahr! Auf das nächste.',
    icon: '🗺️',
    tier: 'gold',
    category: 'special',
    goldReward: GOLD.gold,
    secret: true,
    progress: reach((s) => s.adventureDay, 365),
  },
]

const BY_ID = new Map(ACHIEVEMENTS.map((achievement) => [achievement.id, achievement]))

/** Definition zu einer gespeicherten ID (z. B. aus `AchievementUnlock`); unbekannte IDs → undefined. */
export function getAchievement(id: string): AchievementDefinition | undefined {
  return BY_ID.get(id)
}
