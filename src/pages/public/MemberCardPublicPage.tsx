import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import * as Loka from '@/components/icons/loka'
import { PublicHeader, HeaderChip, PoweredByLoka } from './PublicChrome'
import { getPublicMemberCard } from '@/api/public'
import { formatMemberCardCode } from '@/api/memberCards'
import { formatMoney } from '@/lib/money'
import { t } from '@/lib/i18n'
import { displayedText as titleCase } from '@/lib/textCase'

/**
 * Halaman kartu member cetak — dibuka kamera HP pelanggan dari QR kartunya
 * (`/k/<usaha>/<kode>`). Kasir memindai QR yang sama untuk transaksi.
 *
 * Yang tampil hanya yang memang terlihat di kasir saat kartu dipindai: nama
 * depan, saldo titipan, poin, tingkat, dan masa aktif gym — tanpa nomor HP
 * atau alamat, karena kartu fisik bisa terjatuh.
 */
export default function MemberCardPublicPage() {
  const { business = '', code = '' } = useParams()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['public-member-card', business, code],
    queryFn: async () => (await getPublicMemberCard(business, code)).data.data,
    enabled: !!business && !!code,
    retry: false,
    refetchOnWindowFocus: true,
  })

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    )
  }
  if (isError || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 text-gray-500 flex items-center justify-center mb-4">
          <Loka.CreditCard size={30} />
        </div>
        <p className="text-sm text-gray-600">{t('kpInvalid')}</p>
      </div>
    )
  }

  const assigned = data.status === 'assigned'
  const gymActive = data.gym_status === 'active'
  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <PublicHeader
        logo={data.logo_url}
        name={titleCase(data.business_name)}
        motif={Loka.CreditCard}
        actions={<HeaderChip icon={Loka.CreditCard}>{t('kpTitle')}</HeaderChip>}
      />
      <div className="relative max-w-md mx-auto px-4 -mt-5 space-y-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-gray-500">
                {data.serial_label ? `${t('kpCard')} ${data.serial_label}` : t('kpCard')}
              </p>
              <p className="text-base font-bold text-gray-900 tracking-wider">
                {formatMemberCardCode(data.card_code)}
              </p>
            </div>
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                assigned
                  ? 'bg-emerald-50 text-emerald-700'
                  : data.status === 'blocked'
                    ? 'bg-rose-50 text-rose-700'
                    : 'bg-blue-50 text-blue-700'
              }`}
            >
              {assigned ? t('kpActive') : data.status === 'blocked' ? t('kpBlocked') : t('kpNotActivated')}
            </span>
          </div>

          {assigned ? (
            <>
              <p className="mt-4 text-sm text-gray-700">
                {t('kpHello', { name: titleCase(data.member_name ?? '') })}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-emerald-50 p-3">
                  <p className="text-[11px] text-emerald-700">{t('kpDeposit')}</p>
                  <p className="text-lg font-bold text-emerald-800">{formatMoney(data.deposit_balance ?? 0)}</p>
                </div>
                <div className="rounded-xl bg-blue-50 p-3">
                  <p className="text-[11px] text-blue-700">{t('kpPoints')}</p>
                  <p className="text-lg font-bold text-blue-800">
                    {(data.points_balance ?? 0).toLocaleString('id-ID')}
                  </p>
                </div>
              </div>
              {data.tier_name && (
                <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-full">
                  <Loka.Star size={13} /> {data.tier_name}
                </p>
              )}
              {data.gym_status && (
                <div className={`mt-3 rounded-xl p-3 ${gymActive ? 'bg-teal-50' : 'bg-rose-50'}`}>
                  <p className={`text-[11px] ${gymActive ? 'text-teal-700' : 'text-rose-700'}`}>
                    {data.gym_plan_name || t('kpGymMembership')}
                  </p>
                  <p className={`text-sm font-semibold ${gymActive ? 'text-teal-800' : 'text-rose-800'}`}>
                    {gymActive ? t('kpGymActive') : t('kpGymExpired')}
                    {data.gym_end_date ? ` · ${t('kpGymUntil', { date: data.gym_end_date })}` : ''}
                  </p>
                </div>
              )}
            </>
          ) : (
            <p className="mt-4 text-sm text-gray-600">
              {data.status === 'blocked' ? t('kpBlockedHint') : t('kpNotActivatedHint')}
            </p>
          )}
        </div>
        <p className="text-xs text-gray-500 text-center px-4">{t('kpFootnote')}</p>
      </div>
      <PoweredByLoka />
    </div>
  )
}
