/**
 * Gefährten (Phase 3b): reine Daten – fünf Arten mit je vier Stufen. Die Stufe richtet sich nach den aktiven Tagen
 * insgesamt (0 Jungtier · 1 Gefährte · 2 Erwachsen · 3 Legendär, ab 0 / 14 / 60 / 180 Tagen,
 * `BALANCING.companion.stageDays`); Logik, Schlaf und Bonus-Treffer stehen in `companion.ts`.
 *
 * Regeln (geprüft in `companionDefinitions.test.ts`):
 * - Schlüssel = `species` (steht im Profil – nie umbenennen), Reihenfolge wie `COMPANION_SPECIES`.
 * - Stufen-Namen stehen für sich, ohne Artikel, höchstens 28 Zeichen, eindeutig über alle Arten. Es sind Tier- und
 *   Fabelnamen – die sind für alle gleich, Sprachformen gibt es hier bewusst nicht (Wunsch des Spielers).
 * - Texte ohne Pronomen der dritten Person (er/sie/ihn …): Der Gefährte trägt einen selbst gewählten Namen, und die
 *   Stufen wechseln das grammatische Geschlecht (der Jungdrache, die Silbermaske) – so passt jeder Text zu jedem
 *   Namen. Kurze, verspielte Sätze wie aus einem Bestiarium: Stufen-Texte 1–2 Sätze, Persönlichkeit ein Satz.
 */
import type { CompanionDefinition, CompanionSpecies } from './types'

export const COMPANIONS: Record<CompanionSpecies, CompanionDefinition> = {
  dragon: {
    species: 'dragon',
    label: 'Drache',
    icon: '🐉',
    personality: 'Feurig, treu und ein kleines bisschen stolz – hütet deine guten Tage wie einen Goldschatz.',
    stages: [
      {
        name: 'Drachenei-Schlüpfling',
        description: 'Gerade erst aus dem Ei gepurzelt, mit einem Stück Schale noch auf dem Kopf. Niest kleine Funken, sobald dir etwas gelingt.',
      },
      {
        name: 'Jungdrache',
        description: 'Die Flügel tragen schon ein paar Meter weit, die Landungen sind noch Glückssache. Begleitet dich mit stolz geschwellter Brust.',
      },
      {
        name: 'Flammendrache',
        description: 'Schuppen wie poliertes Kupfer und ein Feueratem, der jeden Boss ins Schwitzen bringt. Wacht über deinen Hort aus guten Tagen.',
      },
      {
        name: 'Uralter Drache',
        description: 'Gewaltig wie ein Berg und weise wie die Zeit. Ziehen diese Schwingen über den Himmel, werden selbst die Bosse ehrfürchtig still.',
      },
    ],
  },
  raccoon: {
    species: 'raccoon',
    label: 'Waschbär',
    icon: '🦝',
    personality: 'Neugierig, verspielt und immer auf der Suche nach etwas Glänzendem – findet in jedem Tag einen kleinen Schatz.',
    stages: [
      {
        name: 'Wuselwicht',
        description: 'Ein Fellknäuel mit Maske, scheinbar überall zugleich. Wäscht gründlich alles, was in die Pfoten kommt – auch das, was längst sauber ist.',
      },
      {
        name: 'Glitzerpfote',
        description: 'Hat ein untrügliches Gespür für alles, was funkelt. Hortet Knöpfe, Murmeln und Kronkorken in einem streng geheimen Versteck.',
      },
      {
        name: 'Silbermaske',
        description: 'Flinke Pfoten, wache Augen und eine Maske wie aus Mondlicht. Kein Schloss und keine Truhe bleibt lange ein Geheimnis.',
      },
      {
        name: 'Waschbär der tausend Schätze',
        description: 'Von diesem Waschbären erzählt man sich in jeder Taverne. Das geheime Versteck ist inzwischen größer als manche Schatzkammer.',
      },
    ],
  },
  snake: {
    species: 'snake',
    label: 'Schlange',
    icon: '🐍',
    personality: 'Ruhig, geduldig und überraschend klug – weiß, dass jede Häutung ein Neuanfang ist.',
    stages: [
      {
        name: 'Schlängelchen',
        description: 'Kaum länger als ein Bleistift und schon schrecklich neugierig. Ringelt sich gern um dein Handgelenk und schaut beim Abhaken zu.',
      },
      {
        name: 'Ringelnatter',
        description: 'Die erste Häutung ist geschafft, die neue Haut glänzt wie frisch poliert. Gleitet lautlos voraus und findet jeden Pfad.',
      },
      {
        name: 'Jadeschlange',
        description: 'Schuppen wie grüner Edelstein und ein Blick, der bis auf den Grund schaut. Weiß genau: Mit Geduld gewinnt man am Ende jeden Kampf.',
      },
      {
        name: 'Weltenschlange',
        description: 'Lang genug, um die ganze Welt zu umarmen, und ruhig wie ein tiefer See. Jede abgestreifte Haut erzählt von einem gemeinsamen Stück Weg.',
      },
    ],
  },
  owl: {
    species: 'owl',
    label: 'Eule',
    icon: '🦉',
    personality: 'Nachdenklich, aufmerksam und sanft – sieht auch im Dunkeln, wie weit du schon gekommen bist.',
    stages: [
      {
        name: 'Flaumkäuzchen',
        description: 'Ein Federball mit riesigen Augen, der beim Nachdenken gern umkippt. Ruft ein leises „Schuhu“, wenn du eine Quest abhakst.',
      },
      {
        name: 'Nachtschwinge',
        description: 'Die ersten lautlosen Flüge durch die Dämmerung sind geschafft. Behält von oben alles im Blick – vor allem deine Serien.',
      },
      {
        name: 'Mondeule',
        description: 'Federn mit silbrigem Schimmer und ein Blick, dem nichts entgeht. Kennt die Schwäche jedes Bosses, noch bevor der Kampf beginnt.',
      },
      {
        name: 'Sternenuhu',
        description:
          'Schwingen wie der Nachthimmel, in den Augen funkeln ganze Sternbilder. Uralte Sagen erzählen von diesem Blick, der jetzt über deine Abenteuer wacht.',
      },
    ],
  },
  fox: {
    species: 'fox',
    label: 'Fuchs',
    icon: '🦊',
    personality: 'Schlau, verspielt und blitzschnell – findet immer einen Weg, auch wenn der Tag mal verzwickt ist.',
    stages: [
      {
        name: 'Fuchswelpe',
        description: 'Riesige Ohren, wuscheliger Schwanz und ständig zum Spielen aufgelegt. Springt vor Freude im Kreis, wenn dir etwas gelingt.',
      },
      {
        name: 'Spitzohr',
        description:
          'Die Ohren sind fast so groß wie der Mut. Hört schon von Weitem, wo ein Abenteuer raschelt, und schlägt flink einen Haken um jedes Hindernis.',
      },
      {
        name: 'Schlaufuchs',
        description: 'Kennt jede Abkürzung durch den Wald und jeden Trick gegen Bosse. Das Fell leuchtet wie Herbstlaub in der Abendsonne.',
      },
      {
        name: 'Neunschwänziger Fuchs',
        description: 'Neun Schwänze wie lodernde Flammen und ein Lächeln voller Geheimnisse. Wohin diese Pfoten treten, folgt das Glück – so sagen es die Legenden.',
      },
    ],
  },
}
