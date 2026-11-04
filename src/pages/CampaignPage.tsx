import { Archive, Landmark, Pencil, Plus } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useGameContext } from '../app/gameContext'
import { restoreMainQuest, updateMainQuest } from '../data/repository'
import { installBlueprint } from '../data/seed'
import type { AdventureChoice } from '../data/seed'
import { BALANCING } from '../domain/balancing'
import { isCampaignActive } from '../domain/campaigns'
import { hallOfFame } from '../domain/hallOfFame'
import type { Chapter, Habit, MainQuest, MainQuestState } from '../domain/types'
import { activeSlotsText, freeSlotsText } from '../features/blueprints'
import { campaignColor } from '../features/campaignTheme'
import { Button, Card, PageHeader, SectionTitle, SegmentedControl, Select, formatNumber, useMediaQuery, useToast } from '../ui'
import { ArchiveCampaignDialog } from './campaign/ArchiveCampaignDialog'
import { ArchivedCampaigns } from './campaign/ArchivedCampaigns'
import { CampaignBanner } from './campaign/CampaignBanner'
import { CampaignFormDialog } from './campaign/CampaignFormDialog'
import { CampaignStarter } from './campaign/CampaignStarter'
import { CampaignVictory } from './campaign/CampaignVictory'
import { HallOfFame } from './campaign/HallOfFame'
import { isArchived } from './campaign/campaignText'
import { campaignEditLoss, campaignEditLossText } from './campaign/campaignXp'
import { ChapterFormDialog } from './campaign/ChapterFormDialog'
import { ChapterTimeline } from './campaign/ChapterTimeline'
import { errorMessage } from './campaign/errors'
import { LinkedQuests } from './campaign/LinkedQuests'

/** Kapitel-Dialog direkt aus der Zeitleiste: bearbeiten (mit Kapitel) oder neu anlegen. */
interface ChapterTarget {
  questId: string
  chapter?: Chapter
  number: number
}

/** Was die Seite gerade zeigt: eine Kampagne oder die Bibliothek zum Beginnen (`starter`). */
interface ShownView {
  shown: MainQuestState | undefined
  starter: boolean
}

/**
 * Wohin der Fokus nach einer Aktion springt, die erst mit den nächsten Live-Daten sichtbar wird:
 * - heading: nach Beginnen/Anlegen/Beenden/Zurückholen/Löschen einer Kampagne die Überschrift der gezeigten
 *   Kampagne (bzw. der Bibliothek), sobald `ready` für die gezeigte Ansicht zutrifft;
 * - addChapter: nach dem Löschen eines Kapitels „Kapitel hinzufügen“ (die Zeile ist ja weg).
 */
interface FocusWish {
  target: 'heading' | 'addChapter'
  ready: (view: ShownView) => boolean
}

/** Parameter der gewählten Kampagne: `/kampagne?id=<questId>` (Dashboard-Karten verlinken so). */
const CAMPAIGN_PARAM = 'id'
/** `/kampagne?neu=1` zeigt die Bibliothek, um eine weitere Kampagne zu beginnen. */
const NEW_PARAM = 'neu'

/**
 * Zuletzt ausdrücklich gewählte Kampagne (Adresse oder Auswahl) – für `/kampagne` ohne Parameter, z. B.
 * über die Navigation. Bewusst nur im Speicher: Sie gilt für die laufende Sitzung.
 */
let rememberedCampaignId: string | null = null

/**
 * Kampagne (`/kampagne`): das große Ziel mit seinen Kapiteln als Questkarte. Ohne laufende Kampagne (und mit
 * `?neu=1`) zeigt sie die Kampagnen-Bibliothek samt eigener Kampagne; bis zu `BALANCING.maxActiveCampaigns`
 * Kampagnen laufen gleichzeitig. Darunter die Ruhmeshalle (alle gemeisterten Kampagnen mit ihrer Bilanz) und die
 * beendeten & gemeisterten Kampagnen zum Zurückholen.
 * Die gezeigte Kampagne steht in der Adresse (`?id=`), damit Zurück und Links sie behalten.
 */
export function CampaignPage() {
  const { data, today, state } = useGameContext()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const chaptersTitleId = useId()

  const campaigns = state.mainQuests
  // Wären die Segmente zu schmal für die Titel, kommt die Auswahlliste: bei zwei Kampagnen unter `sm`, bei
  // dreien (z. B. „Der Pfad des Waldläufers“ neben zwei weiteren) unter `lg` – dort teilt sich die Breite mit
  // der Seitenleiste.
  const narrow = useMediaQuery(campaigns.length >= 3 ? '(max-width: 1023.98px)' : '(max-width: 639.98px)')
  const active = useMemo(() => campaigns.filter(isCampaignActive), [campaigns])
  // Ausdrücklich gewählte Kampagne aus der Adresse (kann kurz noch fehlen, z. B. direkt nach dem Anlegen) …
  const urlId = searchParams.get(CAMPAIGN_PARAM)
  const wantsNew = searchParams.get(NEW_PARAM) === '1'
  // … und die zuletzt gezeigte: Sie bleibt stehen, auch wenn sie gerade gemeistert wird.
  const [shownId, setShownId] = useState<string | null>(null)
  const findCampaign = (id: string | null) => (id === null ? undefined : campaigns.find((c) => c.quest.id === id))
  // Ohne (gültige) Auswahl: die zuletzt gewählte, sonst die erste laufende Kampagne – nicht eine längst
  // gemeisterte. Unbekannte und archivierte IDs (nicht in `state.mainQuests`) fallen ebenfalls zurück.
  const selected: MainQuestState | undefined =
    findCampaign(urlId) ??
    findCampaign(urlId === null ? rememberedCampaignId : null) ??
    findCampaign(shownId) ??
    campaigns.find((c) => !c.complete) ??
    campaigns[0]
  const selectedQuestId = selected?.quest.id ?? null
  if (selectedQuestId !== shownId) setShownId(selectedQuestId)
  useEffect(() => {
    if (urlId !== null && findCampaign(urlId)) rememberedCampaignId = urlId
  })

  // Gerade begonnene bzw. angelegte Kampagne: Bis sie in den Live-Daten auftaucht, bleibt die Bibliothek
  // stehen – sonst blitzte kurz die bisherige Kampagne auf.
  const [awaitingId, setAwaitingId] = useState<string | null>(null)
  const awaiting = awaitingId !== null && findCampaign(awaitingId) === undefined
  if (awaitingId !== null && !awaiting) setAwaitingId(null)
  const showStarter = campaigns.length === 0 || wantsNew || awaiting

  /**
   * Schreibt die Auswahl in die Adresse (ersetzt den Eintrag – Zurück führt nicht durch jede Auswahl) und
   * verlässt dabei die Bibliothek (`?neu=1`).
   */
  function selectCampaign(id: string | null) {
    rememberedCampaignId = id
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.delete(NEW_PARAM)
        if (id === null) next.delete(CAMPAIGN_PARAM)
        else next.set(CAMPAIGN_PARAM, id)
        return next
      },
      { replace: true },
    )
  }

  /** Bibliothek öffnen, um eine weitere Kampagne zu beginnen (eigener Verlaufseintrag: Zurück führt zurück). */
  function openNew() {
    focusWish.current = { target: 'heading', ready: (view) => view.starter }
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.set(NEW_PARAM, '1')
      // Die gezeigte Kampagne festhalten – „Zurück zur Kampagne“ führt genau hierher.
      if (selected) next.set(CAMPAIGN_PARAM, selected.quest.id)
      return next
    })
  }

  function closeNew() {
    focusWish.current = { target: 'heading', ready: (view) => !view.starter }
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.delete(NEW_PARAM)
        return next
      },
      { replace: true },
    )
  }

  // Formular-Ziele bleiben beim Schließen erhalten (für die Ausblend-Animation).
  const [formQuest, setFormQuest] = useState<MainQuest | undefined>(undefined)
  const [formOpen, setFormOpen] = useState(false)
  const [chapterTarget, setChapterTarget] = useState<ChapterTarget | null>(null)
  const [chapterOpen, setChapterOpen] = useState(false)
  // Rückfrage „Kampagne beenden“ / „In die Ruhmeshalle legen“ – die Kampagne bleibt fürs Ausblenden gesetzt.
  const [archiveTarget, setArchiveTarget] = useState<MainQuestState | null>(null)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [announcement, setAnnouncement] = useState('')

  const headingRef = useRef<HTMLHeadingElement>(null)
  const addChapterRef = useRef<HTMLButtonElement>(null)
  const focusWish = useRef<FocusWish | null>(null)
  useEffect(() => {
    const wish = focusWish.current
    if (!wish || !wish.ready({ shown: showStarter ? undefined : selected, starter: showStarter })) return
    const element = wish.target === 'heading' ? headingRef.current : addChapterRef.current
    if (!element) return
    element.focus()
    // Solange noch ein Dialog offen ist (App inert), klappt das nicht – dann beim nächsten Rendern erneut.
    if (document.activeElement === element) focusWish.current = null
  })

  const habitsById = useMemo(() => new Map(data.habits.map((habit) => [habit.id, habit])), [data.habits])
  // Ruhmeshalle: alle gemeisterten Kampagnen (laufend sichtbare und abgelegte) – dieselbe Auswertung wie oben.
  const fame = useMemo(
    () => hallOfFame(data, today, [...state.mainQuests, ...state.archivedMainQuests]),
    [data, today, state.mainQuests, state.archivedMainQuests],
  )
  const linkedHabits = useMemo(() => {
    if (!selected) return []
    return selected.linkedHabitIds
      .map((id) => habitsById.get(id))
      .filter((habit): habit is Habit => habit !== undefined)
      .sort(
        (a, b) =>
          Number(isArchived(a, today)) - Number(isArchived(b, today)) ||
          a.order - b.order ||
          a.title.localeCompare(b.title, 'de'),
      )
  }, [selected, habitsById, today])

  function openCreate() {
    setFormQuest(undefined)
    setFormOpen(true)
  }

  function openEdit(quest: MainQuest) {
    setFormQuest(quest)
    setFormOpen(true)
  }

  /** Kampagne aus der Bibliothek beginnen; wirft nach dem Fehler-Toast weiter (die Einrichtung bleibt offen). */
  async function handleStart(choice: AdventureChoice) {
    let quest: MainQuest
    try {
      quest = await installBlueprint(choice.blueprintId, choice.options, today)
    } catch (error) {
      toast({ tone: 'error', title: 'Kampagne konnte nicht beginnen', description: errorMessage(error) })
      throw error
    }
    toast({
      tone: 'success',
      title: 'Kampagne begonnen',
      description: `„${quest.title}“ liegt vor dir – deine neuen Quests stehen ab heute bereit.`,
    })
    showNewCampaign(quest.id)
  }

  /** Neue Kampagne zeigen, sobald sie in den Live-Daten ist – mit dem Fokus auf ihrer Überschrift. */
  function showNewCampaign(id: string) {
    setAwaitingId(id)
    selectCampaign(id)
    focusWish.current = { target: 'heading', ready: (view) => view.shown?.quest.id === id }
  }

  function openArchive(campaign: MainQuestState) {
    setArchiveTarget(campaign)
    setArchiveOpen(true)
  }

  async function handleRestore(campaign: MainQuestState) {
    const { quest } = campaign
    try {
      await restoreMainQuest(quest.id, today, { restoreQuests: true })
    } catch (error) {
      toast({ tone: 'error', title: 'Kampagne konnte nicht zurückgeholt werden', description: errorMessage(error) })
      return
    }
    toast({
      tone: 'success',
      title: 'Kampagne zurückgeholt',
      description: campaign.complete
        ? `„${quest.title}“ steht wieder bei deinen Kampagnen.`
        : `„${quest.title}“ geht weiter – ihre Quests stehen ab heute wieder bereit.`,
    })
    // Bis sie in den Live-Daten auftaucht, bleibt die bisherige Ansicht stehen (die Adresse kennt sie schon).
    selectCampaign(quest.id)
    focusWish.current = { target: 'heading', ready: (view) => view.shown?.quest.id === quest.id }
  }

  function openChapter(quest: MainQuest, chapter: Chapter | undefined, index: number | null) {
    setChapterTarget({ questId: quest.id, chapter, number: index === null ? quest.chapters.length + 1 : index + 1 })
    setChapterOpen(true)
  }

  /** Speichert die geänderte Kapitelliste der Kampagne; wirft weiter, damit der Dialog offen bleibt. */
  async function saveChapters(questId: string, change: (chapters: Chapter[]) => Chapter[], success: string) {
    const quest = data.mainQuests.find((candidate) => candidate.id === questId)
    try {
      if (!quest) throw new Error('Diese Kampagne gibt es nicht (mehr).')
      await updateMainQuest(questId, { chapters: change(quest.chapters) })
    } catch (error) {
      toast({ tone: 'error', title: 'Kapitel konnte nicht gespeichert werden', description: errorMessage(error) })
      throw error
    }
    setAnnouncement(success)
  }

  /** Bearbeitetes Kapitel ersetzen bzw. neues anhängen (Kapitel-Dialog aus der Zeitleiste). */
  function applyChapter(target: ChapterTarget, chapter: Chapter) {
    return (chapters: Chapter[]) =>
      target.chapter
        ? chapters.map((existing) => (existing.id === chapter.id ? chapter : existing))
        : [...chapters, chapter]
  }

  /**
   * Rückfrage vor dem Speichern, falls das Kapitel dadurch XP kostet (höheres Ziel, neues offenes Kapitel
   * in einer gemeisterten Kampagne …). `undefined` = ohne Rückfrage speichern.
   */
  function chapterSaveWarning(target: ChapterTarget, chapter: Chapter): string | undefined {
    const quest = data.mainQuests.find((candidate) => candidate.id === target.questId)
    if (!quest) return undefined
    const chapters = applyChapter(target, chapter)(quest.chapters)
    const loss = campaignEditLoss(data, today, quest.id, { ...quest, chapters })
    return loss.xp > 0 ? campaignEditLossText(loss) : undefined
  }

  const chapterQuestId = chapterTarget?.questId ?? ''
  const doneCount = selected ? selected.chapters.filter((chapter) => chapter.done).length : 0

  // XP, die das Löschen des Kapitels im Kapitel-Dialog kostet: seine Kapitel-XP (falls abgeschlossen)
  // und der Kampagnen-Bonus, falls die gemeisterte Kampagne danach ohne Kapitel dasteht.
  const chapterCampaign = findCampaign(chapterTarget?.questId ?? null)
  const chapterDone =
    chapterCampaign?.chapters.some((state) => state.chapter.id === chapterTarget?.chapter?.id && state.done) ?? false
  const chapterDeleteXp =
    (chapterDone ? BALANCING.chapterXp : 0) +
    (chapterCampaign?.complete && chapterCampaign.chapters.length === 1 ? BALANCING.mainQuestXp : 0)

  return (
    <>
      <PageHeader
        eyebrow="Dein großes Ziel"
        title="Kampagne"
        // Nur ohne Kampagne: Beim Beginnen einer weiteren erklärt die Bibliothek selbst, worum es geht.
        subtitle={campaigns.length === 0 ? 'Ein Abenteuer, Kapitel für Kapitel erzählt.' : undefined}
        action={
          selected &&
          !showStarter && (
            <Button variant="secondary" size="sm" icon={<Pencil />} onClick={() => openEdit(selected.quest)}>
              Bearbeiten
            </Button>
          )
        }
      />

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {campaigns.length > 1 && selected && !showStarter && (
        <div className="mb-5">
          {campaigns.length <= 3 && !narrow ? (
            <SegmentedControl
              aria-label="Kampagne wählen"
              value={selected.quest.id}
              onChange={selectCampaign}
              options={campaigns.map((campaign) => ({
                value: campaign.quest.id,
                label: campaign.quest.title,
                icon: (
                  <span aria-hidden="true" className="inline-flex items-center gap-1.5">
                    <ColorDot color={campaignColor(campaign)} />
                    {campaign.quest.icon}
                  </span>
                ),
              }))}
            />
          ) : (
            <Select
              // Die native Liste kann keine Farben zeigen – der Punkt im Label steht für die gewählte Kampagne.
              label={
                <span className="inline-flex items-center gap-2">
                  <ColorDot color={campaignColor(selected)} />
                  Kampagne
                </span>
              }
              value={selected.quest.id}
              onChange={selectCampaign}
              options={campaigns.map(({ quest, complete }) => ({
                value: quest.id,
                label: `${quest.icon} ${quest.title}${complete ? ' · gemeistert' : ''}`,
              }))}
              fieldClassName="sm:max-w-sm"
            />
          )}
        </div>
      )}

      {showStarter || !selected ? (
        <CampaignStarter
          variant={campaigns.length === 0 ? 'first' : 'next'}
          headingRef={headingRef}
          onStart={handleStart}
          onCreateCustom={openCreate}
          onBack={campaigns.length > 0 && !awaiting ? closeNew : undefined}
          active={active}
        />
      ) : (
        <>
          {selected.complete && (
            <CampaignVictory campaign={selected} onNewCampaign={openNew} onArchive={() => openArchive(selected)} />
          )}
          <CampaignBanner campaign={selected} today={today} headingRef={headingRef} />

          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-10">
            <section aria-labelledby={chaptersTitleId} className="min-w-0">
              <SectionTitle
                id={chaptersTitleId}
                meta={
                  selected.chapters.length > 0
                    ? `${formatNumber(doneCount)} / ${formatNumber(selected.chapters.length)} abgeschlossen`
                    : undefined
                }
              >
                Kapitel
              </SectionTitle>
              <ChapterTimeline
                campaign={selected}
                habitsById={habitsById}
                onEditChapter={(chapter, index) => openChapter(selected.quest, chapter, index)}
                onAddChapter={() => openChapter(selected.quest, undefined, null)}
                onAnnounce={setAnnouncement}
                addButtonRef={addChapterRef}
              />
            </section>

            <aside aria-label="Quests und Verwaltung" className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-8">
              <LinkedQuests
                habits={linkedHabits}
                today={today}
                onAddQuest={() => {
                  // Erst die gezeigte Kampagne in der Adresse festhalten – „Zurück“ führt dann genau hierher.
                  if (urlId !== selected.quest.id) selectCampaign(selected.quest.id)
                  navigate(`/quests?${new URLSearchParams({ neu: '1', kampagne: selected.quest.id }).toString()}`)
                }}
              />
              <CampaignManageCard
                campaign={selected}
                activeCount={active.length}
                onNew={openNew}
                onArchive={() => openArchive(selected)}
              />
            </aside>
          </div>
        </>
      )}

      <HallOfFame
        entries={fame}
        today={today}
        hasCampaigns={campaigns.length + state.archivedMainQuests.length > 0}
      />

      {/* Auch unter der Bibliothek (`?neu=1`): Eine beendete Kampagne fortzusetzen ist ebenfalls ein Neubeginn. */}
      <ArchivedCampaigns
        campaigns={state.archivedMainQuests}
        onRestore={handleRestore}
        onDeleted={() => {
          focusWish.current = { target: 'heading', ready: () => true }
        }}
      />

      <CampaignFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        quest={formQuest}
        onCreated={(quest) => showNewCampaign(quest.id)}
        onDeleted={(quest) => {
          selectCampaign(null)
          focusWish.current = { target: 'heading', ready: (view) => view.shown?.quest.id !== quest.id }
        }}
      />

      {archiveTarget && (
        <ArchiveCampaignDialog
          open={archiveOpen}
          onClose={() => setArchiveOpen(false)}
          campaign={archiveTarget}
          onArchived={(campaign) => {
            selectCampaign(null)
            focusWish.current = { target: 'heading', ready: (view) => view.shown?.quest.id !== campaign.quest.id }
          }}
        />
      )}

      {chapterTarget && (
        <ChapterFormDialog
          open={chapterOpen}
          onClose={() => setChapterOpen(false)}
          chapter={chapterTarget.chapter}
          number={chapterTarget.number}
          campaignId={chapterTarget.questId}
          deleteXp={chapterDeleteXp}
          submitWarning={(chapter) => chapterSaveWarning(chapterTarget, chapter)}
          onSubmit={(chapter) =>
            saveChapters(
              chapterQuestId,
              applyChapter(chapterTarget, chapter),
              `Kapitel „${chapter.title}“ ${chapterTarget.chapter ? 'gespeichert' : 'hinzugefügt'}.`,
            )
          }
          onDelete={
            chapterTarget.chapter
              ? () => {
                  const removedId = chapterTarget.chapter?.id
                  focusWish.current = {
                    target: 'addChapter',
                    ready: ({ shown }) => !shown?.quest.chapters.some((chapter) => chapter.id === removedId),
                  }
                  return saveChapters(
                    chapterQuestId,
                    (chapters) => chapters.filter((existing) => existing.id !== removedId),
                    `Kapitel „${chapterTarget.chapter?.title ?? ''}“ gelöscht.`,
                  ).catch((error: unknown) => {
                    focusWish.current = null
                    throw error
                  })
                }
              : undefined
          }
        />
      )}
    </>
  )
}

/** Kleiner, leuchtender Punkt in der Hauptfarbe einer Kampagne (Auswahl). */
function ColorDot({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      data-campaign-color={color}
      className="inline-block size-2 shrink-0 rounded-full"
      style={{ backgroundColor: color, boxShadow: `0 0 6px -1px ${color}` }}
    />
  )
}

/**
 * Verwaltung in der Seitenleiste: freie Plätze, „Neue Kampagne beginnen“ und – je nach Stand –
 * „Kampagne beenden“ (laufend) bzw. „In die Ruhmeshalle legen“ (gemeistert).
 */
function CampaignManageCard({
  campaign,
  activeCount,
  onNew,
  onArchive,
}: {
  campaign: MainQuestState
  activeCount: number
  onNew: () => void
  onArchive: () => void
}) {
  const max = BALANCING.maxActiveCampaigns
  const left = Math.max(0, max - activeCount)
  return (
    <Card tone="flat" title="Deine Kampagnen" subtitle={`${activeSlotsText(activeCount, max)} · ${freeSlotsText(left)}`}>
      <div className="flex flex-col gap-2">
        <Button variant="secondary" icon={<Plus />} onClick={onNew} fullWidth>
          Neue Kampagne beginnen
        </Button>
        <Button
          variant="ghost"
          icon={campaign.complete ? <Landmark /> : <Archive />}
          onClick={onArchive}
          fullWidth
        >
          {campaign.complete ? 'In die Ruhmeshalle legen' : 'Kampagne beenden'}
        </Button>
      </div>
    </Card>
  )
}
