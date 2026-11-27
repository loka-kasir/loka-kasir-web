// Saklar "Pakai Purchase Order": nyala = halaman PO seperti biasa; mati =
// halaman yang sama menjadi "Pembelian" sekali jalan. Respons berbentuk sama
// dengan controller Go.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => [] as { method: string; url: string; body?: unknown; config?: unknown }[])

vi.mock('lottie-react', () => ({ default: () => null }))
vi.mock('@/lib/axios', () => {
  const po1Detail = {
    id: 'po1', po_number: 'PB-20261030-001', status: 'received', is_direct: true, order_date: '2026-10-30', total_amount: 240000,
    received_amount: 240000, paid_amount: 0, payable_balance: 240000, payment_status: 'unpaid',
    items: [
      { id: 'item1', item_type: 'product', product_id: 'prod1', name: 'Aqua 600ml', raw_material_name: 'Aqua 600ml', unit_alias: 'pcs', unit_conversion: 1, quantity_ordered: 48, quantity_received: 48, unit_cost: 2917, subtotal: 140016 },
    ],
    created_at: '2026-10-30T03:00:00Z',
  }
  const list = {
    status: true, message: '!OK',
    data: [
      { ...po1Detail, items: [] },
      { id: 'po2', po_number: 'PO-LAMA', status: 'ordered', order_date: '2026-10-01', total_amount: 50000,
        received_amount: 0, paid_amount: 0, payable_balance: 0, payment_status: 'none', items: [], created_at: '2026-10-01T03:00:00Z' },
      { id: 'po3', po_number: 'PB-20261030-002', status: 'cancelled', is_direct: true, order_date: '2026-10-30', total_amount: 140016,
        received_amount: 0, paid_amount: 0, payable_balance: 0, payment_status: 'none', items: [], created_at: '2026-10-30T04:00:00Z' },
    ],
    pagination: { page: 1, limit: 20, total: 3 },
  }
  const productSearch = {
    status: true,
    data: [
      { product_id: 'prod1', name: 'Aqua/Le Minerale 600ml', has_variant: false, is_weight_based: false, track_stock: true, base_unit: 'pcs', current_cost: 2917, last_unit_cost: 2917, stock: 10, variants: [], sale_units: [] },
    ],
  }
  const byUrl = (url: string) => {
    if (url === '/purchase-order') return list
    if (url === '/purchase-order/po1') return { status: true, data: po1Detail }
    if (url === '/purchase-order/po1/payments') return { status: true, data: { purchase_order_id: 'po1', received_amount: 240000, paid_amount: 0, balance: 240000, payment_status: 'unpaid', days_overdue: 0, payments: [] } }
    if (url === '/purchase-order/products') return productSearch
    return { status: true, data: [] }
  }
  const record = (method: string) => (url: string, body?: unknown, config?: unknown) => {
    calls.push({ method, url, body, config })
    if (url === '/business/purchase-orders') {
      return Promise.resolve({ data: { status: true, data: { purchase_orders_enabled: (body as { enabled: boolean }).enabled } } })
    }
    return Promise.resolve({ data: byUrl(url) })
  }
  return { default: { get: record('get'), post: record('post'), put: record('put'), patch: record('patch'), delete: record('delete'),
    interceptors: { request: { use() {} }, response: { use() {} } } } }
})

import { useAuthStore } from '@/store/authStore'
import { useOutletStore } from '@/store/outletStore'
import PurchaseOrdersPage from './PurchaseOrdersPage'
import PurchaseOrdersToggle from '@/components/settings/PurchaseOrdersToggle'
import { NAV_ITEMS, navLabel } from '@/components/layout/navItems'
import { t } from '@/lib/i18n'

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  calls.length = 0
})
afterEach(() => { act(() => root.unmount()); host.remove() })

function login(purchaseOrders?: boolean) {
  useAuthStore.setState({
    token: 'x',
    user: { id: 'u', role: { code: 'OWNER', name: 'Owner' }, permissions: [],
      business: { business_name: 'Toko Uji', owner_name: 'Uji', purchase_orders_enabled: purchaseOrders,
        membership: { status: 'ACTIVE', tier: 'pro', is_active: true, end_date: '2099-12-31T00:00:00Z' } } } as never,
  })
}

async function render(el: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => { root.render(<QueryClientProvider client={qc}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>) })
  await act(async () => { await new Promise(r => setTimeout(r, 50)) })
}

const buttons = () => Array.from(document.querySelectorAll('button'))
const poNav = NAV_ITEMS.find(item => item.path === '/inventory/purchase-orders')!

describe('Pakai Purchase Order', () => {
  it('nyala (bawaan, juga sesi lama tanpa kolomnya): halaman PO apa adanya', async () => {
    login(undefined)
    await render(<PurchaseOrdersPage />)
    const text = document.body.textContent ?? ''
    expect(text).toContain(t('navPurchaseOrders'))
    expect(buttons().some(b => b.textContent === t('poStatusOrderedTab'))).toBe(true)
    expect(buttons().some(b => b.textContent?.includes(t('poCreateShort')))).toBe(true)
    expect(navLabel(poNav)).toBe(t('navPurchaseOrders'))
  })

  it('mati: "Pembelian", tanpa tab status, tombol Catat Pembelian', async () => {
    login(false)
    await render(<PurchaseOrdersPage />)
    const text = document.body.textContent ?? ''
    expect(text).toContain(t('dpurTitle'))
    expect(buttons().some(b => b.textContent === t('poStatusOrderedTab'))).toBe(false)
    expect(navLabel(poNav)).toBe(t('dpurTitle'))
    // Pembelian langsung memperlihatkan status bayar, PO lama status PO-nya.
    const directRow = Array.from(document.querySelectorAll('tr')).find(tr => tr.textContent?.includes('PB-20261030-001'))!
    expect(directRow.textContent).toContain(t('htsStatusUnpaid'))
    expect(directRow.textContent).not.toContain(t('poStatusReceived'))
    const oldRow = Array.from(document.querySelectorAll('tr')).find(tr => tr.textContent?.includes('PO-LAMA'))!
    expect(oldRow.textContent).toContain(t('poStatusOrdered'))

    const add = buttons().find(b => b.textContent?.includes(t('dpurNew')))!
    await act(async () => { add.click() })
    await act(async () => { await new Promise(r => setTimeout(r, 20)) })
    const modal = document.body.textContent ?? ''
    expect(modal).toContain(t('dpurDate'))
    expect(modal).toContain(t('dpurPayNow'))
    expect(modal).not.toContain(t('poExpectedDate'))
    expect(document.querySelector('input[placeholder="PO-2024-001"]')).toBeNull()
  })

  it('saklar pengaturan: PATCH lalu sesi ikut berubah', async () => {
    login(true)
    await render(<PurchaseOrdersToggle />)
    const sw = document.querySelector('button[role="switch"]') as HTMLButtonElement
    expect(sw.getAttribute('aria-checked')).toBe('true')
    await act(async () => { sw.click() })
    await act(async () => { await new Promise(r => setTimeout(r, 20)) })
    expect(calls).toContainEqual(expect.objectContaining({ method: 'patch', url: '/business/purchase-orders', body: { enabled: false } }))
    expect(useAuthStore.getState().user?.business?.purchase_orders_enabled).toBe(false)
  })

  it('saklar pengaturan disembunyikan dari selain pemilik', async () => {
    useAuthStore.setState({ token: 'x', user: { id: 'u', role: { code: 'MANAGER', name: 'Manajer' }, permissions: [], business: {} } as never })
    await render(<PurchaseOrdersToggle />)
    expect(document.querySelector('button[role="switch"]')).toBeNull()
  })

  it('pembelian langsung yang sudah diterima punya tombol Batalkan dan Hapus dengan modal alasan', async () => {
    login(false)
    await render(<PurchaseOrdersPage />)
    const directRow = Array.from(document.querySelectorAll('tr')).find(tr => tr.textContent?.includes('PB-20261030-001'))!
    const rowButtons = Array.from(directRow.querySelectorAll('button'))
    const cancelBtn = rowButtons.find(b => b.textContent?.includes(t('actionCancelOrder')))
    const deleteBtn = rowButtons.find(b => b.textContent?.includes(t('actionDelete')) || b.getAttribute('aria-label')?.includes(t('actionDelete')))
    expect(cancelBtn).toBeTruthy()
    expect(deleteBtn).toBeTruthy()

    // Uji Batalkan: buka modal alasan, isi alasan, kirim PATCH /cancel
    await act(async () => { cancelBtn!.click() })
    await act(async () => { await new Promise(r => setTimeout(r, 20)) })
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement
    expect(textarea).toBeTruthy()
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      setter.call(textarea, 'Salah input jumlah')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const submitBtn = Array.from(document.querySelectorAll('button[type="submit"]')).pop() as HTMLButtonElement
    await act(async () => { submitBtn.click() })
    await act(async () => { await new Promise(r => setTimeout(r, 30)) })
    expect(calls).toContainEqual(expect.objectContaining({ method: 'patch', url: '/purchase-order/po1/cancel', body: { reason: 'Salah input jumlah' } }))

    // Uji Hapus: ambil ulang tombol setelah refetch, buka modal alasan, kirim DELETE dengan body reason
    const freshRow = Array.from(document.querySelectorAll('tr')).find(tr => tr.textContent?.includes('PB-20261030-001'))!
    const freshDeleteBtn = Array.from(freshRow.querySelectorAll('button')).find(b => b.textContent?.includes(t('actionDelete')) || b.getAttribute('aria-label')?.includes(t('actionDelete')))!
    await act(async () => { freshDeleteBtn.click() })
    await act(async () => { await new Promise(r => setTimeout(r, 20)) })
    const textarea2 = document.querySelector('textarea') as HTMLTextAreaElement
    expect(textarea2).toBeTruthy()
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      setter.call(textarea2, 'Transaksi duplikat')
      textarea2.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const submitBtn2 = Array.from(document.querySelectorAll('button[type="submit"]')).pop() as HTMLButtonElement
    await act(async () => { submitBtn2.click() })
    await act(async () => { await new Promise(r => setTimeout(r, 30)) })
    expect(calls).toContainEqual(expect.objectContaining({ method: 'delete', url: '/purchase-order/po1', body: { data: { reason: 'Transaksi duplikat' } } }))
  })

  it('alur lengkap Catat Pembelian langsung: cari produk, isi qty, simpan mengirim POST /direct + Idempotency-Key', async () => {
    login(false)
    useOutletStore.setState({ selected: { id: 'outlet-1', name: 'Bindan Muscle' } as never })
    await render(<PurchaseOrdersPage />)

    // Buka modal Catat Pembelian
    const addBtn = buttons().find(b => b.textContent?.includes(t('dpurNew')))!
    await act(async () => { addBtn.click() })
    await act(async () => { await new Promise(r => setTimeout(r, 30)) })

    // Cari & pilih produk Aqua/Le Minerale 600ml
    const searchInput = document.querySelector(`input[placeholder="${t('poSearchProduct')}"]`) as HTMLInputElement
    expect(searchInput).toBeTruthy()
    const inputSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => {
      inputSetter.call(searchInput, 'Aqua')
      searchInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => { await new Promise(r => setTimeout(r, 40)) })
    const pickBtn = buttons().find(b => b.textContent?.includes('Aqua/Le Minerale 600ml'))!
    expect(pickBtn).toBeTruthy()
    await act(async () => { pickBtn.click() })
    await act(async () => { await new Promise(r => setTimeout(r, 20)) })

    // Ubah kuantitas jadi 48 (48 x 2917 = 140016)
    const tableInputs = Array.from(document.querySelectorAll('[role="dialog"] table input')) as HTMLInputElement[]
    const qtyInput = tableInputs[0]
    expect(qtyInput).toBeTruthy()
    await act(async () => {
      inputSetter.call(qtyInput, '48')
      qtyInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => { await new Promise(r => setTimeout(r, 20)) })

    // Klik Simpan Pembelian
    const saveBtn = buttons().find(b => b.textContent?.includes(t('dpurSave')))!
    expect(saveBtn.disabled).toBe(false)
    await act(async () => { saveBtn.click() })
    await act(async () => { await new Promise(r => setTimeout(r, 40)) })

    const postCall = calls.find(c => c.method === 'post' && c.url === '/purchase-order/direct')
    expect(postCall).toBeTruthy()
    expect(postCall!.body).toMatchObject({
      outlet_id: 'outlet-1',
      items: [{ product_id: 'prod1', quantity_ordered: 48, unit_cost: 2917 }],
      payment: { amount: 140016, method: 'cash', cash_account_id: null },
    })
    expect((postCall!.config as { headers?: Record<string, string> })?.headers?.['Idempotency-Key']).toBeTruthy()
  })

  it('pembelian langsung yang sudah dibatalkan menampilkan badge Dibatalkan, tanpa tombol Batalkan, dan tetap bisa dihapus', async () => {
    login(false)
    await render(<PurchaseOrdersPage />)
    const cancelledRow = Array.from(document.querySelectorAll('tr')).find(tr => tr.textContent?.includes('PB-20261030-002'))!
    expect(cancelledRow.textContent).toContain(t('statusCancelled'))
    const rowButtons = Array.from(cancelledRow.querySelectorAll('button'))
    expect(rowButtons.some(b => b.textContent?.includes(t('actionCancelOrder')))).toBe(false)
    expect(rowButtons.some(b => b.textContent?.includes(t('actionDelete')))).toBe(true)
  })

  it('bisa membatalkan pembelian langsung dari dalam modal Lihat (stacked modal)', async () => {
    login(false)
    await render(<PurchaseOrdersPage />)
    const directRow = Array.from(document.querySelectorAll('tr')).find(tr => tr.textContent?.includes('PB-20261030-001'))!
    const viewBtn = Array.from(directRow.querySelectorAll('button')).find(b => b.textContent?.includes(t('actionView')))!
    await act(async () => { viewBtn.click() })
    await act(async () => { await new Promise(r => setTimeout(r, 50)) })

    // Klik Batalkan di dalam modal detail
    const dialogButtons = Array.from(document.querySelectorAll('[role="dialog"] button')) as HTMLButtonElement[]
    const modalCancelBtn = dialogButtons.find(b => b.textContent?.trim() === t('actionCancelOrder'))!
    expect(modalCancelBtn).toBeTruthy()
    await act(async () => { modalCancelBtn.click() })
    await act(async () => { await new Promise(r => setTimeout(r, 30)) })

    // Modal alasan muncul di atas modal detail
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement
    expect(textarea).toBeTruthy()
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      setter.call(textarea, 'Salah supplier')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const submitBtn = Array.from(document.querySelectorAll('button[type="submit"]')).pop() as HTMLButtonElement
    await act(async () => { submitBtn.click() })
    await act(async () => { await new Promise(r => setTimeout(r, 40)) })
    expect(calls).toContainEqual(expect.objectContaining({ method: 'patch', url: '/purchase-order/po1/cancel', body: { reason: 'Salah supplier' } }))
  })
})
