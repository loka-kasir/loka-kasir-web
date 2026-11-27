import api from '@/lib/axios'
import type { ApiResponse, Membership, ProrataPreview } from '@/types'

export const getActiveMembership = () =>
  api.get<ApiResponse<Membership>>('/membership')

export const getUpgradePreview = (plan: string) =>
  api.get<ApiResponse<ProrataPreview>>('/membership/upgrade-preview', { params: { plan } })
