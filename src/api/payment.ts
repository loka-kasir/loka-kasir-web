import api from '@/lib/axios'
import type { ApiResponse, PaymentOrder, PaymentOrderType } from '@/types'

export interface CreatePaymentOrderPayload {
  business_id: string
  type: PaymentOrderType
  reference_id?: string
  plan?: string
  /** Jumlah slot tambahan untuk type = "user_addon" (bawaan 1). */
  quantity?: number
  /** Durasi bulan yang dipilih untuk type = "user_addon" (1..sisa bulan paket). */
  months?: number
  /** Email customer untuk notifikasi pembayaran Duitku. */
  email?: string
  /**
   * Kode kanal Duitku dari `getPaymentMethods` (mis. "SP" untuk QRIS). Diisi →
   * tagihan dibuat lewat Duitku API v2 dan respons membawa `qr_string` /
   * `va_number`. Kosong → halaman checkout Duitku.
   */
  payment_method?: string
}

/** Satu kanal pembayaran Duitku yang aktif. */
export interface PaymentMethodOption {
  code: string
  name: string
  image: string
  group: 'va' | 'qris' | 'ewallet' | 'retail' | 'card'
  fee: number
}

export const getPaymentMethods = (amount?: number) =>
  api.get<ApiResponse<PaymentMethodOption[]>>('/payment-order/methods', {
    params: amount ? { amount } : undefined,
  })

export const createPaymentOrder = (data: CreatePaymentOrderPayload) =>
  api.post<ApiResponse<PaymentOrder>>('/payment-order', data)

export const getPaymentOrder = (id: string) =>
  api.get<ApiResponse<PaymentOrder>>(`/payment-order/${id}`)
