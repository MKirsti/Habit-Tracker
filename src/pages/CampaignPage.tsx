import { Pencil, Plus } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useGameContext } from '../app/gameContext'
import { updateMainQuest } from '../data/repository'
import { installScholarCampaign } from '../data/seed'
import { BALANCING } from '../domain/balancing'
import type { Chapter, Habit, MainQuest, MainQuestState } from '../domain/types'
import { Button, PageHeader, SectionTitle, SegmentedControl, Select, formatNumber, useMediaQuery, useToast } from '../ui'
import { CampaignBanner } from './campaign/CampaignBanner'
import { CampaignChoice } from './campaign/CampaignChoice'
import { CampaignFormDialog } from './campaign/CampaignFormDialog'
import { CampaignVictory } from './campaign/CampaignVictory'
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

/**
 * Wohin der Fokus nach einer Aktion springt, die erst mit den nächsten Live-Daten sichtbar wird:
 * - heading: nach Anlegen/Einrichten/Löschen einer Kampagne die Überschrift der gezeigten Kampagne
 *   (bzw. der Auswahl ohne Kampagne), sobald `ready` für die gezeigte Kampagne zutrifft;
 * - addChapter: nach dem Löschen eines Kapitels „Kapitel hinzufügen“ (die Zeile ist ja weg).
 */
interface FocusWish {
  target: 'heading' | 'addChapter'
  ready: (shown: MainQuestState | undefined) => boolean
}

/** Parameter der gewählten Kampagne: `/kampagne?id=<questId>` (Dashboard-Karten verlinken so). */
const CAMPAIGN_PARAM = 'id'

/**
 * Zuletzt ausdrücklich gewählte Kampagne (Adresse oder Auswahl) – für `/kampagne` ohne Parameter, z. B.
 * über die Navigation. Bewusst nur im Speicher: Sie gilt für die laufende Sitzung.
 */
let rememberedCampaignId: string | null = null

/**
 * Kampagne (`/kampagne`): das große Ziel mit seinen Kapiteln als Questkarte. Ohne Kampagne gibt es
 * die Wahl zwischen der Vorlage „Der Weg des Gelehrten“ und einer eigenen Kampagne.
 * Die gezeigte Kampagne steht in der Adresse (`?id=`), damit Zurück und Links sie behalten.
 */
export function CampaignPage() {
  const { data, today, state } = useGameContext()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const chaptersTitleId = useId()
  // Unter `sm` wären die Segmente zu schmal für die Titel – dann die Auswahlliste.
  const narrow = useMediaQuery('(max-width: 639.98px)')

  const campaigns = state.mainQuests
  // Ausdrücklich gewählte Kampagne aus der Adresse (kann kurz noch fehlen, z. B. direkt nach dem Anlegen) …
  const urlId = searchParams.get(CAMPAIGN_PARAM)
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

  /** Schreibt die Auswahl in die Adresse (ersetzt den Eintrag – Zurück führt nicht durch jede Auswahl). */
  function selectCampaign(id: string | null) {
    rememberedCampaignId = id
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (id === null) next.delete(CAMPAIGN_PARAM)
        else next.set(CAMPAIGN_PARAM, id)
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
  const [installing, setInstalling] = useState(false)
  const [announcement, setAnnouncement] = useState('')

  const headingRef = useRef<HTMLHeadingElement>(null)
  const addChapterRef = useRef<HTMLButtonElement>(null)
  const focusWish = useRef<FocusWish | null>(null)
  useEffect(() => {
    const wish = focusWish.current
    if (!wish || !wish.ready(selected)) return
    const element = wish.target === 'heading' ? headingRef.current : addChapterRef.current
    if (!element) return
    element.focus()
    // Solange noch ein Dialog offen ist (App inert), klappt das nicht – dann beim nächsten Rendern erneut.
    if (document.activeElement === element) focusWish.current = null
  })

  const habitsById = useMemo(() => new Map(data.habits.map((habit) => [habit.id, habit])), [data.habits])
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

  async function handleInstall() {
    if (installing) return
    setInstalling(true)
    try {
      await installScholarCampaign(today)
      focusWish.current = { target: 'heading', ready: (shown) => shown !== undefined }
      toast({
        tone: 'success',
        title: 'Kampagne begonnen',
        description: '„Der Weg des Gelehrten“ liegt vor dir – deine neuen Quests stehen ab heute bereit.',
      })
    } catch (error) {
      toast({ tone: 'error', title: 'Kampagne konnte nicht eingerichtet werden', description: errorMessage(error) })
    } finally {
      setInstalling(false)
    }
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
        subtitle={selected ? undefined : 'Ein Abenteuer, Kapitel für Kapitel erzählt.'}
        action={
          selected && (
            <Button variant="secondary" size="sm" icon={<Pencil />} onClick={() => openEdit(selected.quest)}>
              Bearbeiten
            </Button>
          )
        }
      />

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {campaigns.length > 1 && selected && (
        <div className="mb-5">
          {campaigns.length <= 3 && !narrow ? (
            <SegmentedControl
              aria-label="Kampagne wählen"
              value={selected.quest.id}
              onChange={selectCampaign}
              options={campaigns.map(({ quest }) => ({
                value: quest.id,
                label: quest.title,
                icon: <span aria-hidden="true">{quest.icon}</span>,
              }))}
            />
          ) : (
            <Select
              label="Kampagne"
              value={selected.quest.id}
              onChange={selectCampaign}
              options={campaigns.map(({ quest }) => ({ value: quest.id, label: `${quest.icon} ${quest.title}` }))}
              fieldClassName="sm:max-w-sm"
            />
          )}
        </div>
      )}

      {selected ? (
        <>
          {selected.complete && <CampaignVictory campaign={selected} onNewCampaign={openCreate} />}
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
              <Button variant="ghost" icon={<Plus />} onClick={openCreate} className="self-center lg:self-start">
                Weitere Kampagne beginnen
              </Button>
            </aside>
          </div>
        </>
      ) : (
        <CampaignChoice
          today={today}
          installing={installing}
          onInstall={handleInstall}
          onCreateCustom={openCreate}
          headingRef={headingRef}
        />
      )}

      <CampaignFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        quest={formQuest}
        onCreated={(quest) => {
          selectCampaign(quest.id)
          focusWish.current = { target: 'heading', ready: (shown) => shown?.quest.id === quest.id }
        }}
        onDeleted={(quest) => {
          selectCampaign(null)
          focusWish.current = { target: 'heading', ready: (shown) => shown?.quest.id !== quest.id }
        }}
      />

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
                    ready: (shown) => !shown?.quest.chapters.some((chapter) => chapter.id === removedId),
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
