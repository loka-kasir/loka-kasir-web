import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, Plus, Minus } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import type { UserQuota } from '@/types'
import { formatMoneyIn } from '@/lib/money'
import { cn } from '@/lib/utils'
import { t } from '@/lib/i18n'

interface UserQuotaSectionProps {
  quota?: UserQuota | null
  compact?: boolean
  showManageLink?: boolean
  busy?: boolean
  onBuySlots?: (qty: number, months: number, title: string) => void
}

const rupiah = (n: number) => formatMoneyIn(n, 'IDR')

interface UserAddonPickerModalProps {
  open: boolean
  onClose: () => void
  quota: UserQuota
  fixedQty?: number
  employeeName?: string
  busy?: boolean
  onConfirm: (qty: number, months: number, title: string) => void
}

export function UserAddonPickerModal({
  open,
  onClose,
  quota,
  fixedQty,
  employeeName,
  busy = false,
  onConfirm,
}: UserAddonPickerModalProps) {
  const maxMonths = Math.max(1, quota.remaining_addon_months ?? 1)
  const unitPrice = quota.extra_user_monthly_price > 0 ? quota.extra_user_monthly_price : 5000
  const [qty, setQty] = useState(fixedQty ?? 1)
  const [months, setMonths] = useState(1)

  useEffect(() => {
    if (!open) return
    setQty(fixedQty ?? 1) // eslint-disable-line react-hooks/set-state-in-effect
    setMonths(1)
  }, [open, fixedQty, maxMonths])

  const presets: number[] = []
  for (const m of [1, 3, 6]) {
    if (m < maxMonths) presets.push(m)
  }
  if (!presets.includes(maxMonths)) presets.push(maxMonths)

  const total = qty * months * unitPrice
  const modalTitle = employeeName
    ? t('uqAddonPayForEmployee', { name: employeeName })
    : t('uqAddonTitle')

  return (
    <Modal open={open} onClose={onClose} title={modalTitle} size="sm">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {maxMonths > 1
            ? t('uqAddonSelectedSubtitle', { months, maxMonths })
            : t('uqAddonDurationSingle', { months })}
        </p>

        {fixedQty === undefined && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-foreground">{t('uqAddonQtyLabel')}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={qty <= 1}
                onClick={() => setQty((n) => Math.max(1, n - 1))}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-border hover:bg-muted disabled:opacity-40 transition"
              >
                <Minus size={14} />
              </button>
              <span className="w-10 text-center font-bold text-foreground">+{qty}</span>
              <button
                type="button"
                disabled={qty >= 50}
                onClick={() => setQty((n) => Math.min(50, n + 1))}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-border hover:bg-muted disabled:opacity-40 transition"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>
        )}

        {maxMonths > 1 && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-foreground">{t('uqAddonDurationLabel')}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={months <= 1}
                  onClick={() => setMonths((n) => Math.max(1, n - 1))}
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-border hover:bg-muted disabled:opacity-40 transition"
                >
                  <Minus size={14} />
                </button>
                <span className="min-w-[4.5rem] text-center font-bold text-foreground">
                  {t('uqAddonMonthsShort', { months })}
                </span>
                <button
                  type="button"
                  disabled={months >= maxMonths}
                  onClick={() => setMonths((n) => Math.min(maxMonths, n + 1))}
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-border hover:bg-muted disabled:opacity-40 transition"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {presets.map((preset) => {
                const active = months === preset
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setMonths(preset)}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-xs font-semibold border transition',
                      active
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-card text-foreground border-border hover:bg-muted',
                    )}
                  >
                    {preset === maxMonths
                      ? t('uqAddonUntilPlanEnd', { months: maxMonths })
                      : t('uqAddonMonthsShort', { months: preset })}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="bg-muted rounded-xl p-3.5 space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{t('uqAddonRateRow', { qty, unitPrice: rupiah(unitPrice), months })}</span>
            <span>{rupiah(total)}</span>
          </div>
          <div className="border-t border-border pt-2 flex justify-between items-center">
            <span className="text-sm font-medium text-foreground">{t('memTotalPayable')}</span>
            <span className="text-base font-bold text-foreground">{rupiah(total)}</span>
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 border border-border text-muted-foreground text-sm font-medium rounded-xl hover:bg-muted transition"
          >
            {t('actionCancel')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              onConfirm(
                qty,
                months,
                employeeName
                  ? t('uqAddonPayForEmployee', { name: employeeName })
                  : t('uqAddonPayTitle', { qty }),
              )
            }}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition"
          >
            {busy ? t('processing') : t('memContinueToPayment')}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default function UserQuotaSection({
  quota,
  compact = false,
  showManageLink = false,
  busy = false,
  onBuySlots,
}: UserQuotaSectionProps) {
  const navigate = useNavigate()
  const [modalOpen, setModalOpen] = useState(false)

  if (!quota) return null

  const paidExtra = Math.max(0, quota.paid_extra_users ?? 0)
  const allowed = Math.max(quota.included_users, quota.total_allowed_users ?? (quota.included_users + paidExtra))
  const unitPrice = quota.extra_user_monthly_price > 0 ? quota.extra_user_monthly_price : 5000
  const remMonths = Math.max(1, quota.remaining_addon_months ?? 1)
  const slotPrice = quota.addon_slot_price && quota.addon_slot_price > 0
    ? quota.addon_slot_price
    : unitPrice * remMonths
  const requiresAddon = !!quota.requires_addon_now
  const overAllowed = quota.active_users > allowed
  const ratio = allowed > 0 ? Math.min(1, quota.active_users / allowed) : 1

  const hintText = overAllowed
    ? t('uqOverHint', {
        active: quota.active_users,
        monthlyCost: rupiah(quota.extra_users * unitPrice),
        extra: quota.extra_users,
        unitPrice: rupiah(unitPrice),
      })
    : requiresAddon
      ? t('uqYearlyHint', {
          perOutlet: quota.included_users_per_outlet,
          unitPrice: rupiah(unitPrice),
          months: remMonths,
          slotPrice: rupiah(slotPrice),
        })
      : t('uqMonthlyHint', {
          perOutlet: quota.included_users_per_outlet,
          unitPrice: rupiah(unitPrice),
        })

  const showAddBtn = requiresAddon && !!onBuySlots
  const showManageBtn = showManageLink && quota.extra_users > 0

  return (
    <>
      <div
        className={cn(
          'rounded-2xl border',
          compact ? 'p-3.5 space-y-2' : 'p-5 space-y-3',
          overAllowed
            ? 'bg-amber-50/80 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30'
            : 'bg-card border-border',
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <Users
              size={18}
              className={cn(
                'shrink-0',
                overAllowed ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400',
              )}
            />
            <span className="font-semibold text-sm text-foreground">
              {overAllowed
                ? t('uqOverTitle', {
                    active: quota.active_users,
                    extra: quota.extra_users,
                    included: quota.included_users,
                  })
                : t('uqUsage', {
                    active: quota.active_users,
                    allowed,
                  })}
            </span>
            <span
              className={cn(
                'text-xs font-semibold px-2.5 py-0.5 rounded-full',
                overAllowed
                  ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300'
                  : 'bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300',
              )}
            >
              {paidExtra > 0
                ? t('uqPaidTag', { perOutlet: quota.included_users_per_outlet, paid: paidExtra })
                : t('uqPerOutletTag', { perOutlet: quota.included_users_per_outlet, outlets: quota.active_outlets })}
            </span>
          </div>

          {(showAddBtn || showManageBtn) && (
            <div className="flex items-center gap-2 shrink-0">
              {showAddBtn && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-semibold rounded-xl transition"
                >
                  <Plus size={13} />
                  {t('uqAddSlot')}
                </button>
              )}
              {showManageBtn && (
                <button
                  type="button"
                  onClick={() => navigate('/employees')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border hover:bg-muted text-xs font-medium text-foreground rounded-xl transition"
                >
                  {t('uqManageStaff')}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              'h-full transition-all',
              overAllowed ? 'bg-amber-500' : ratio >= 1 ? 'bg-amber-500' : 'bg-blue-600',
            )}
            style={{ width: `${ratio * 100}%` }}
          />
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">{hintText}</p>
      </div>

      {requiresAddon && (
        <UserAddonPickerModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          quota={quota}
          busy={busy}
          onConfirm={(qty, months, title) => {
            setModalOpen(false)
            onBuySlots?.(qty, months, title)
          }}
        />
      )}
    </>
  )
}
