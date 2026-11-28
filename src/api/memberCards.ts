import api from '@/lib/axios'

export interface MemberCardPoolItem {
  id: string
  serial_no: number
  serial_label: string
  card_code: string
  qr_payload: string
  /** Tautan kartu (`<web>/k/<usaha>/<kode>`) untuk QR cetak; kosong di server lama. */
  qr_url?: string
  status: 'available' | 'assigned' | 'blocked'
  batch_label?: string
  note?: string
  customer_id?: string
  customer_name?: string
  customer_phone?: string
  deposit_balance?: number
  points_balance?: number
  assigned_at?: string
  blocked_at?: string
  created_at: string
}

export interface MemberCardPoolSummary {
  total: number
  available: number
  assigned: number
  blocked: number
  next_serial: number
}

export interface MemberCardPoolPage {
  items: MemberCardPoolItem[]
  summary: MemberCardPoolSummary
  batches: string[]
  total_items: number
  page: number
  limit: number
}

export interface MemberCardCustomerSnapshot {
  id: string
  name: string
  phone?: string
  email?: string
  address?: string
  notes?: string
  is_member: boolean
  points_balance: number
  deposit_balance: number
  kasbon_balance: number
  tier_name?: string
  gym_status?: string
  gym_plan_name?: string
  gym_end_date?: string
}

export interface MemberCardLookupResult {
  found: boolean
  status: 'available' | 'assigned' | 'blocked' | 'unregistered'
  card_code: string
  card?: MemberCardPoolItem
  customer?: MemberCardCustomerSnapshot
}

export function formatMemberCardCode(code: string): string {
  const clean = code.trim().toUpperCase().replace(/-/g, '')
  if (clean.length === 8) return `${clean.slice(0, 4)}-${clean.slice(4)}`
  return clean
}

export const listMemberCards = (params?: {
  status?: string
  search?: string
  batch_label?: string
  page?: number
  limit?: number
}) =>
  api.get<{ status: boolean; data: MemberCardPoolPage }>('/member-cards', { params })

/**
 * Semua halaman `/member-cards` (server membatasi 200 per halaman). Tanpa ini
 * kartu ke-201 dst. — batch kedua toko yang sudah punya 200 kartu — tidak
 * tampil di daftar dan tidak bisa diaktifkan maupun dicetak.
 */
export const listAllMemberCards = async (params?: {
  status?: string
  search?: string
  batch_label?: string
}) => {
  const limit = 200
  const first = await listMemberCards({ ...params, page: 1, limit })
  const firstPage = first.data?.data
  if (!firstPage) return first
  const items = [...(firstPage.items ?? [])]
  const total = firstPage.total_items ?? items.length
  for (let page = 2; items.length < total && page <= 50; page++) {
    const next = await listMemberCards({ ...params, page, limit })
    const more = next.data?.data?.items ?? []
    if (more.length === 0) break
    items.push(...more)
  }
  return { ...first, data: { ...first.data, data: { ...firstPage, items } } }
}

export const createMemberCardBatch = (data: { count: number; batch_label?: string }) =>
  api.post<{ status: boolean; data: { items: MemberCardPoolItem[]; count: number } }>(
    '/member-cards/batch',
    data,
  )

export const lookupMemberCard = (code: string) =>
  api.get<{ status: boolean; data: MemberCardLookupResult }>('/member-cards/lookup', {
    params: { code },
  })

export const assignMemberCard = (
  cardId: string,
  data: {
    create_customer: boolean
    customer_id?: string
    name?: string
    phone?: string
    email?: string
    notes?: string
    replace_existing?: boolean
  },
) =>
  api.post<{ status: boolean; data: MemberCardLookupResult }>(
    `/member-cards/${cardId}/assign`,
    data,
  )

export const unassignMemberCard = (cardId: string) =>
  api.post<{ status: boolean; data: MemberCardPoolItem }>(`/member-cards/${cardId}/unassign`)

export const blockMemberCard = (cardId: string, note?: string) =>
  api.post<{ status: boolean; data: MemberCardPoolItem }>(`/member-cards/${cardId}/block`, {
    note,
  })

/** Desain kartu cetak per usaha — diatur sekali, dipakai setiap cetak. */
export interface MemberCardDesign {
  template: 'classic' | 'dark' | 'minimal'
  accent: 'blue' | 'emerald' | 'espresso' | 'charcoal' | 'crimson'
  code_style: 'both' | 'qr' | 'barcode'
  purpose: 'general' | 'gym'
  show_logo: boolean
  store_info?: string | null
  tagline?: string | null
  saved?: boolean
}

export const getMemberCardDesign = () =>
  api.get<{ status: boolean; data: MemberCardDesign }>('/member-cards/design')

export const saveMemberCardDesign = (data: MemberCardDesign) =>
  api.put<{ status: boolean; data: MemberCardDesign }>('/member-cards/design', data)

/** Halaman kartu publik — dibuka kamera HP pelanggan dari QR kartu. */
export interface PublicMemberCard {
  business_name: string
  logo_url?: string
  serial_label?: string
  card_code: string
  status: 'available' | 'assigned' | 'blocked' | 'unregistered'
  member_name?: string
  deposit_balance?: number
  points_balance?: number
  tier_name?: string
  gym_status?: string
  gym_plan_name?: string
  gym_end_date?: string
}
