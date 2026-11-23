import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import WhatsAppReminderCard from './WhatsAppReminderCard'
import { getUserProfile } from '@/api/business'
import { t } from '@/lib/i18n'

const state = vi.hoisted(() => ({ role: 'OWNER' }))
vi.mock('@/api/business', () => ({ getUserProfile: vi.fn() }))
vi.mock('@/store/authStore', () => ({ useAuthStore: (selector: (s: unknown) => unknown) => selector({ user: { role: { code: state.role } } }) }))

let root: Root
let host: HTMLDivElement
beforeEach(() => { (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true; localStorage.clear(); state.role = 'OWNER'; vi.clearAllMocks() })
afterEach(() => { act(() => root?.unmount()); host?.remove() })

async function mount(whatsapp?: string) {
  vi.mocked(getUserProfile).mockResolvedValue({ data: { data: { whatsapp_number: whatsapp } } } as Awaited<ReturnType<typeof getUserProfile>>)
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  await act(async () => { root.render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><WhatsAppReminderCard /></MemoryRouter></QueryClientProvider>); await new Promise((r) => setTimeout(r, 20)) })
  await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
}

it('mengingatkan pemilik tanpa nomor WA dan bisa disembunyikan sementara', async () => {
  await mount('')
  expect(host.textContent).toContain(t('waReminderTitle'))
  await act(async () => { host.querySelector('button')!.click() })
  expect(host.textContent).toBe('')
  expect(Number(localStorage.getItem('loka.dashboard.whatsapp-reminder-snoozed-until'))).toBeGreaterThan(Date.now())
})

it('tidak tampil bila nomor WA sudah ada atau pengguna bukan pemilik', async () => {
  await mount('6281234567890')
  expect(host.textContent).toBe('')
  act(() => root.unmount())
  state.role = 'CASHIER'
  await mount('')
  expect(host.textContent).toBe('')
  expect(getUserProfile).toHaveBeenCalledTimes(1)
})
