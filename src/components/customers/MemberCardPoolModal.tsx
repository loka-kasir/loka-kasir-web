import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CreditCard, Plus, Printer, Search, Ban, Unlink, UserPlus, X } from 'lucide-react'
import QRCode from 'qrcode'
import JsBarcode from 'jsbarcode'
import toast from 'react-hot-toast'
import {
  assignMemberCard,
  blockMemberCard,
  createMemberCardBatch,
  formatMemberCardCode,
  listAllMemberCards,
  type MemberCardPoolItem,
  unassignMemberCard,
  getMemberCardDesign,
  saveMemberCardDesign,
  type MemberCardDesign,
} from '@/api/memberCards'
import { getOutletConfig } from '@/api/outlets'
import { useAuthStore } from '@/store/authStore'
import { useOutletStore } from '@/store/outletStore'
import { usePermissions, PERMS } from '@/hooks/usePermissions'
import { getErrorMessage } from '@/lib/utils'
import { formatMoney } from '@/lib/money'
import { t } from '@/lib/i18n'
import type { MessageKey } from '@/lib/messages'

type Purpose = 'general' | 'gym'
type CodeStyle = 'both' | 'qr' | 'barcode'
type CardTemplate = 'classic' | 'dark' | 'minimal'
type AccentKey = 'blue' | 'emerald' | 'espresso' | 'charcoal' | 'crimson'

const ACCENTS: Record<AccentKey, { hex: string; soft: string; labelKey: MessageKey }> = {
  blue: { hex: '#1D4ED8', soft: '#DBEAFE', labelKey: 'mcpAccentBlue' },
  emerald: { hex: '#0F766E', soft: '#CCFBF1', labelKey: 'mcpAccentGreen' },
  espresso: { hex: '#6B3F22', soft: '#F3E5D8', labelKey: 'mcpAccentCoffee' },
  charcoal: { hex: '#111827', soft: '#E5E7EB', labelKey: 'mcpAccentBlack' },
  crimson: { hex: '#991B1B', soft: '#FEE2E2', labelKey: 'mcpAccentMaroon' },
}

const POWERED_BY = 'powered by lokakasir.id'
// Logo kecil Loka Kasir di samping watermark (sama dengan PDF aplikasi).
const POWERED_BY_LOGO = '/icon-current.svg'

function defaultTagline(purpose: Purpose): string {
  return purpose === 'gym' ? t('mcpTaglineGym') : t('mcpTaglineGeneral')
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function storeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'LK'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

function renderBarcodeSvg(value: string): string {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  JsBarcode(svg, value, {
    format: 'CODE128',
    displayValue: false,
    margin: 0,
    width: 1.4,
    height: 32,
  })
  return new XMLSerializer().serializeToString(svg)
}

async function openPrintableCardSheet(opts: {
  cards: MemberCardPoolItem[]
  businessName: string
  logoUrl?: string | null
  showLogo: boolean
  storeInfo: string
  purpose: Purpose
  template: CardTemplate
  accent: AccentKey
  codeStyle: CodeStyle
  tagline?: string
}) {
  const { cards, businessName, logoUrl, showLogo, storeInfo, purpose, template, codeStyle } = opts
  const acc = ACCENTS[opts.accent]
  const isDark = template === 'dark'
  const isMinimal = template === 'minimal'
  const title = purpose === 'gym' ? t('mcpCardTitleGym') : t('mcpCardTitle')
  const tagline =
    opts.tagline?.trim() ||
    defaultTagline(purpose)
  const storeName = businessName.trim() || 'Loka Kasir'
  const initials = storeInitials(storeName)

  const logoHtml = showLogo
    ? logoUrl
      ? `<div class="logo-box"><img src="${escapeHtml(logoUrl)}" alt="" /></div>`
      : `<div class="logo-box mono" style="background:${isDark ? acc.hex : acc.soft};color:${isDark ? '#fff' : acc.hex}">${escapeHtml(initials)}</div>`
    : ''

  const rendered = await Promise.all(
    cards.map(async (card) => {
      const qr =
        codeStyle === 'both' || codeStyle === 'qr'
          ? await QRCode.toDataURL(card.qr_url || card.qr_payload, { margin: 1, width: 160 })
          : ''
      const bar =
        codeStyle === 'both' || codeStyle === 'barcode'
          ? renderBarcodeSvg(card.qr_payload)
          : ''
      const codeText = formatMemberCardCode(card.card_code)
      let bodyHtml: string
      if (codeStyle === 'both') {
        bodyHtml = `
          <div class="body-row">
            <div class="qr-box"><img src="${qr}" alt="" /></div>
            <div class="bar-col">
              <div class="bar-box">${bar}</div>
              <div class="code-text">${escapeHtml(codeText)}</div>
              <div class="tagline">${escapeHtml(tagline)}</div>
            </div>
          </div>`
      } else if (codeStyle === 'qr') {
        bodyHtml = `
          <div class="body-row">
            <div class="qr-box qr-lg"><img src="${qr}" alt="" /></div>
            <div class="bar-col left">
              <div class="code-label">${escapeHtml(t('mcpCodeLabel'))}</div>
              <div class="code-text lg">${escapeHtml(codeText)}</div>
              <div class="tagline left">${escapeHtml(tagline)}</div>
            </div>
          </div>`
      } else {
        bodyHtml = `
          <div class="bar-only">
            <div class="bar-box">${bar}</div>
            <div class="code-text">${escapeHtml(codeText)}</div>
            <div class="tagline">${escapeHtml(tagline)}</div>
          </div>`
      }
      return `
        <div class="card ${template}">
          <div class="card-head">
            ${logoHtml}
            <div class="head-left">
              <div class="biz">${escapeHtml(storeName)}</div>
              <div class="title">${escapeHtml(title)}</div>
            </div>
            <div class="serial">${escapeHtml(card.serial_label)}</div>
          </div>
          <div class="card-body">${bodyHtml}</div>
          <div class="card-foot">
            <span class="store-info">${escapeHtml(storeInfo)}</span>
            <span class="powered"><img class="powered-logo" src="${window.location.origin}${POWERED_BY_LOGO}" alt="" />${POWERED_BY}</span>
          </div>
        </div>`
    }),
  )

  const pages: string[] = []
  for (let i = 0; i < rendered.length; i += 10) {
    pages.push(`<div class="page">${rendered.slice(i, i + 10).join('')}</div>`)
  }

  const win = window.open('', '_blank', 'width=960,height=720')
  if (!win) {
    toast.error(t('mcpPopupBlocked'))
    return
  }
  win.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(t('mcpSheetTitle', { count: cards.length }))}</title>
  <style>
    /* A4 297mm: 5×54mm + 4×2mm + 2×8mm = 294mm. Dulu 11mm + 3,5mm = 306mm → baris ke-5 tumpah ke lembar berikutnya. */
    @page { size: A4 portrait; margin: 8mm 14mm; }
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { margin: 0; background: #fff; color: #111827; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { display: grid; grid-template-columns: repeat(2, 85.6mm); grid-auto-rows: 54mm; column-gap: 10mm; row-gap: 2mm; page-break-after: always; justify-content: space-between; }
    .page:last-child { page-break-after: auto; }
    .card { width: 85.6mm; height: 54mm; border: 0.7pt solid ${isDark ? '#334155' : '#cbd5e1'}; background: ${isDark ? '#0f172a' : '#ffffff'}; border-radius: 3mm; overflow: hidden; display: flex; flex-direction: column; }
    .card-head { padding: 2.2mm 3.2mm; display: flex; align-items: center; gap: 2.4mm; background: ${isMinimal ? '#ffffff' : isDark ? '#1e293b' : acc.hex}; ${isMinimal ? `border-top: 1.2mm solid ${acc.hex}; border-bottom: 0.5pt solid #e2e8f0;` : isDark ? `border-bottom: 0.6mm solid ${acc.hex};` : ''} }
    .logo-box { width: 8.5mm; height: 8.5mm; border-radius: 1.8mm; overflow: hidden; background: #fff; border: 0.5pt solid ${isDark ? '#475569' : '#e2e8f0'}; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
    .logo-box img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .logo-box.mono { font-size: 7.5pt; font-weight: 800; }
    .head-left { min-width: 0; flex: 1; }
    .biz { color: ${isMinimal ? '#0f172a' : '#ffffff'}; font-weight: 700; font-size: 9.2pt; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .title { color: ${isMinimal ? acc.hex : isDark ? acc.soft : '#e2e8f0'}; font-weight: 700; font-size: 6.2pt; letter-spacing: 0.9pt; }
    .serial { padding: 0.7mm 2mm; border-radius: 1.4mm; font-weight: 800; font-size: 8.2pt; flex-shrink: 0; background: ${isDark ? acc.hex : acc.soft}; color: ${isDark ? '#ffffff' : acc.hex}; }
    .card-body { flex: 1; padding: 2mm 3.2mm 0.8mm; display: flex; align-items: center; justify-content: center; }
    .body-row { display: flex; align-items: center; gap: 2.8mm; width: 100%; }
    .qr-box { width: 20mm; height: 20mm; border: 0.5pt solid ${isDark ? '#334155' : '#e5e7eb'}; background: #fff; border-radius: 1.5mm; padding: 1mm; flex-shrink: 0; }
    .qr-box.qr-lg { width: 23mm; height: 23mm; }
    .qr-box img { width: 100%; height: 100%; display: block; }
    .bar-col { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; }
    .bar-col.left { align-items: flex-start; }
    .bar-only { width: 100%; display: flex; flex-direction: column; align-items: center; }
    .bar-box { width: 100%; height: 9.5mm; background: #fff; border-radius: 1mm; padding: 0.8mm 1.5mm; display: flex; align-items: center; justify-content: center; }
    .bar-box svg { width: 100%; height: 100%; }
    .code-label { font-size: 6pt; color: ${isDark ? '#94a3b8' : '#4b5563'}; letter-spacing: 0.6pt; }
    .code-text { font-size: 9pt; font-weight: 800; letter-spacing: 1pt; margin-top: 1mm; color: ${isDark ? '#ffffff' : '#111827'}; }
    .code-text.lg { font-size: 11.5pt; }
    .tagline { font-size: 5.9pt; color: ${isDark ? '#94a3b8' : '#4b5563'}; text-align: center; margin-top: 0.8mm; line-height: 1.25; }
    .tagline.left { text-align: left; }
    .card-foot { padding: 0 3.2mm 1.6mm; display: flex; align-items: center; justify-content: space-between; gap: 2mm; font-size: 5.4pt; color: ${isDark ? '#64748b' : '#94a3b8'}; }
    .store-info { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .powered { font-style: italic; flex-shrink: 0; display: inline-flex; align-items: center; gap: 2px; }
    .powered-logo { width: 2mm; height: 2mm; }
  </style>
</head>
<body>
  ${pages.join('')}
  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 250); }</script>
</body>
</html>`)
  win.document.close()
}

export default function MemberCardPoolModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const { selected: selectedOutlet } = useOutletStore()
  const { can } = usePermissions()
  const isGym = (user?.business?.business_vertical?.code ?? '').toUpperCase() === 'GYM'
  const businessName = user?.business?.business_name ?? ''

  const { data: outletCfgData } = useQuery({
    queryKey: ['outlet-config', selectedOutlet?.id],
    queryFn: () => getOutletConfig(selectedOutlet!.id),
    enabled: open && !!selectedOutlet?.id,
  })
  const outletCfg = outletCfgData?.data?.data
  const logoUrl = outletCfg?.logo_url ?? null
  const defaultStoreInfo = outletCfg?.instagram_handle?.trim()
    ? `@${outletCfg.instagram_handle.trim().replace(/^@+/, '')}`
    : (selectedOutlet?.address?.trim() ?? '')

  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [batchCountText, setBatchCountText] = useState('50')
  const parsedBatchCount = Number.parseInt(batchCountText.trim(), 10)
  const batchCountValid = Number.isFinite(parsedBatchCount) && parsedBatchCount >= 1 && parsedBatchCount <= 200
  const [batchLabel, setBatchLabel] = useState('')
  const [purpose, setPurpose] = useState<Purpose>(isGym ? 'gym' : 'general')
  const [template, setTemplate] = useState<CardTemplate>('classic')
  const [accent, setAccent] = useState<AccentKey>(isGym ? 'emerald' : 'blue')
  const [codeStyle, setCodeStyle] = useState<CodeStyle>('both')
  const [showLogo, setShowLogo] = useState(true)
  const [storeInfoOverride, setStoreInfoOverride] = useState<string | null>(null)
  const [customTagline, setCustomTagline] = useState('')
  const [assignCard, setAssignCard] = useState<MemberCardPoolItem | null>(null)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newNotes, setNewNotes] = useState('')

  const storeInfo = storeInfoOverride ?? defaultStoreInfo

  // Desain tersimpan usaha ini (sama dengan aplikasi): diatur sekali, dipakai
  // setiap cetak — batch baru & cetak ulang tampil sama.
  const { data: designData } = useQuery({
    queryKey: ['member-card-design'],
    queryFn: () => getMemberCardDesign(),
    enabled: open,
  })
  const savedDesign = designData?.data?.data
  // Terapkan desain tersimpan sekali setiap datanya berubah (pola "sesuaikan
  // state saat render", bukan efek).
  const [appliedDesign, setAppliedDesign] = useState<MemberCardDesign | undefined>()
  if (savedDesign?.saved && savedDesign !== appliedDesign) {
    setAppliedDesign(savedDesign)
    setTemplate(savedDesign.template)
    setAccent(savedDesign.accent)
    setCodeStyle(savedDesign.code_style)
    setPurpose(savedDesign.purpose)
    setShowLogo(savedDesign.show_logo)
    setStoreInfoOverride(savedDesign.store_info ?? '')
    setCustomTagline(savedDesign.tagline ?? '')
  }
  const currentDesign: MemberCardDesign = {
    template,
    accent,
    code_style: codeStyle,
    purpose,
    show_logo: showLogo,
    store_info: storeInfo,
    tagline: customTagline,
  }
  const designDirty =
    !savedDesign?.saved ||
    savedDesign.template !== template ||
    savedDesign.accent !== accent ||
    savedDesign.code_style !== codeStyle ||
    savedDesign.purpose !== purpose ||
    savedDesign.show_logo !== showLogo ||
    (savedDesign.store_info ?? '') !== storeInfo.trim() ||
    (savedDesign.tagline ?? '') !== customTagline.trim()
  const saveDesignMut = useMutation({
    mutationFn: () => saveMemberCardDesign(currentDesign),
    onSuccess: () => {
      toast.success(t('mcpDesignSaved'))
      qc.invalidateQueries({ queryKey: ['member-card-design'] })
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
  const printCards = (cards: MemberCardPoolItem[]) => {
    if (can(PERMS.CUSTOMER_MANAGE) && designDirty) saveDesignMut.mutate()
    void openPrintableCardSheet({
      cards,
      businessName,
      logoUrl,
      showLogo,
      storeInfo,
      purpose,
      template,
      accent,
      codeStyle,
      tagline: customTagline,
    })
  }

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['member-cards', status, search],
    queryFn: () => listAllMemberCards({ status: status || undefined, search: search || undefined }),
    enabled: open,
  })

  const page = data?.data?.data
  const items = page?.items ?? []
  const summary = page?.summary

  const createBatchMut = useMutation({
    mutationFn: () => createMemberCardBatch({ count: parsedBatchCount, batch_label: batchLabel || undefined }),
    onSuccess: (res) => {
      const created = res.data?.data?.items ?? []
      toast.success(t('mcpCreatedToast', { count: created.length }))
      setBatchLabel('')
      qc.invalidateQueries({ queryKey: ['member-cards'] })
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const assignMut = useMutation({
    mutationFn: () => {
      if (!assignCard) throw new Error(t('mcpNoCardSelected'))
      return assignMemberCard(assignCard.id, {
        create_customer: true,
        name: newName.trim(),
        phone: newPhone.trim() || undefined,
        notes: newNotes.trim() || undefined,
      })
    },
    onSuccess: () => {
      toast.success(t('mcpActivatedToast', { serial: assignCard?.serial_label ?? '' }))
      setAssignCard(null)
      setNewName('')
      setNewPhone('')
      setNewNotes('')
      qc.invalidateQueries({ queryKey: ['member-cards'] })
      qc.invalidateQueries({ queryKey: ['customers'] })
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const unassignMut = useMutation({
    mutationFn: (id: string) => unassignMemberCard(id),
    onSuccess: () => {
      toast.success(t('mcpUnassignedToast'))
      qc.invalidateQueries({ queryKey: ['member-cards'] })
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const blockMut = useMutation({
    mutationFn: (id: string) => blockMemberCard(id, 'Diblokir dari dashboard'),
    onSuccess: () => {
      toast.success(t('mcpBlockedToast'))
      qc.invalidateQueries({ queryKey: ['member-cards'] })
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  if (!open) return null

  // Hanya kartu yang belum dipakai: mencetak ulang kartu yang sudah tertaut
  // ke pelanggan menghasilkan kartu fisik kembar dengan kode yang sama.
  const printableCards = items.filter((c) => c.status === 'available')
  const acc = ACCENTS[accent]
  const isDark = template === 'dark'
  const isMinimal = template === 'minimal'
  const previewTagline =
    customTagline.trim() ||
    defaultTagline(purpose)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-6">
      <div className="bg-card border border-border rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden shadow-xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/15 text-blue-600 flex items-center justify-center shrink-0">
              <CreditCard size={20} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-foreground truncate">
                {t('mcpTitle')}
              </h2>
              <p className="text-xs text-muted-foreground">
                {t('mcpSubtitle')}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-muted-foreground hover:bg-muted">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-border p-3">
              <p className="text-xs text-muted-foreground">{t('mcpSummaryAvailable')}</p>
              <p className="text-xl font-bold text-blue-600">{summary?.available ?? 0}</p>
            </div>
            <div className="rounded-xl border border-border p-3">
              <p className="text-xs text-muted-foreground">{t('mcpSummaryAssigned')}</p>
              <p className="text-xl font-bold text-emerald-600">{summary?.assigned ?? 0}</p>
            </div>
            <div className="rounded-xl border border-border p-3">
              <p className="text-xs text-muted-foreground">{t('mcpStatusBlocked')}</p>
              <p className="text-xl font-bold text-rose-600">{summary?.blocked ?? 0}</p>
            </div>
          </div>

          {/* Generate Batch + Template & Print Controls */}
          <div className="grid lg:grid-cols-2 gap-4">
            {can(PERMS.CUSTOMER_MANAGE) && (
              <div className="rounded-xl border border-border p-4 space-y-3 bg-muted/20">
                <p className="text-xs font-semibold text-foreground">{t('mcpNewBatch')}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs text-muted-foreground shrink-0">{t('mcpCountLabel')}</label>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    placeholder="1–200"
                    value={batchCountText}
                    onChange={(e) => setBatchCountText(e.target.value)}
                    className="w-24 px-2.5 py-1.5 text-xs font-semibold border border-border rounded-lg bg-card"
                  />
                  {[10, 25, 50, 100].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setBatchCountText(String(n))}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition ${
                        parsedBatchCount === n
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'border-border text-foreground hover:bg-muted'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                {/* min-w-0 + flex-wrap: di lebar ponsel kolom label dulu meluapkan
                    tombol "Buat N Kartu" keluar tepi modal. */}
                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    placeholder={t('mcpBatchLabelPlaceholder')}
                    value={batchLabel}
                    onChange={(e) => setBatchLabel(e.target.value)}
                    className="flex-1 min-w-0 basis-40 px-3 py-1.5 text-xs border border-border rounded-lg bg-card"
                  />
                  <button
                    type="button"
                    disabled={!batchCountValid || createBatchMut.isPending}
                    onClick={() => createBatchMut.mutate()}
                    className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3.5 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Plus size={14} /> {batchCountValid ? t('mcpCreateN', { count: parsedBatchCount }) : t('mcpCreate')}
                  </button>
                </div>

                {/* Live CR80 Card Preview */}
                <div className="pt-1">
                  <p className="text-[11px] font-medium text-muted-foreground mb-1.5">{t('mcpPreview')}</p>
                  <div
                    className="mx-auto max-w-[310px] aspect-[85.6/54] rounded-xl overflow-hidden flex flex-col shadow-sm border"
                    style={{
                      background: isDark ? '#0F172A' : '#FFFFFF',
                      borderColor: isDark ? '#334155' : '#CBD5E1',
                    }}
                  >
                    <div
                      className="px-3 py-2 flex items-center gap-2"
                      style={{
                        background: isMinimal ? '#FFFFFF' : isDark ? '#1E293B' : acc.hex,
                        borderTop: isMinimal ? `4px solid ${acc.hex}` : undefined,
                        borderBottom: isMinimal
                          ? '1px solid #E2E8F0'
                          : isDark
                            ? `2px solid ${acc.hex}`
                            : undefined,
                      }}
                    >
                      {showLogo && (
                        <div
                          className="w-7 h-7 rounded-md overflow-hidden shrink-0 flex items-center justify-center text-[10px] font-extrabold border"
                          style={{
                            background: logoUrl ? '#FFFFFF' : isDark ? acc.hex : acc.soft,
                            color: isDark ? '#FFFFFF' : acc.hex,
                            borderColor: isDark ? '#475569' : '#E2E8F0',
                          }}
                        >
                          {logoUrl ? (
                            <img src={logoUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            storeInitials(businessName || 'Loka Kasir')
                          )}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p
                          className="text-xs font-bold truncate leading-tight"
                          style={{ color: isMinimal ? '#0F172A' : '#FFFFFF' }}
                        >
                          {businessName || 'Loka Kasir'}
                        </p>
                        <p
                          className="text-[8px] font-bold tracking-wider"
                          style={{ color: isMinimal ? acc.hex : isDark ? acc.soft : '#E2E8F0' }}
                        >
                          {purpose === 'gym' ? t('mcpCardTitleGym') : t('mcpCardTitle')}
                        </p>
                      </div>
                      <span
                        className="px-1.5 py-0.5 rounded text-[10px] font-extrabold shrink-0"
                        style={{
                          background: isDark ? acc.hex : acc.soft,
                          color: isDark ? '#FFFFFF' : acc.hex,
                        }}
                      >
                        #001
                      </span>
                    </div>
                    <div className="flex-1 px-3 py-1.5 flex items-center gap-2.5">
                      {codeStyle !== 'barcode' && (
                        <div className="w-12 h-12 rounded bg-white border border-gray-200 flex items-center justify-center text-[9px] font-bold text-gray-500 shrink-0">
                          QR
                        </div>
                      )}
                      <div className={`flex-1 min-w-0 flex flex-col ${codeStyle === 'qr' ? 'items-start' : 'items-center'}`}>
                        {codeStyle !== 'qr' && (
                          <div className="w-full h-5 rounded bg-white px-1.5 flex items-center justify-between gap-[2px] mb-1">
                            {Array.from({ length: 20 }).map((_, i) => (
                              <span key={i} className="h-3.5 bg-gray-900" style={{ width: i % 2 === 0 ? 2 : 1 }} />
                            ))}
                          </div>
                        )}
                        <p
                          className="text-[11px] font-extrabold tracking-wider"
                          style={{ color: isDark ? '#FFFFFF' : '#111827' }}
                        >
                          ABCD-2345
                        </p>
                        <p
                          className={`text-[8px] leading-tight line-clamp-2 ${codeStyle === 'qr' ? 'text-left' : 'text-center'}`}
                          style={{ color: isDark ? '#94A3B8' : '#4B5563' }}
                        >
                          {previewTagline}
                        </p>
                      </div>
                    </div>
                    <div
                      className="px-3 pb-1.5 flex items-center justify-between gap-2 text-[7.5px]"
                      style={{ color: isDark ? '#64748B' : '#94A3B8' }}
                    >
                      <span className="truncate">{storeInfo}</span>
                      <span className="italic shrink-0 inline-flex items-center gap-[3px]">
                        <img src={POWERED_BY_LOGO} alt="" className="w-[9px] h-[9px]" />
                        {POWERED_BY}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-xl border border-border p-4 space-y-2.5 bg-muted/20">
              <p className="text-xs font-semibold text-foreground">{t('mcpDesignTitle')}</p>
              <div className="flex flex-wrap gap-1.5">
                {([
                  ['classic', t('mcpTemplateClassic')],
                  ['dark', t('mcpTemplateDark')],
                  ['minimal', t('mcpTemplateMinimal')],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTemplate(key)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition ${
                      template === key
                        ? 'bg-foreground text-background border-foreground'
                        : 'border-border bg-card text-foreground hover:bg-muted'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {(Object.keys(ACCENTS) as AccentKey[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setAccent(key)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full border transition ${
                      accent === key ? 'border-foreground bg-card shadow-xs' : 'border-border bg-card/60 hover:bg-card'
                    }`}
                  >
                    <span className="w-3 h-3 rounded-full" style={{ background: ACCENTS[key].hex }} />
                    {t(ACCENTS[key].labelKey)}
                  </button>
                ))}
              </div>
              <div className="grid sm:grid-cols-2 gap-2">
                <select
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value as Purpose)}
                  className="px-2.5 py-1.5 text-xs border border-border rounded-lg bg-card"
                >
                  <option value="general">{t('mcpPurposeGeneral')}</option>
                  <option value="gym">{t('mcpPurposeGym')}</option>
                </select>
                <select
                  value={codeStyle}
                  onChange={(e) => setCodeStyle(e.target.value as CodeStyle)}
                  className="px-2.5 py-1.5 text-xs border border-border rounded-lg bg-card"
                >
                  <option value="both">{t('mcpFormatBoth')}</option>
                  <option value="qr">{t('mcpFormatQr')}</option>
                  <option value="barcode">{t('mcpFormatBarcode')}</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showLogo}
                  onChange={(e) => setShowLogo(e.target.checked)}
                  className="rounded border-border"
                />
                <span>
                  {t('mcpShowLogo')} {logoUrl ? t('mcpLogoFromProfile') : t('mcpLogoInitials')}
                </span>
              </label>
              <input
                type="text"
                placeholder={t('mcpFooterPlaceholder')}
                value={storeInfo}
                onChange={(e) => setStoreInfoOverride(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-border rounded-lg bg-card"
              />
              <input
                type="text"
                placeholder={t('mcpTaglinePlaceholder')}
                value={customTagline}
                onChange={(e) => setCustomTagline(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-border rounded-lg bg-card"
              />
              {can(PERMS.CUSTOMER_MANAGE) && (
                <button
                  type="button"
                  disabled={!designDirty || saveDesignMut.isPending}
                  onClick={() => saveDesignMut.mutate()}
                  className="w-full px-3 py-1.5 text-xs font-semibold rounded-lg border border-border hover:bg-muted disabled:opacity-50"
                >
                  {designDirty ? t('mcpDesignSave') : t('mcpDesignSavedState')}
                </button>
              )}
              <button
                type="button"
                disabled={printableCards.length === 0}
                onClick={() => printCards(printableCards)}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50"
              >
                <Printer size={14} /> {t('mcpPrintButton', { count: printableCards.length })}
              </button>
            </div>
          </div>

          {/* Search & Status Filter */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('mcpSearchPlaceholder')}
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-border rounded-xl bg-card"
              />
            </div>
            {[
              ['', t('mcpStatusAll')],
              ['available', t('mcpStatusAvailable')],
              ['assigned', t('mcpStatusAssigned')],
              ['blocked', t('mcpStatusBlocked')],
            ].map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setStatus(val)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition ${
                  status === val
                    ? 'bg-foreground text-background border-foreground'
                    : 'border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => refetch()}
              className="px-3 py-1.5 text-xs border border-border rounded-xl text-muted-foreground hover:bg-muted"
            >
              {t('mcpRefresh')}
            </button>
          </div>

          {/* Inline quick assign form */}
          {assignCard && (
            <div className="rounded-xl border border-blue-300 bg-blue-50/60 dark:bg-blue-500/10 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-foreground">
                  {t('mcpAssignTitle', { serial: assignCard.serial_label, code: formatMemberCardCode(assignCard.card_code) })}
                </p>
                <button onClick={() => setAssignCard(null)} className="text-muted-foreground hover:text-foreground">
                  <X size={16} />
                </button>
              </div>
              <div className="grid sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder={t('mcpNamePlaceholder')}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="px-3 py-2 text-sm border border-border rounded-xl bg-card"
                />
                <input
                  type="text"
                  placeholder={t('mcpPhonePlaceholder')}
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="px-3 py-2 text-sm border border-border rounded-xl bg-card"
                />
                <input
                  type="text"
                  placeholder={t('mcpNotesPlaceholder')}
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className="px-3 py-2 text-sm border border-border rounded-xl bg-card"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAssignCard(null)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-border"
                >
                  {t('mcpCancel')}
                </button>
                <button
                  type="button"
                  disabled={!newName.trim() || assignMut.isPending}
                  onClick={() => assignMut.mutate()}
                  className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {t('mcpSaveActivate')}
                </button>
              </div>
            </div>
          )}

          {/* List */}
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">{t('mcpLoading')}</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {t('mcpEmpty')}
            </p>
          ) : (
            <div className="border border-border rounded-xl overflow-hidden divide-y divide-border">
              {items.map((card) => (
                <div key={card.id} className="px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-muted/30">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="px-2 py-1 rounded-lg text-xs font-extrabold bg-muted text-foreground shrink-0">
                      {card.serial_label}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {card.status === 'assigned'
                          ? card.customer_name || t('mcpMemberFallback')
                          : formatMemberCardCode(card.card_code)}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {card.status === 'assigned'
                          ? t('mcpAssignedLine', {
                              code: formatMemberCardCode(card.card_code),
                              phone: card.customer_phone || t('mcpNoPhone'),
                              balance: formatMoney(card.deposit_balance ?? 0),
                              points: card.points_balance ?? 0,
                            })
                          : card.batch_label || t('mcpReadyToUse')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        card.status === 'assigned'
                          ? 'bg-emerald-50 text-emerald-700'
                          : card.status === 'blocked'
                            ? 'bg-rose-50 text-rose-700'
                            : 'bg-blue-50 text-blue-700'
                      }`}
                    >
                      {card.status === 'assigned'
                        ? t('mcpStatusAssigned')
                        : card.status === 'blocked'
                          ? t('mcpStatusBlocked')
                          : t('mcpStatusAvailable')}
                    </span>
                    {card.status === 'available' && (
                      <button
                        type="button"
                        onClick={() => setAssignCard(card)}
                        title={t('mcpRegisterTitle')}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50"
                      >
                        <UserPlus size={13} /> {t('mcpRegister')}
                      </button>
                    )}
                    {card.status === 'assigned' && (
                      <button
                        type="button"
                        onClick={() => printCards([card])}
                        title={t('mcpReprintTitle')}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border border-border text-foreground hover:bg-muted"
                      >
                        <Printer size={13} /> {t('mcpReprint')}
                      </button>
                    )}
                    {card.status === 'assigned' && can(PERMS.CUSTOMER_MANAGE) && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(t('mcpUnassignConfirm', { serial: card.serial_label }))) {
                              unassignMut.mutate(card.id)
                            }
                          }}
                          title={t('mcpUnassignTitle')}
                          className="p-1.5 text-muted-foreground hover:text-amber-600 rounded-lg hover:bg-amber-50"
                        >
                          <Unlink size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(t('mcpBlockConfirm', { serial: card.serial_label }))) {
                              blockMut.mutate(card.id)
                            }
                          }}
                          title={t('mcpBlockTitle')}
                          className="p-1.5 text-muted-foreground hover:text-rose-600 rounded-lg hover:bg-rose-50"
                        >
                          <Ban size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
