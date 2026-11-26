/**
 * Server mengosongkan angka omzet untuk karyawan bila pemilik menyalakan
 * "Sembunyikan omzet dari karyawan", dan menandainya lewat header ini.
 * Kolomnya disembunyikan, bukan ditampilkan sebagai Rp0 yang menyesatkan.
 */
export const REVENUE_HIDDEN_HEADER = 'x-revenue-hidden'

export function isRevenueHidden(res?: { headers?: unknown } | null): boolean {
  const headers = res?.headers as { get?: (k: string) => unknown } & Record<string, unknown> | undefined
  if (!headers) return false
  const value = typeof headers.get === 'function' ? headers.get(REVENUE_HIDDEN_HEADER) : headers[REVENUE_HIDDEN_HEADER]
  return String(value ?? '') === '1'
}
