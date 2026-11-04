/**
 * Titel & Avatar-Rahmen (Phase 3a): reine Daten. Ob einer freigeschaltet ist, entscheidet `cosmetics.ts`;
 * welche Truhe was enthält, `chests.ts`.
 *
 * Regeln (geprüft in `cosmeticDefinitions.test.ts`):
 * - `id` ist stabil (steht in `CharacterProfile.titleId`/`frameId` und in `CosmeticUnlock`) – nie umbenennen.
 * - Titel stehen hinter dem Namen: „Aria, die Unbeugsame“ / „Aria, der Unbeugsame“ / „Aria, unbeugsamen Herzens“.
 *   Die neutrale Form trägt nie „die/der“ und ist trotzdem ein richtiger Titel: eine Wendung wie „ohne Furcht“,
 *   „guten Mutes“, „vom Schicksal erwählt“ oder ein Beiname, der für alle passt („Flammenherz“, „Kind des Phönix“).
 *   Höchstens 40 Zeichen.
 * - Bedingungen verweisen nur auf vorhandene Erfolge (`achievements/definitions.ts`) und Bosse (`bosses.ts`).
 *   Boss-Hinweise verraten den Namen nicht (das Bestiarium zeigt Unbekannte als Silhouette), nur ein Rätsel und das
 *   Thema – samt dem Weg zu ihm: Ein Boss erscheint in Wochen, in denen du sein Attribut am meisten trainierst
 *   (Thema = Attribut mit dem größten geplanten Schaden, `boss.ts`). Hinweise zu geheimen Erfolgen verraten weder Titel noch Bedingung im Detail.
 * - Truhen-Kosmetik (`condition: { type: 'chest' }`) muss laut Truhen-Regeln erreichbar sein: seltene Truhen geben
 *   Rahmen der Seltenheit `rare`, legendäre Truhen Titel oder Rahmen der Seltenheit `legendary`. Truhen-Titel sind
 *   deshalb immer legendär, Truhen-Rahmen selten oder legendär.
 * - Rahmen-Farben: Farbstopps für den Ring (Hex), abgestimmt auf das dunkle Braun-Schwarz und das Gold der App.
 * - Texte in Du-Form, für alle Sprachformen gleich (ohne „Held“, „Siegerin“ & Co.), deutsche Anführungszeichen.
 */
import type { ChestRarity, FrameDefinition, TitleDefinition } from '../types'

/** Anzeige der Seltenheiten (Truhen, Titel, Rahmen). */
export const RARITY_LABELS: Record<ChestRarity, string> = {
  common: 'Gewöhnlich',
  uncommon: 'Ungewöhnlich',
  rare: 'Selten',
  legendary: 'Legendär',
}

export const TITLES: TitleDefinition[] = [
  // --- Von Anfang an ------------------------------------------------------------------------------------------
  {
    id: 'daring',
    names: { female: 'die Wagemutige', male: 'der Wagemutige', neutral: 'guten Mutes' },
    condition: { type: 'always' },
    hint: 'Begleitet dich vom ersten Tag deines Abenteuers an.',
    rarity: 'common',
  },

  // --- Boss-Siege -----------------------------------------------------------------------------------------------
  {
    id: 'fearless',
    names: { female: 'die Furchtlose', male: 'der Furchtlose', neutral: 'ohne Furcht' },
    condition: { type: 'bossVictories', count: 1 },
    hint: 'Besiege deinen ersten Wochen-Boss.',
    rarity: 'common',
  },
  {
    id: 'monster-hunter',
    names: { female: 'Monsterjägerin', male: 'Monsterjäger', neutral: 'Albtraum der Ungeheuer' },
    condition: { type: 'bossVictories', count: 5 },
    hint: 'Besiege 5 Wochen-Bosse.',
    rarity: 'uncommon',
  },
  {
    id: 'beast-bane',
    names: { female: 'Bestienbezwingerin', male: 'Bestienbezwinger', neutral: 'Verderben der Bestien' },
    condition: { type: 'bossVictories', count: 10 },
    hint: 'Besiege 10 Wochen-Bosse.',
    rarity: 'rare',
  },
  {
    id: 'scourge-of-darkness',
    names: { female: 'Bezwingerin der Finsternis', male: 'Bezwinger der Finsternis', neutral: 'Geißel der Finsternis' },
    condition: { type: 'bossVictories', count: 25 },
    hint: 'Besiege 25 Wochen-Bosse.',
    rarity: 'legendary',
  },

  // --- Bestimmte Bosse (je Thema einer) ------------------------------------------------------------------------
  {
    id: 'cushion-breaker',
    names: { female: 'Polsterbrecherin', male: 'Polsterbrecher', neutral: 'Schrecken der Sofakissen' },
    condition: { type: 'bossDefeated', bossId: 'couch-golem' },
    hint: 'Besiege den Koloss aus Kissen und Kuscheldecken – er lauert, wenn du vor allem Stärke trainierst.',
    rarity: 'uncommon',
  },
  {
    id: 'well-read',
    names: { female: 'die Belesene', male: 'der Belesene', neutral: 'belesen bis in die Fingerspitzen' },
    condition: { type: 'bossDefeated', bossId: 'bookworm-golem' },
    hint: 'Besiege den Riesen aus ungelesenen Büchern – er lauert, wenn du vor allem Intelligenz trainierst.',
    rarity: 'uncommon',
  },
  {
    id: 'wolf-whisperer',
    names: { female: 'Wolfsflüsterin', male: 'Wolfsflüsterer', neutral: 'im Bunde mit den Wölfen' },
    condition: { type: 'bossDefeated', bossId: 'night-wolf' },
    hint: 'Besiege das Biest, das nachts deine Gedanken anheult – es lauert, wenn du vor allem Weisheit trainierst.',
    rarity: 'uncommon',
  },
  {
    id: 'sociable',
    names: { female: 'die Gesellige', male: 'der Gesellige', neutral: 'Herz jeder Runde' },
    condition: { type: 'bossDefeated', bossId: 'hermit-kraken' },
    hint: 'Besiege den Achtarmigen, der dich zu Hause festhält – er lauert, wenn du vor allem Charisma trainierst.',
    rarity: 'uncommon',
  },
  {
    id: 'dragon-tamer',
    names: { female: 'Drachenzähmerin', male: 'Drachenzähmer', neutral: 'von Drachen gefürchtet' },
    condition: { type: 'bossDefeated', bossId: 'sugar-dragon' },
    hint: 'Besiege den Drachen, der Süßes hortet – er lauert, wenn du vor allem Vitalität trainierst.',
    rarity: 'uncommon',
  },
  {
    id: 'go-getter',
    names: { female: 'die Tatkräftige', male: 'der Tatkräftige', neutral: 'voller Tatendrang' },
    condition: { type: 'bossDefeated', bossId: 'shadow-lord' },
    hint: 'Besiege den Fürsten, der alles auf später verschiebt – er lauert, wenn du vor allem Disziplin trainierst.',
    rarity: 'uncommon',
  },

  // --- Erfolge --------------------------------------------------------------------------------------------------
  {
    id: 'balanced',
    names: { female: 'die Vielseitige', male: 'der Vielseitige', neutral: 'im Einklang aller Kräfte' },
    condition: { type: 'achievement', achievementId: 'all-attributes-3' },
    hint: 'Bringe alle 6 Attribute auf mindestens Level 3 (Erfolg „Im Gleichgewicht“).',
    rarity: 'uncommon',
  },
  {
    id: 'flawless',
    names: { female: 'die Makellose', male: 'der Makellose', neutral: 'ohne Makel' },
    condition: { type: 'achievement', achievementId: 'perfect-days-30' },
    hint: 'Sammle 30 Perfekte Tage (Erfolg „Sternbild“).',
    rarity: 'uncommon',
  },
  {
    id: 'flame-keeper',
    names: { female: 'Hüterin der Flamme', male: 'Hüter der Flamme', neutral: 'Flammenherz' },
    condition: { type: 'achievement', achievementId: 'streak-100' },
    hint: 'Erreiche bei einer Quest einen Streak von 100 Tagen (Erfolg „Ewige Flamme“).',
    rarity: 'rare',
  },
  {
    id: 'thousand-deeds',
    names: { female: 'Heldin der tausend Taten', male: 'Held der tausend Taten', neutral: 'besungen in tausend Liedern' },
    condition: { type: 'achievement', achievementId: 'quests-1000' },
    hint: 'Erledige 1.000 Quests (Erfolg „Tausend Taten“).',
    rarity: 'rare',
  },
  {
    id: 'indomitable',
    names: { female: 'die Unbeugsame', male: 'der Unbeugsame', neutral: 'unbeugsamen Herzens' },
    condition: { type: 'achievement', achievementId: 'indomitable' },
    hint: 'Geheimer Erfolg: Wer fällt und wieder aufsteht, trägt diesen Titel zu Recht.',
    rarity: 'rare',
  },
  {
    id: 'phoenix',
    names: { female: 'Tochter des Phönix', male: 'Sohn des Phönix', neutral: 'Kind des Phönix' },
    condition: { type: 'achievement', achievementId: 'phoenix' },
    hint: 'Geheimer Erfolg: Manchmal beginnt die schönste Geschichte mit einer Rückkehr.',
    rarity: 'rare',
  },

  // --- Level ------------------------------------------------------------------------------------------------------
  {
    id: 'seasoned',
    names: { female: 'die Erfahrene', male: 'der Erfahrene', neutral: 'reich an Erfahrung' },
    condition: { type: 'level', level: 10 },
    hint: 'Erreiche Level 10.',
    rarity: 'common',
  },
  {
    id: 'living-legend',
    names: { female: 'die Legendäre', male: 'der Legendäre', neutral: 'Legende zu Lebzeiten' },
    condition: { type: 'level', level: 30 },
    hint: 'Erreiche Level 30 und damit den Rang Legende.',
    rarity: 'legendary',
  },

  // --- Gemeisterte Kampagnen ----------------------------------------------------------------------------------------
  {
    id: 'summit-seeker',
    names: { female: 'Gipfelstürmerin', male: 'Gipfelstürmer', neutral: 'über allen Gipfeln' },
    condition: { type: 'campaignsMastered', count: 1 },
    hint: 'Meistere deine erste Kampagne.',
    rarity: 'uncommon',
  },
  {
    id: 'hall-of-fame',
    names: { female: 'Herrin der Ruhmeshalle', male: 'Herr der Ruhmeshalle', neutral: 'Zierde der Ruhmeshalle' },
    condition: { type: 'campaignsMastered', count: 3 },
    hint: 'Meistere 3 Kampagnen.',
    rarity: 'rare',
  },

  // --- Nur aus legendären Truhen ------------------------------------------------------------------------------------
  {
    id: 'chosen-one',
    names: { female: 'die Auserwählte', male: 'der Auserwählte', neutral: 'vom Schicksal erwählt' },
    condition: { type: 'chest' },
    hint: 'Nur in einer legendären Truhe zu finden.',
    rarity: 'legendary',
  },
  {
    id: 'star-born',
    names: { female: 'die Sternengeborene', male: 'der Sternengeborene', neutral: 'aus Sternenstaub geboren' },
    condition: { type: 'chest' },
    hint: 'Nur in einer legendären Truhe zu finden.',
    rarity: 'legendary',
  },
  {
    id: 'timeless',
    names: { female: 'die Zeitlose', male: 'der Zeitlose', neutral: 'jenseits der Zeit' },
    condition: { type: 'chest' },
    hint: 'Nur in einer legendären Truhe zu finden.',
    rarity: 'legendary',
  },
]

export const FRAMES: FrameDefinition[] = [
  // --- Von Anfang an und nach Level -----------------------------------------------------------------------------
  {
    id: 'wanderwood',
    name: 'Wanderholz',
    condition: { type: 'always' },
    hint: 'Dein treuer Begleiter vom ersten Tag an.',
    rarity: 'common',
    colors: ['#5a3d22', '#9a6f45', '#c49a68', '#7a5432'],
  },
  {
    id: 'bronze',
    name: 'Bronzereif',
    condition: { type: 'level', level: 5 },
    hint: 'Erreiche Level 5.',
    rarity: 'common',
    colors: ['#7a4a22', '#b87333', '#e3a76f', '#8f5a2a'],
  },
  {
    id: 'silver',
    name: 'Silberreif',
    condition: { type: 'level', level: 12 },
    hint: 'Erreiche Level 12.',
    rarity: 'uncommon',
    colors: ['#6e7884', '#c9d1da', '#f2f5f8', '#97a2ae'],
  },
  {
    id: 'gold',
    name: 'Goldreif',
    condition: { type: 'level', level: 20 },
    hint: 'Erreiche Level 20.',
    rarity: 'rare',
    colors: ['#9c7834', '#d4a548', '#f0c96a', '#fff1c4'],
  },

  // --- Erfolge und Kampagnen ----------------------------------------------------------------------------------------
  {
    id: 'ember-wreath',
    name: 'Glutkranz',
    condition: { type: 'achievement', achievementId: 'streak-30' },
    hint: 'Erreiche bei einer Quest einen Streak von 30 Tagen (Erfolg „Ein ganzer Mond“).',
    rarity: 'uncommon',
    colors: ['#7a1f0e', '#c4452c', '#e8833a', '#f0c96a'],
  },
  {
    id: 'laurel',
    name: 'Lorbeerkranz',
    condition: { type: 'campaignsMastered', count: 2 },
    hint: 'Meistere 2 Kampagnen.',
    rarity: 'rare',
    colors: ['#3e5a2a', '#6f9a4c', '#a9c77a', '#d4a548'],
  },

  // --- Boss-Siege -----------------------------------------------------------------------------------------------
  {
    id: 'beast-fang',
    name: 'Bestienzahn',
    condition: { type: 'bossVictories', count: 3 },
    hint: 'Besiege 3 Wochen-Bosse.',
    rarity: 'uncommon',
    colors: ['#5c4a36', '#b8a27e', '#efe6d2', '#8a7558'],
  },
  {
    id: 'limelight',
    name: 'Rampenlicht',
    condition: { type: 'bossDefeated', bossId: 'stage-fright-wyrm' },
    hint: 'Besiege den Lindwurm, der die Bühne bewacht – er lauert, wenn du vor allem Charisma trainierst.',
    rarity: 'rare',
    colors: ['#7a2e4a', '#ec8fb0', '#f7d2df', '#d4a548'],
  },

  // --- Nur aus Truhen ---------------------------------------------------------------------------------------------
  {
    id: 'dragon-scale',
    name: 'Drachenschuppe',
    condition: { type: 'chest' },
    hint: 'Nur in einer seltenen Truhe zu finden.',
    rarity: 'rare',
    colors: ['#0f4a3c', '#2f8f6e', '#7fd1b0', '#d4a548'],
  },
  {
    id: 'moon-silver',
    name: 'Mondsilber',
    condition: { type: 'chest' },
    hint: 'Nur in einer seltenen Truhe zu finden.',
    rarity: 'rare',
    colors: ['#34465a', '#7f9bb3', '#a9c6db', '#eef4f8'],
  },
  {
    id: 'aurora',
    name: 'Nordlicht',
    condition: { type: 'chest' },
    hint: 'Nur in einer seltenen Truhe zu finden.',
    rarity: 'rare',
    colors: ['#1d5c55', '#5dbb7a', '#7fd1c7', '#a28bd8'],
  },
  {
    id: 'stardust',
    name: 'Sternenstaub',
    condition: { type: 'chest' },
    hint: 'Nur in einer legendären Truhe zu finden.',
    rarity: 'legendary',
    colors: ['#1b1440', '#5b4bb0', '#f0c96a', '#fff6dd', '#8f7ae0'],
  },
]
