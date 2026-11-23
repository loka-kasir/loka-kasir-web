import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import toast from 'react-hot-toast'
import RegisterPage from './RegisterPage'
import { registerBusiness, sendRegistrationEmailCode, verifyRegistrationEmailCode } from '@/api/auth'
import { t } from '@/lib/i18n'

vi.mock('@/api/auth', () => ({ registerBusiness: vi.fn(), sendRegistrationEmailCode: vi.fn(), verifyRegistrationEmailCode: vi.fn() }))
vi.mock('@/api/master', () => ({ getBusinessTypes: vi.fn(async () => ({ data: { data: [] } })), getBusinessVerticals: vi.fn(async () => ({ data: { data: [] } })) }))
vi.mock('@/store/authStore', () => ({ useAuthStore: (selector: (s: unknown) => unknown) => selector({ setAuth: () => {} }) }))
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))

let root: Root
let host: HTMLDivElement

beforeEach(async () => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.clearAllMocks()
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  const client = new QueryClient()
  await act(async () => { root.render(<QueryClientProvider client={client}><MemoryRouter><RegisterPage /></MemoryRouter></QueryClientProvider>) })
})
afterEach(() => { act(() => root?.unmount()); host?.remove() })

const input = (placeholder: string) => host.querySelector<HTMLInputElement>(`input[placeholder="${placeholder}"]`)!
const type = async (el: HTMLInputElement, value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const click = async (label: string) => {
  const button = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(label))!
  await act(async () => { button.click(); await new Promise((r) => setTimeout(r, 10)) })
}
const submit = async () => {
  await act(async () => { host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
}

it('menolak pendaftaran sebelum email diverifikasi', async () => {
  await type(input(t('regOwnerNamePlaceholder')), 'Budi')
  await type(input(t('profileBusinessEmailPlaceholder')), 'budi@gmail.com')
  await type(input(t('regWhatsappPlaceholder')), '081234567890')
  await type(input(t('pwMinHint')), 'rahasia123')
  await type(input(t('regBusinessNamePlaceholder')), 'Warung Budi')
  await submit()
  expect(toast.error).toHaveBeenCalledWith(t('regEmailVerifyFirst'))
  expect(registerBusiness).not.toHaveBeenCalled()
})

it('kirim kode, verifikasi, lalu nomor WhatsApp diperiksa', async () => {
  vi.mocked(sendRegistrationEmailCode).mockResolvedValue({ data: { status: true, data: { resend_after: 60, expires_in: 600 } } } as Awaited<ReturnType<typeof sendRegistrationEmailCode>>)
  vi.mocked(verifyRegistrationEmailCode).mockResolvedValue({ data: { status: true, data: { email_verification_token: 'tok', expires_in: 3600 } } } as Awaited<ReturnType<typeof verifyRegistrationEmailCode>>)

  await type(input(t('regOwnerNamePlaceholder')), 'Budi')
  await type(input(t('profileBusinessEmailPlaceholder')), ' Budi@Gmail.com ')
  await click(t('regEmailSendCode'))
  expect(sendRegistrationEmailCode).toHaveBeenCalledWith('budi@gmail.com', expect.any(String))

  // Enam angka langsung memicu verifikasi.
  await type(input(t('regEmailCodeHint')), '123456')
  await act(async () => { await new Promise((r) => setTimeout(r, 10)) })
  expect(verifyRegistrationEmailCode).toHaveBeenCalledWith('budi@gmail.com', '123456')
  expect(host.textContent).toContain(t('regEmailVerified'))

  await type(input(t('regWhatsappPlaceholder')), '0812')
  await type(input(t('pwMinHint')), 'rahasia123')
  await type(input(t('regBusinessNamePlaceholder')), 'Warung Budi')
  await submit()
  expect(toast.error).toHaveBeenLastCalledWith(t('regWhatsappInvalid'))

  // Mengganti email membatalkan verifikasi.
  await type(input(t('profileBusinessEmailPlaceholder')), 'lain@gmail.com')
  expect(host.textContent).not.toContain(t('regEmailVerified'))
  expect(host.textContent).toContain(t('regEmailSendCode'))
})
