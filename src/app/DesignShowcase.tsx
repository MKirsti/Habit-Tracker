import { Flame, Plus, Scroll, Sparkles, Star, Swords, Trash2, Trophy } from 'lucide-react'
import { useState } from 'react'
import { ATTRIBUTE_IDS, ATTRIBUTES } from '../domain/attributes'
import { DIFFICULTIES, DIFFICULTY_META } from '../domain/balancing'
import type { Difficulty } from '../domain/types'
import {
  AttributeChip,
  Badge,
  Button,
  Card,
  Chip,
  ConfirmDialog,
  Dialog,
  Divider,
  EmojiPicker,
  EmptyState,
  IconButton,
  NumberField,
  PageHeader,
  ProgressBar,
  SectionTitle,
  SegmentedControl,
  Select,
  StatTile,
  Switch,
  TextArea,
  TextField,
  XpBar,
  formatNumber,
  useToast,
} from '../ui'
import { AppLogo } from './AppLogo'

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

/**
 * Entwicklungs-Seite (#/designsystem, nur im Dev-Server): zeigt alle Bausteine des Design-Systems
 * in typischen Zuständen. Dient als lebende Referenz für Seiten-Entwicklung und Screenshots.
 */
export function DesignShowcase() {
  const { toast } = useToast()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [title, setTitle] = useState('10 Seiten lesen')
  const [notes, setNotes] = useState('')
  const [pages, setPages] = useState<number | null>(10)
  const [water, setWater] = useState<number | null>(1.5)
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [rhythm, setRhythm] = useState<'daily' | 'weekdays' | 'weekly'>('daily')
  const [dayStart, setDayStart] = useState(4)
  const [effects, setEffects] = useState(true)
  const [emoji, setEmoji] = useState('📖')
  const [days, setDays] = useState<number[]>([1, 3, 5])

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Entwicklung"
        title="Design-System"
        subtitle="Alle Bausteine von Questlog auf einen Blick – Dark Fantasy mit Goldakzenten."
        action={<Button icon={<Plus />}>Neue Quest</Button>}
      />

      <section className="space-y-4">
        <SectionTitle>Marke</SectionTitle>
        <div className="flex flex-wrap items-center gap-8">
          <AppLogo size="lg" />
          <AppLogo size="md" />
          <AppLogo size="sm" showWordmark={false} />
        </div>
      </section>

      <section className="space-y-4">
        <SectionTitle meta="3/5" action={<Button variant="ghost" size="sm">Alle</Button>}>
          Charakter
        </SectionTitle>
        <Card ornate tone="gold" title="Aria die Beharrliche" subtitle="Tag 12 deines Abenteuers · Wanderer" icon="🧙">
          <XpBar level={7} xpIntoLevel={820} xpForNextLevel={1470} />
          <div className="mt-4 flex flex-wrap gap-1.5">
            {ATTRIBUTE_IDS.map((id) => (
              <AttributeChip key={id} attribute={id} />
            ))}
          </div>
        </Card>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Level" value={formatNumber(7)} icon={<Star />} hint="Wanderer" />
          <StatTile label="Gesamt-XP" value={formatNumber(12480)} icon={<Sparkles />} />
          <StatTile label="Bester Streak" value="21" icon={<Flame />} hint="Tage in Folge" color="#e0654a" />
          <StatTile label="Perfekte Tage" value="9" icon={<Trophy />} />
        </div>
      </section>

      <section className="space-y-4">
        <SectionTitle>Fortschritt</SectionTitle>
        <Card>
          <div className="space-y-5">
            <XpBar level={3} xpIntoLevel={140} xpForNextLevel={520} compact />
            <ProgressBar value={0.54} label="Kapitel 2/5: „10 km laufen“" valueLabel="54 %" />
            <ProgressBar value={0.8} size="sm" color={ATTRIBUTES.intellect.color} aria-label="Intelligenz" glow />
            {ATTRIBUTE_IDS.map((id) => (
              <ProgressBar
                key={id}
                value={(ATTRIBUTE_IDS.indexOf(id) + 1) / 7}
                size="xs"
                color={ATTRIBUTES[id].color}
                label={`${ATTRIBUTES[id].icon} ${ATTRIBUTES[id].name}`}
                valueLabel={`Lv ${ATTRIBUTE_IDS.indexOf(id) + 2}`}
              />
            ))}
          </div>
        </Card>
      </section>

      <section className="space-y-4">
        <SectionTitle>Buttons & Etiketten</SectionTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Button icon={<Swords />}>Quest abschließen</Button>
          <Button variant="secondary">Bearbeiten</Button>
          <Button variant="ghost">Abbrechen</Button>
          <Button variant="danger" icon={<Trash2 />}>
            Löschen
          </Button>
          <Button loading>Speichert</Button>
          <Button disabled>Deaktiviert</Button>
          <IconButton aria-label="Archivieren" icon={<Scroll />} variant="secondary" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm">Klein</Button>
          <Button size="lg">Groß</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="gold" icon={<Sparkles />}>
            +20 XP
          </Badge>
          <Badge tone="warning" icon={<Flame />}>
            12
          </Badge>
          <Badge tone="success">Erledigt</Badge>
          <Badge tone="danger">Überfällig</Badge>
          <Badge tone="info">3× pro Woche</Badge>
          <Badge>Täglich</Badge>
          <Badge color={ATTRIBUTES.wisdom.color}>Eigene Farbe</Badge>
        </div>
        <div className="grid max-w-md grid-cols-7 gap-1.5">
          {WEEKDAYS.map((label, index) => {
            const day = index + 1
            const selected = days.includes(day)
            return (
              <Chip
                key={label}
                className="min-w-0 px-0"
                selected={selected}
                onClick={() => setDays(selected ? days.filter((d) => d !== day) : [...days, day])}
              >
                {label}
              </Chip>
            )
          })}
        </div>
      </section>

      <section className="space-y-4">
        <SectionTitle>Overlays</SectionTitle>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setDialogOpen(true)}>
            Dialog öffnen
          </Button>
          <Button variant="secondary" onClick={() => setConfirmOpen(true)}>
            Rückfrage öffnen
          </Button>
          <Button
            variant="secondary"
            onClick={() => toast({ title: '+20 XP', description: '10 Seiten lesen', tone: 'xp' })}
          >
            XP-Toast
          </Button>
          <Button
            variant="secondary"
            onClick={() => toast({ title: 'Quest gespeichert', tone: 'success' })}
          >
            Erfolg-Toast
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              toast({ title: 'Import fehlgeschlagen', description: 'Die Datei ist kein Questlog-Backup.', tone: 'error' })
            }
          >
            Fehler-Toast
          </Button>
        </div>
      </section>

      <section className="space-y-4">
        <SectionTitle>Formular</SectionTitle>
        <Card>
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField label="Titel" value={title} onChange={setTitle} maxLength={60} showCount required />
            <Select
              label="Tageswechsel"
              value={dayStart}
              onChange={setDayStart}
              options={[0, 2, 3, 4, 5, 6].map((h) => ({ value: h, label: `${h}:00 Uhr` }))}
              hint="Bis dahin zählt die Nacht noch zum Vortag."
            />
            <NumberField label="Ziel pro Tag" value={pages} onChange={setPages} min={1} max={500} unit="Seiten" />
            <NumberField
              label="Wasser"
              value={water}
              onChange={setWater}
              min={0}
              step={0.25}
              unit="L"
              error={water !== null && water > 5 ? 'Bitte höchstens 5 L.' : undefined}
            />
            <SegmentedControl
              label="Schwierigkeit"
              value={difficulty}
              onChange={setDifficulty}
              options={DIFFICULTIES.map((d) => ({ value: d, label: DIFFICULTY_META[d].label }))}
              fieldClassName="sm:col-span-2"
            />
            <SegmentedControl
              label="Rhythmus"
              value={rhythm}
              onChange={setRhythm}
              size="sm"
              options={[
                { value: 'daily', label: 'Täglich' },
                { value: 'weekdays', label: 'Wochentage' },
                { value: 'weekly', label: 'X pro Woche' },
              ]}
            />
            <TextArea
              label="Notiz"
              value={notes}
              onChange={setNotes}
              placeholder="Warum ist dir diese Quest wichtig?"
              hint="Optional"
            />
            <Switch
              label="Effekte & Animationen"
              description="Konfetti, Glanz und Level-Up-Szene."
              checked={effects}
              onChange={setEffects}
            />
          </div>
          <Divider label="Emoji" className="my-6" />
          <EmojiPicker label="Symbol der Quest" value={emoji} onChange={setEmoji} />
        </Card>
      </section>

      <section className="space-y-4">
        <SectionTitle>Leerzustand</SectionTitle>
        <EmptyState
          icon="📜"
          title="Noch keine Quests"
          text="Lege deine erste Quest an – zum Beispiel „10 Seiten lesen“."
          action={<Button icon={<Plus />}>Erste Quest anlegen</Button>}
        />
      </section>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="Quest bearbeiten"
        description="Änderungen gelten ab heute."
        icon={emoji}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={() => setDialogOpen(false)}>Speichern</Button>
          </>
        }
      >
        <div className="space-y-5">
          <TextField label="Titel" value={title} onChange={setTitle} />
          <NumberField label="Ziel pro Tag" value={pages} onChange={setPages} min={1} unit="Seiten" />
          <SegmentedControl
            label="Schwierigkeit"
            value={difficulty}
            onChange={setDifficulty}
            options={DIFFICULTIES.map((d) => ({ value: d, label: DIFFICULTY_META[d].label }))}
          />
          <EmojiPicker label="Symbol" value={emoji} onChange={setEmoji} />
        </div>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          toast({ title: 'Quest gelöscht', tone: 'info' })
        }}
        title="Quest löschen?"
        message="„10 Seiten lesen“ und alle Erledigungen werden endgültig entfernt."
        confirmLabel="Endgültig löschen"
        danger
      />
    </div>
  )
}
