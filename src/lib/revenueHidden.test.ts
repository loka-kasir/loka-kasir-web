import { AxiosHeaders } from 'axios'
import { describe, expect, it } from 'vitest'
import { isRevenueHidden } from './revenueHidden'

describe('isRevenueHidden', () => {
  it('membaca tanda dari server', () => {
    expect(isRevenueHidden({ headers: new AxiosHeaders({ 'X-Revenue-Hidden': '1' }) })).toBe(true)
    expect(isRevenueHidden({ headers: { 'x-revenue-hidden': '1' } })).toBe(true)
  })
  it('tanpa tanda, omzet tetap tampil', () => {
    expect(isRevenueHidden({ headers: new AxiosHeaders() })).toBe(false)
    expect(isRevenueHidden(undefined)).toBe(false)
    expect(isRevenueHidden({})).toBe(false)
  })
})
