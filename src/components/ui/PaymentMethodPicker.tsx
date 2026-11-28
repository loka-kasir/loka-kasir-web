import { useCallback, useRef, useState } from 'react'
import Modal from '@/components/ui/Modal'
import { getPaymentMethods, type PaymentMethodOption } from '@/api/payment'
import { formatMoneyIn } from '@/lib/money'
import { t } from '@/lib/i18n'

/** Dilempar `pick()` saat pengguna menutup pemilih tanpa memilih. */
export class PaymentPickCancelled extends Error {
  constructor() {
    super('payment method selection cancelled')
    this.name = 'PaymentPickCancelled'
  }
}

const GROUP_ORDER: PaymentMethodOption['group'][] = ['qris', 'ewallet', 'va', 'retail', 'card']
const GROUP_LABEL = {
  qris: 'payMethodGroupQris',
  ewallet: 'payMethodGroupEwallet',
  va: 'payMethodGroupVa',
  retail: 'payMethodGroupRetail',
  card: 'payMethodGroupCard',
} as const

/**
 * Pemilih kanal Duitku (API v2) sebelum tagihan langganan dibuat.
 *
 * `pick()` mengembalikan kode kanal yang dipilih. Bila daftar kanal gagal
 * dimuat (mis. server belum diperbarui) hasilnya string kosong, dan tagihan
 * jatuh ke halaman checkout Duitku seperti sebelumnya — pembayaran tidak boleh
 * terblokir hanya karena daftar kanal tidak terbaca. Hanya satu kanal (bisnis
 * luar negeri: kartu) → langsung dipakai tanpa menampilkan pemilih.
 */
export function usePaymentMethodPicker() {
  const [open, setOpen] = useState(false)
  const [methods, setMethods] = useState<PaymentMethodOption[]>([])
  const resolver = useRef<{ resolve: (code: string) => void; reject: (e: Error) => void } | null>(null)

  const pick = useCallback(async (amount?: number): Promise<string> => {
    let list: PaymentMethodOption[]
    try {
      const res = await getPaymentMethods(amount)
      list = res.data.data ?? []
    } catch {
      list = []
    }
    if (list.length === 0) return ''
    if (list.length === 1) return list[0].code
    setMethods(list)
    setOpen(true)
    return new Promise<string>((resolve, reject) => {
      resolver.current = { resolve, reject }
    })
  }, [])

  const choose = (code: string) => {
    setOpen(false)
    resolver.current?.resolve(code)
    resolver.current = null
  }

  const cancel = () => {
    setOpen(false)
    resolver.current?.reject(new PaymentPickCancelled())
    resolver.current = null
  }

  const groups = GROUP_ORDER
    .map((g) => ({ group: g, items: methods.filter((m) => m.group === g) }))
    .filter((g) => g.items.length > 0)

  const element = (
    <Modal open={open} onClose={cancel} title={t('payChooseMethod')} size="sm">
      <div className="space-y-4">
        {groups.map(({ group, items }) => (
          <div key={group} className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {t(GROUP_LABEL[group])}
            </p>
            <div className="grid gap-2">
              {items.map((m) => (
                <button
                  key={m.code}
                  type="button"
                  onClick={() => choose(m.code)}
                  className="flex items-center gap-3 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-left hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition"
                >
                  {m.image ? (
                    <img src={m.image} alt="" className="h-7 w-12 object-contain shrink-0" loading="lazy" />
                  ) : (
                    <span className="h-7 w-12 shrink-0" />
                  )}
                  <span className="flex-1 text-sm font-medium text-foreground">{m.name}</span>
                  {m.fee > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {t('payMethodFee', { fee: formatMoneyIn(m.fee, 'IDR') })}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )

  return { pick, element }
}
