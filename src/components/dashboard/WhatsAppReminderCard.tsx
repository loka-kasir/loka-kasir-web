import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MessageCircle, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { getUserProfile } from '@/api/business'
import { useAuthStore } from '@/store/authStore'
import { t } from '@/lib/i18n'

/// Pengingat untuk pemilik yang belum punya nomor WhatsApp.
///
/// Nomor WA wajib sejak pendaftaran 1.59.0, tetapi pemilik yang mendaftar
/// sebelumnya belum punya — tim Loka tidak bisa mengabari mereka soal langganan
/// atau gangguan layanan. Ditutup berarti "jangan sekarang": muncul lagi setelah
/// SNOOZE_DAYS sampai nomornya terisi (padanan HomeWhatsAppReminder di aplikasi).
const SNOOZE_KEY = 'loka.dashboard.whatsapp-reminder-snoozed-until'
const SNOOZE_DAYS = 3

export default function WhatsAppReminderCard() {
  const owner = useAuthStore((s) => s.user?.role?.code === 'OWNER')
  const [hidden, setHidden] = useState(() => {
    // Penyimpanan bisa diblokir (mode privat/peramban ketat): baca gagal =
    // pengingat tetap tampil, bukan dasbor yang ikut gagal dirender.
    try {
      const until = Number.parseInt(localStorage.getItem(SNOOZE_KEY) ?? '', 10)
      return Date.now() < until
    } catch {
      return false
    }
  })
  // Kunci kueri sama dengan halaman Profil: mengisi nomornya di sana langsung
  // menghilangkan pengingat ini.
  const { data } = useQuery({ queryKey: ['user-profile'], queryFn: () => getUserProfile(), enabled: owner && !hidden })
  const profile = data?.data?.data
  if (!owner || hidden || !profile || profile.whatsapp_number) return null

  const snooze = () => {
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000))
    } catch {
      // Tidak bisa diingat; tetap disembunyikan untuk sesi ini.
    }
    setHidden(true)
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-emerald-600/30 bg-emerald-600/5 px-4 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600/15">
        <MessageCircle size={17} className="text-emerald-700 dark:text-emerald-400" />
      </span>
      <Link to="/profile" className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{t('waReminderTitle')}</p>
        <p className="text-xs text-muted-foreground">{t('waReminderBody')}</p>
      </Link>
      <button type="button" onClick={snooze} aria-label={t('waReminderLater')} className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-muted">
        <X size={16} />
      </button>
    </div>
  )
}
