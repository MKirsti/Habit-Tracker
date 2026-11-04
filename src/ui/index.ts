/**
 * Design-System „Dark Fantasy“ – alle wiederverwendbaren, rein darstellenden Bausteine.
 * Seiten importieren ausschließlich von hier: `import { Button, Card } from '../ui'`.
 */

// Grundlagen
export { cn } from './cn'
export type { ClassValue } from './cn'
export { clamp, countDecimals, formatDecimalInput, formatNumber, parseDecimal } from './format'
export { TINT_TEXT_PERCENT, tintStyle, tintTextColor } from './tint'
export { useMediaQuery } from './useMediaQuery'
export { useSvgId } from './useSvgId'

// Aktionen
export { Button, IconButton } from './Button'
export type { ButtonProps, IconButtonProps } from './Button'
export { buttonClassName } from './buttonStyles'
export type { ButtonSize, ButtonStyleOptions, ButtonVariant } from './buttonStyles'

// Struktur & Typografie
export { Card } from './Card'
export type { CardPadding, CardProps, CardTone } from './Card'
export { PageHeader, SectionTitle } from './PageHeader'
export type { PageHeaderProps, SectionTitleProps } from './PageHeader'
export { CornerFlourish, Divider, Ornament } from './Ornament'
export type { DividerProps, OrnamentProps } from './Ornament'
export { EmptyState } from './EmptyState'
export type { EmptyStateProps } from './EmptyState'
export { StatTile } from './StatTile'
export type { StatTileProps } from './StatTile'
export { LoadingState, Spinner } from './Spinner'
export type { LoadingStateProps, SpinnerProps } from './Spinner'

// Fortschritt & Status
export { ProgressBar } from './ProgressBar'
export type { ProgressBarProps, ProgressSize } from './ProgressBar'
export { XpBar } from './XpBar'
export type { XpBarProps } from './XpBar'
export { Badge, Chip } from './Badge'
export type { BadgeProps, BadgeTone, ChipProps } from './Badge'
export { AttributeChip } from './AttributeChip'
export type { AttributeChipProps } from './AttributeChip'

// Overlays
export { ConfirmDialog, Dialog } from './Dialog'
export type { ConfirmDialogProps, DialogProps, DialogSize } from './Dialog'
export { ToastProvider } from './Toast'
export type { ToastProviderProps } from './Toast'
export { useToast } from './useToast'
export type { ToastApi, ToastOptions, ToastTone } from './toastContext'

// Formulare
export { Field } from './Field'
export type { FieldProps } from './Field'
export { INPUT_CLASS, INPUT_GROUP_CLASS, describedBy, fieldIds } from './fieldStyles'
export { TextArea, TextField } from './TextField'
export type { TextAreaProps, TextFieldProps } from './TextField'
export { NumberField } from './NumberField'
export type { NumberFieldProps } from './NumberField'
export { Select } from './Select'
export type { SelectOption, SelectProps } from './Select'
export { SegmentedControl } from './SegmentedControl'
export type { SegmentedControlProps, SegmentedOption } from './SegmentedControl'
export { Switch } from './Switch'
export type { SwitchProps } from './Switch'
export { EmojiPicker } from './EmojiPicker'
export type { EmojiPickerProps } from './EmojiPicker'
export { EMOJI_CATEGORIES, findEmojiCategory, firstGrapheme } from './emojis'
export type { EmojiCategory } from './emojis'
