import Form from '@/components/ui/Form'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Store, CheckCircle2, Send } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'
import { useThemeStore } from '@/store/themeStore'
import { CAPTCHA_ENABLED, initialCaptchaToken } from '@/lib/captcha'
import { registerBusiness, sendRegistrationEmailCode, verifyRegistrationEmailCode } from '@/api/auth'
import { applyPendingReferral, capturePendingReferral } from '@/lib/pendingReferral'
import { useAuthStore } from '@/store/authStore'
import { hydrateUserFromToken } from '@/lib/jwt'
import { getBusinessTypes, getBusinessVerticals } from '@/api/master'
import { getErrorMessage } from '@/lib/utils'
import PasswordStrengthBar from '@/components/ui/PasswordStrengthBar'
import LoadingOverlay from '@/components/ui/LoadingOverlay'
import LanguageMenu from '@/components/ui/LanguageMenu'
import SearchableSelect from '@/components/ui/SearchableSelect'
import { t } from '@/lib/i18n'

// ─── Types ────────────────────────────────────────────────────────────────────

// Formnya dibuat sama persis dengan aplikasi kasir
// (`lib/features/auth/views/widgets/register_contain_widget.dart`): hanya field
// yang benar-benar diwajibkan backend — termasuk verifikasi email lewat kode
// SEBELUM mendaftar dan nomor WhatsApp pemilik. Konfirmasi password dan empat
// dropdown lokasi berantai sengaja tidak ada — opsional di server dan diatur
// belakangan dari Pengaturan Outlet, sehingga pendaftaran tidak bergantung
// pada rantai permintaan jaringan yang bisa gagal di tengah jalan.
interface FormData {
  full_name: string
  email: string
  phone_number: string
  password: string
  business_name: string
  business_type_id: string
  business_vertical_id: string
}

const emptyForm: FormData = {
  full_name: '', email: '', phone_number: '', password: '',
  business_name: '', business_type_id: '', business_vertical_id: '',
}

// ─── Reusable field components ────────────────────────────────────────────────

function InputField({
  label, type = 'text', value, onChange, placeholder, required = true, suffix, hint, onEnter,
}: {
  label: string; type?: string; value: string; onChange: (v: string) => void
  placeholder?: string; required?: boolean; suffix?: React.ReactNode; hint?: string
  onEnter?: () => void
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-1.5">
        {label} {required && <span className="text-red-500 dark:text-red-400">*</span>}
      </label>
      <div className="relative">
        <input
          type={type} value={value} onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder} required={required}
          onKeyDown={onEnter ? (e) => { if (e.key === 'Enter') { e.preventDefault(); onEnter() } } : undefined}
          className="w-full px-4 py-2.5 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm pr-10"
        />
        {suffix && <div className="absolute right-3 top-1/2 -translate-y-1/2">{suffix}</div>}
      </div>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  )
}

function SelectField({
  label, value, onChange, options, placeholder, required = true, disabled,
}: {
  label: string; value: string; onChange: (v: string) => void
  options: { value: string; label: string }[]; placeholder?: string
  required?: boolean; disabled?: boolean
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-1.5">
        {label} {required && <span className="text-red-500 dark:text-red-400">*</span>}
      </label>
      <SearchableSelect
        value={value} onChange={onChange} options={options}
        placeholder={placeholder} label={label} disabled={disabled}
        className="w-full"
      />
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RegisterPage() {
  const navigate = useNavigate()
  const [referralCode] = useState(() => {
    return capturePendingReferral(new URLSearchParams(window.location.search).get('ref'))
  })
  const setAuth = useAuthStore((s) => s.setAuth)
  const { theme } = useThemeStore()

  const [form, setForm]           = useState<FormData>(emptyForm)
  const [showPass, setShowPass]   = useState(false)
  const [loading, setLoading]     = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [captchaToken, setCaptchaToken] = useState(initialCaptchaToken)

  const turnstileRef = useRef<TurnstileInstance | null>(null)

  const handleCaptchaSuccess = (token: string) => setCaptchaToken(token)

  // Token Turnstile sekali pakai: setiap kali server memakainya (kirim kode,
  // pendaftaran gagal), widget diulang agar menerbitkan token baru.
  const resetCaptcha = () => {
    setCaptchaToken(initialCaptchaToken())
    turnstileRef.current?.reset()
  }

  // ── Verifikasi email (wajib sebelum mendaftar) ──────────────────────────────
  // Mengubah email setelah kode terkirim/terverifikasi membatalkan langkah ini:
  // token hanya berlaku untuk email yang sama.
  const [codeSentTo, setCodeSentTo]       = useState<string | null>(null)
  const [verified, setVerified]           = useState<{ email: string; token: string } | null>(null)
  const [code, setCode]                   = useState('')
  const [sendingCode, setSendingCode]     = useState(false)
  const [verifyingCode, setVerifyingCode] = useState(false)
  const [resendLeft, setResendLeft]       = useState(0)

  const normalizedEmail = form.email.trim().toLowerCase()
  const emailVerified = verified !== null && verified.email === normalizedEmail

  useEffect(() => {
    if (resendLeft <= 0) return
    const id = window.setTimeout(() => setResendLeft((s) => Math.max(0, s - 1)), 1000)
    return () => window.clearTimeout(id)
  }, [resendLeft])

  const resetEmailVerification = () => {
    setCodeSentTo(null); setVerified(null); setCode(''); setResendLeft(0)
  }

  const handleEmailChange = (value: string) => {
    setForm((prev) => ({ ...prev, email: value }))
    const next = value.trim().toLowerCase()
    if ((codeSentTo && codeSentTo !== next) || (verified && verified.email !== next)) resetEmailVerification()
  }

  const handleSendCode = async () => {
    const email = normalizedEmail
    if (!email)                                    { toast.error(t('regEmailRequiredMsg')); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast.error(t('regEmailInvalidMsg')); return }
    if (!captchaToken)                             { toast.error(t('regCaptchaIncomplete')); return }
    setSendingCode(true)
    try {
      const res = await sendRegistrationEmailCode(email, captchaToken)
      setCodeSentTo(email)
      setCode('')
      setResendLeft(res.data?.data?.resend_after ?? 60)
      toast.success(t('regEmailCodeSentToast'))
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSendingCode(false)
      resetCaptcha()
    }
  }

  const handleVerifyCode = async (value = code) => {
    if (!codeSentTo || verifyingCode) return
    if (!/^\d{6}$/.test(value)) { toast.error(t('regEmailCodeInvalidMsg')); return }
    setVerifyingCode(true)
    try {
      const res = await verifyRegistrationEmailCode(codeSentTo, value)
      const token = res.data?.data?.email_verification_token
      if (!token) throw new Error('missing token')
      setVerified({ email: codeSentTo, token })
      setCodeSentTo(null); setCode(''); setResendLeft(0)
      toast.success(t('regEmailVerified'))
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setVerifyingCode(false)
    }
  }

  // ── Master data ─────────────────────────────────────────────────────────────

  const { data: businessTypesData } = useQuery({
    queryKey: ['business-types-public'],
    queryFn: () => getBusinessTypes(),
    retry: false,
  })
  const businessTypes = businessTypesData?.data?.data ?? []

  // Bidang usaha bergantung pada pilar yang dipilih, jadi baru diminta setelah
  // jenis bisnis ditentukan.
  const selectedTypeId = form.business_type_id ? Number(form.business_type_id) : null
  const {
    data: verticalsData,
    isFetching: loadingVerticals,
    isError: verticalsFailed,
    refetch: refetchVerticals,
  } = useQuery({
    queryKey: ['business-verticals-public', selectedTypeId],
    queryFn: () => getBusinessVerticals(selectedTypeId!),
    enabled: selectedTypeId !== null,
    retry: false,
  })
  const verticals = verticalsData?.data?.data ?? []

  // Pilihan sub-jenis milik pilar lain akan ditolak server, jadi dikosongkan
  // begitu jenis bisnis berganti.
  const handleBusinessTypeChange = (value: string) => {
    setForm((prev) => ({ ...prev, business_type_id: value, business_vertical_id: '' }))
  }

  // Penjelasan di bawah pemilih bidang usaha: deskripsi pilihan yang sedang
  // aktif, atau ajakan memilih bila belum ada — supaya pemilik tahu pilihan ini
  // mengubah isi aplikasinya, bukan sekadar label.
  const verticalHelperText = () => {
    const selected = verticals.find((v) => String(v.id) === form.business_vertical_id)
    if (selected && selected.description) return selected.description
    return t('regVerticalHint')
  }

  // ── Submit pendaftaran ──────────────────────────────────────────────────────

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()

    const fullName = form.full_name.trim()
    const email = normalizedEmail
    const phone = form.phone_number.trim()
    const phoneDigits = phone.replace(/\D/g, '')
    const businessName = form.business_name.trim()

    // Urutan validasi mengikuti aplikasi supaya pesan gagalnya identik.
    if (!fullName)                                    { toast.error(t('regNameRequired')); return }
    if (!email)                                       { toast.error(t('regEmailRequiredMsg')); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))    { toast.error(t('regEmailInvalidMsg')); return }
    if (!emailVerified || !verified)                  { toast.error(t('regEmailVerifyFirst')); return }
    if (!phoneDigits)                                 { toast.error(t('regWhatsappRequired')); return }
    if (phoneDigits.length < 9 || phoneDigits.length > 15) { toast.error(t('regWhatsappInvalid')); return }
    if (form.password.length < 6)                     { toast.error(t('pwMinLength')); return }
    if (!businessName)                                { toast.error(t('regBusinessNameRequired')); return }
    if (!form.business_type_id)                       { toast.error(t('regBusinessTypeRequiredMsg')); return }
    if (!captchaToken)                                { toast.error(t('regCaptchaIncomplete')); return }

    setLoadingMsg(t('regRegistering'))
    setLoading(true)
    try {
      const res = await registerBusiness({
        full_name:            fullName,
        email:                email,
        email_verification_token: verified.token,
        phone_number:         phone,
        password:             form.password,
        business_name:        businessName,
        business_type_id:     Number(form.business_type_id),
        business_vertical_id: form.business_vertical_id ? Number(form.business_vertical_id) : null,
        // Outlet pertama memakai nama bisnis — bisa diganti setelah masuk.
        outlet_name:          businessName,
        otp_channel:          'email',
      }, captchaToken)
      // replace: kembali ke formulir yang sudah terkirim hanya akan ditolak
      // karena emailnya sudah terpakai.
      const user = res.data?.data
      if (user?.token) {
        // Akun langsung aktif tanpa OTP — jawaban pendaftaran adalah login
        // pertamanya. Pemilik yang baru mendaftar belum bisa melayani pembeli
        // sampai aplikasi kasirnya terpasang — /mulai yang mengatakan itu.
        setAuth(hydrateUserFromToken(user), user.token)
        if (referralCode) {
          try { await applyPendingReferral(referralCode); toast.success('Diskon referral siap dipakai pada pembayaran pertama') }
          catch { toast.error('Kode belum diterapkan. Coba gunakan kode di halaman Langganan sebelum membayar.') }
        }
        toast.success(t('regWelcome'))
        navigate('/mulai', { replace: true })
        return
      }
      // Server lama: akun baru aktif setelah OTP dari emailnya dimasukkan.
      navigate('/verifikasi-email', { replace: true, state: { email, from: 'register', referralCode } })
    } catch (err) {
      // Token verifikasi kedaluwarsa: buka lagi langkah kirim kode.
      const errCode = (err as { response?: { data?: { error?: { code?: string } } } })?.response?.data?.error?.code
      if (errCode === 'EMAIL_NOT_VERIFIED') resetEmailVerification()
      toast.error(getErrorMessage(err))
      // Token Turnstile sekali pakai: widget harus diulang agar menerbitkan
      // token baru, kalau tidak tombol Daftar terkunci setelah satu kali gagal.
      resetCaptcha()
      setLoading(false)
    }
  }

  const subtitle = t('regTagline')

  return (
    <>
      {loading && <LoadingOverlay message={loadingMsg} />}

      <div className="flex h-dvh overflow-hidden bg-background">
        {/* ── Left: Hero Panel ─────────────────────────────────────────────── */}
        <div className="relative hidden h-full shrink-0 flex-col justify-between overflow-hidden bg-gradient-to-br from-[#1B5AE8] via-[#1448C5] to-[#0d2d8a] p-12 lg:flex lg:w-1/2">
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-white/5 rounded-full" />
          <div className="absolute top-1/3 -right-16 w-64 h-64 bg-blue-500/20 rounded-full" />
          <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-indigo-500/20 rounded-full" />

          <div className="relative z-10">
            <img src="/logo.svg" alt="Loka Kasir" className="h-10 w-auto brightness-0 invert" />
          </div>

          <div className="relative z-10 space-y-6">
            <div>
              <span className="inline-block rounded-full bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-blue-200">
                {t('regFreeTrialTitle')}
              </span>
              <h1 className="mt-4 text-4xl font-extrabold text-white leading-tight">
                {t('regHeroLead')}<br />{t('regYourBusiness')}<br />{t('regHeroWithUs')}
              </h1>
              <p className="mt-3 text-blue-100 text-base leading-relaxed">
                {t('regHeroBody')}
              </p>
            </div>

            {/* Daftar keunggulan — teks & urutannya sama dengan aplikasi */}
            <ul className="space-y-2.5">
              {[
                t('regPerkNoVerification'),
                t('regPerkMultiCashier'),
                t('regPerkReports'),
                t('regPerkStock'),
              ].map((item) => (
                <li key={item} className="flex items-center gap-3 text-blue-100 text-sm">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
                    <CheckCircle2 size={16} className="text-white" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>

            <div className="flex gap-2.5">
              {[
                [t('regStatTrialLength'), t('regStatFreeAtStart')],
                [t('regStatOneMinute'), t('regStatFiveFields')],
                ['Multi', t('regStatCashierRole')],
              ].map(([value, label]) => (
                <div key={label} className="rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-center">
                  <p className="text-sm font-extrabold text-white">{value}</p>
                  <p className="text-[11px] text-blue-200">{label}</p>
                </div>
              ))}
            </div>
          </div>

          <p className="relative z-10 text-blue-300 text-xs">
            {t('registerRights', { year: new Date().getFullYear() })}
          </p>
        </div>

        {/* ── Right: Form Panel ────────────────────────────────────────────── */}
        <div className="relative min-w-0 flex-1 overflow-y-auto">
        <div className="flex min-h-full items-start justify-center p-6 sm:p-10 lg:items-center">
          {/* Sama seperti layar masuk: pendaftaran juga berada di luar Pengaturan,
              jadi pemilih bahasanya harus ikut ada di sini. */}
          <LanguageMenu className="absolute right-4 top-4" />

          <div className="w-full max-w-md pt-8 lg:pt-0">
            {/* Mobile logo */}
            <div className="lg:hidden text-center mb-6">
              <img src="/logo.svg" alt="Loka Kasir" className="h-9 w-auto mx-auto mb-2" />
              <h1 className="text-xl font-bold text-foreground">{t('regCreateAccount')}</h1>
              <p className="text-muted-foreground text-sm mt-1">{t('regFreeTrial')}</p>
            </div>

            {/* Desktop heading */}
            <div className="hidden lg:block mb-6">
              <h2 className="text-2xl font-bold text-foreground">{t('regCreateAccount')}</h2>
              <p className="text-muted-foreground text-sm mt-1">{subtitle}</p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-7">
              <Form onSubmit={handleSubmit} className="space-y-4">
                  <InputField
                    label={t('regFullName')}
                    value={form.full_name}
                    onChange={(v) => setForm({ ...form, full_name: v })}
                    placeholder={t('regOwnerNamePlaceholder')}
                  />
                  <div>
                    <InputField
                      label={t('labelEmail')}
                      type="email"
                      value={form.email}
                      onChange={handleEmailChange}
                      placeholder={t('profileBusinessEmailPlaceholder')}
                      hint={emailVerified || codeSentTo ? undefined : t('regEmailHint')}
                      suffix={emailVerified ? <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" aria-label={t('regEmailVerified')} /> : undefined}
                    />
                    {emailVerified ? (
                      <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-1">{t('regEmailVerified')}</p>
                    ) : codeSentTo ? (
                      <div className="mt-2 space-y-2">
                        <p className="text-xs text-muted-foreground">{t('regEmailCodeSent', { email: codeSentTo })}</p>
                        <div className="flex gap-2">
                          <input
                            value={code}
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={6}
                            aria-label={t('regEmailCodeHint')}
                            placeholder={t('regEmailCodeHint')}
                            onChange={(e) => {
                              const v = e.target.value.replace(/\D/g, '').slice(0, 6)
                              setCode(v)
                              if (v.length === 6) void handleVerifyCode(v)
                            }}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleVerifyCode() } }}
                            className="min-w-0 flex-1 px-4 py-2.5 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm tracking-[0.3em]"
                          />
                          <button
                            type="button"
                            onClick={() => void handleVerifyCode()}
                            disabled={verifyingCode}
                            className="shrink-0 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                          >
                            {t('regEmailVerifyCode')}
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleSendCode()}
                          disabled={resendLeft > 0 || sendingCode}
                          className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-60 disabled:no-underline"
                        >
                          {resendLeft > 0 ? t('regEmailResendIn', { seconds: resendLeft }) : t('regEmailResend')}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleSendCode()}
                        disabled={sendingCode}
                        className="mt-2 w-full flex items-center justify-center gap-2 rounded-xl border border-blue-600/40 bg-blue-600/10 py-2.5 text-sm font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-600/15 disabled:opacity-60"
                      >
                        <Send size={14} /> {sendingCode ? t('regEmailSendingCode') : t('regEmailSendCode')}
                      </button>
                    )}
                  </div>

                  <InputField
                    label={t('regWhatsapp')}
                    type="tel"
                    value={form.phone_number}
                    onChange={(v) => setForm({ ...form, phone_number: v.replace(/[^0-9+\-\s]/g, '') })}
                    placeholder={t('regWhatsappPlaceholder')}
                    hint={t('regWhatsappHint')}
                  />

                  {/* Satu field password dengan tombol lihat/sembunyikan —
                      tanpa "Konfirmasi Password", sama seperti aplikasi. */}
                  <div>
                    <InputField
                      label={t('accountCurrentPassword')}
                      type={showPass ? 'text' : 'password'}
                      value={form.password}
                      onChange={(v) => setForm({ ...form, password: v })}
                      placeholder={t('pwMinHint')}
                      suffix={
                        <button type="button" onClick={() => setShowPass(!showPass)} aria-label={showPass ? t('loginHidePassword') : t('loginShowPassword')} className="text-muted-foreground">
                          {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      }
                    />
                    {form.password.length > 0 && <PasswordStrengthBar password={form.password} />}
                  </div>

                  <InputField
                    label={t('profileBusinessName')}
                    value={form.business_name}
                    onChange={(v) => setForm({ ...form, business_name: v })}
                    placeholder={t('regBusinessNamePlaceholder')}
                    hint={t('regBusinessNameHint')}
                    onEnter={() => { if (!loading) void handleSubmit() }}
                  />

                  <SelectField
                    label={t('regBusinessType')}
                    value={form.business_type_id}
                    onChange={handleBusinessTypeChange}
                    options={businessTypes.map((b) => ({ value: String(b.id), label: b.name }))}
                    placeholder={t('regPickBusinessType')}
                  />

                  {/* ── Bidang usaha (opsional) ─────────────────────────────
                      Menentukan APA yang dicatat tiap transaksi: bengkel dapat
                      kolom plat nomor, konter HP dapat IMEI. Kegagalan memuat
                      TIDAK memblokir pendaftaran — pemilik hanya diberi tahu
                      dan diberi jalan mencoba lagi. */}
                  {selectedTypeId !== null && (
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">
                        {t('regVerticalLabel')}
                      </label>

                      {loadingVerticals ? (
                        <p className="text-xs text-muted-foreground py-3">{t('regLoadingOptions')}</p>
                      ) : verticalsFailed ? (
                        <div className="py-1">
                          <p className="text-xs text-red-500 dark:text-red-400">
                            {t('regVerticalLoadFailed')}
                          </p>
                          <button
                            type="button"
                            onClick={() => void refetchVerticals()}
                            className="text-xs font-semibold text-blue-600 dark:text-blue-400 underline mt-1"
                          >
                            {t('actionRetry')}
                          </button>
                          <p className="text-xs text-muted-foreground mt-1">
                            {t('regVerticalSkippable')}
                          </p>
                        </div>
                      ) : verticals.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-1">
                          {t('regNoVerticalForType')}
                        </p>
                      ) : (
                        <>
                          <SearchableSelect
                            value={form.business_vertical_id}
                            onChange={(v) => setForm({ ...form, business_vertical_id: v })}
                            options={verticals.map((v) => ({ value: String(v.id), label: v.name }))}
                            placeholder={t('regPickVertical')}
                            label={t('regVerticalLabel')}
                            className="w-full"
                          />
                          <p className="text-xs text-muted-foreground mt-1">{verticalHelperText()}</p>
                        </>
                      )}
                    </div>
                  )}

                  {CAPTCHA_ENABLED ? (
                    <Turnstile
                      ref={turnstileRef}
                      siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY}
                      onSuccess={handleCaptchaSuccess}
                      onExpire={() => setCaptchaToken('')}
                      onError={() => setCaptchaToken('')}
                      options={{ theme }}
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {t('loginCaptchaSkipped')}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={loading || !captchaToken}
                    className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition"
                  >
                  <Store size={15} /> {t('regRegisterBusiness')}
                </button>
              </Form>

              <p className="text-center text-sm text-muted-foreground mt-6 pt-5 border-t border-border">
                {t('regHaveAccount')}{' '}
                <Link to="/login" className="text-blue-600 dark:text-blue-400 font-semibold hover:underline">
                  {t('regSignInHere')}
                </Link>
              </p>
            </div>
          </div>
        </div>
        </div>
      </div>
    </>
  )
}
