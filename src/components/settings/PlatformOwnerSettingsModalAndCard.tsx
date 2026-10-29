/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Platform Owner Exclusive Branding, Terms/Privacy & Contact Settings Card + Public Viewer Modal
 * Organized inside 3 collapsible Accordion sections:
 * 1. الهوية الأكاديمية والشعار وألوان المنصة
 * 2. سياسات المنصة والشروط والخصوصية
 * 3. قنوات التواصل والدعم الفني ومطوري النظام
 */

import React, { useState, useEffect } from 'react';
import {
  Crown,
  Upload,
  Trash2,
  CheckCircle2,
  AlertCircle,
  FileText,
  ShieldCheck,
  Phone,
  Mail,
  Send,
  ExternalLink,
  RefreshCw,
  X,
  Globe,
  MapPin,
  Clock,
  Eye,
  Sparkles,
  MessageCircle,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import {
  PlatformBrandingAndPolicies,
  DEFAULT_PLATFORM_SETTINGS,
  savePlatformSettingsByOwner,
  compressLogoFileToDataUrl
} from '../../services/platformSettingsService.ts';

export function PlatformLogoBadge({
  settings,
  size = 'md'
}: {
  settings: PlatformBrandingAndPolicies;
  size?: 'sm' | 'md' | 'lg';
}) {
  const fallbackSizeClasses =
    size === 'sm'
      ? 'w-9 h-9 rounded-xl text-base'
      : size === 'lg'
      ? 'w-14 h-14 rounded-2xl text-2xl'
      : 'w-10 h-10 rounded-xl text-lg';

  const adaptiveLogoSizeClasses =
    size === 'sm'
      ? 'h-9 min-w-[36px] max-w-[110px] px-1.5 py-0.5 rounded-xl'
      : size === 'lg'
      ? 'h-14 min-w-[56px] max-w-[170px] px-2 py-1 rounded-2xl'
      : 'h-10 min-w-[40px] max-w-[130px] px-1.5 py-0.5 rounded-xl';

  const initialChar = (settings.platformShortName || 'U').trim().charAt(0).toUpperCase() || 'U';

  if (settings.logoDataUrl) {
    return (
      <div
        className={`${adaptiveLogoSizeClasses} bg-white border border-[var(--border-color)] shadow-sm overflow-hidden flex items-center justify-center shrink-0`}
      >
        <img
          src={settings.logoDataUrl}
          alt={settings.platformShortName || 'Logo'}
          className="max-h-full max-w-full w-auto h-auto object-contain"
        />
      </div>
    );
  }

  return (
    <div
      className={`${fallbackSizeClasses} bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-white font-black shrink-0 shadow-lg shadow-teal-500/20`}
    >
      {initialChar}
    </div>
  );
}

interface PlatformOwnerSettingsCardProps {
  settings: PlatformBrandingAndPolicies;
  ownerEmail: string;
  onOpenPreviewModal: (tab: 'terms' | 'privacy' | 'contact') => void;
}

type OwnerAccordionKey = 'branding' | 'legal' | 'contact';

export function PlatformOwnerSettingsCard({
  settings,
  ownerEmail,
  onOpenPreviewModal
}: PlatformOwnerSettingsCardProps) {
  const [openAccordion, setOpenAccordion] = useState<OwnerAccordionKey | null>('branding');

  const [shortName, setShortName] = useState<string>(settings.platformShortName);
  const [fullNameArabic, setFullNameArabic] = useState<string>(settings.platformNameArabic);
  const [taglineArabic, setTaglineArabic] = useState<string>(settings.platformTaglineArabic);
  const [logoDataUrl, setLogoDataUrl] = useState<string>(settings.logoDataUrl);

  const [termsText, setTermsText] = useState<string>(settings.termsOfUseArabic);
  const [privacyText, setPrivacyText] = useState<string>(settings.privacyPolicyArabic);

  const [whatsappNumber, setWhatsappNumber] = useState<string>(
    settings.contactChannels.whatsappNumber
  );
  const [supportEmail, setSupportEmail] = useState<string>(settings.contactChannels.supportEmail);
  const [supportPhone, setSupportPhone] = useState<string>(settings.contactChannels.supportPhone);
  const [telegramUrl, setTelegramUrl] = useState<string>(settings.contactChannels.telegramUrl);
  const [facebookUrl, setFacebookUrl] = useState<string>(settings.contactChannels.facebookUrl);
  const [websiteUrl, setWebsiteUrl] = useState<string>(settings.contactChannels.websiteUrl);
  const [officeAddressArabic, setOfficeAddressArabic] = useState<string>(
    settings.contactChannels.officeAddressArabic
  );
  const [workingHoursArabic, setWorkingHoursArabic] = useState<string>(
    settings.contactChannels.workingHoursArabic
  );

  const [saving, setSaving] = useState<boolean>(false);
  const [uploadingLogo, setUploadingLogo] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setShortName(settings.platformShortName);
    setFullNameArabic(settings.platformNameArabic);
    setTaglineArabic(settings.platformTaglineArabic);
    setLogoDataUrl(settings.logoDataUrl);
    setTermsText(settings.termsOfUseArabic);
    setPrivacyText(settings.privacyPolicyArabic);
    setWhatsappNumber(settings.contactChannels.whatsappNumber);
    setSupportEmail(settings.contactChannels.supportEmail);
    setSupportPhone(settings.contactChannels.supportPhone);
    setTelegramUrl(settings.contactChannels.telegramUrl);
    setFacebookUrl(settings.contactChannels.facebookUrl);
    setWebsiteUrl(settings.contactChannels.websiteUrl);
    setOfficeAddressArabic(settings.contactChannels.officeAddressArabic);
    setWorkingHoursArabic(settings.contactChannels.workingHoursArabic);
  }, [settings]);

  const toggleSection = (key: OwnerAccordionKey) => {
    setOpenAccordion((prev) => (prev === key ? null : key));
  };

  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    setFeedback(null);
    try {
      const compressed = await compressLogoFileToDataUrl(file, 512);
      setLogoDataUrl(compressed);
      setFeedback({
        type: 'success',
        text: 'تم تجهيز وضغط صورة الشعار بنجاح — اضغط على "حفظ واعتماد إعدادات المنصة" لتطبيقها.'
      });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'فشل رفع صورة الشعار' });
    } finally {
      setUploadingLogo(false);
      e.target.value = '';
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const res = await savePlatformSettingsByOwner(
        {
          platformShortName: shortName.trim() || DEFAULT_PLATFORM_SETTINGS.platformShortName,
          platformNameArabic: fullNameArabic.trim() || DEFAULT_PLATFORM_SETTINGS.platformNameArabic,
          platformTaglineArabic:
            taglineArabic.trim() || DEFAULT_PLATFORM_SETTINGS.platformTaglineArabic,
          logoDataUrl,
          termsOfUseArabic: termsText.trim() || DEFAULT_PLATFORM_SETTINGS.termsOfUseArabic,
          privacyPolicyArabic: privacyText.trim() || DEFAULT_PLATFORM_SETTINGS.privacyPolicyArabic,
          contactChannels: {
            whatsappNumber: whatsappNumber.trim(),
            supportEmail: supportEmail.trim(),
            supportPhone: supportPhone.trim(),
            telegramUrl: telegramUrl.trim(),
            facebookUrl: facebookUrl.trim(),
            websiteUrl: websiteUrl.trim(),
            officeAddressArabic: officeAddressArabic.trim(),
            workingHoursArabic: workingHoursArabic.trim()
          }
        },
        ownerEmail
      );
      setFeedback({
        type: 'success',
        text: res.syncedToCloud
          ? 'تم حفظ وتحديث شعار واسم المنصة وشروط الاستخدام وبيانات التواصل في السحابة فوراً ✓'
          : 'تم حفظ الإعدادات محلياً (أوفلاين) وستتم مزامنتها تلقائياً مع السحابة فور عودة الاتصال بالإنترنت ✓'
      });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'فشل حفظ إعدادات المنصة' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="umed-card bg-[var(--bg-card)] border border-amber-500/40 rounded-2xl p-5 sm:p-6 shadow-xl space-y-5"
      dir="rtl"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border-color)]">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 text-[11px] font-bold">
              حصرياً لإعدادات حساب مالك المنصة فقط
            </span>
          </div>
          <h2 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2 mt-1">
            <Crown className="w-5 h-5 text-amber-400" />
            <span>لوحة إعدادات مالك المنصة</span>
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            تتحكم هذه اللوحة في الهوية الأكاديمية والشعار وسياسات المنصة وقنوات التواصل الرسمية
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onOpenPreviewModal('terms')}
            className="px-3 py-1.5 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] text-teal-400 text-xs font-bold flex items-center gap-1.5 border border-[var(--border-color)] transition-colors"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>معاينة كما يراها المستخدم</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
              : 'bg-rose-500/15 border-rose-500/40 text-rose-400'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      <form onSubmit={handleSaveSettings} className="space-y-3 text-xs">
        {/* Accordion Section 1: الهوية الأكاديمية والشعار وألوان المنصة */}
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection('branding')}
            className="w-full p-4 flex items-center justify-between gap-3 text-right hover:bg-[var(--bg-elevated)]/60 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-bold text-[var(--text-primary)]">
                  1. الهوية الأكاديمية والشعار وألوان المنصة
                </div>
                <div className="text-[11px] text-[var(--text-muted)]">
                  الشعار الرسمي، الاسم المختصر، والاسم الكامل والوصف الترحيبي
                </div>
              </div>
            </div>
            {openAccordion === 'branding' ? (
              <ChevronUp className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
            ) : (
              <ChevronDown className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
            )}
          </button>

          {openAccordion === 'branding' && (
            <div className="p-4 pt-2 border-t border-[var(--border-color)] space-y-4 bg-[var(--bg-card)]">
              <div className="p-4 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <PlatformLogoBadge
                    settings={{
                      ...settings,
                      platformShortName: shortName,
                      logoDataUrl
                    }}
                    size="lg"
                  />
                  <div className="space-y-1">
                    <div className="text-sm font-bold text-[var(--text-primary)]">
                      شعار المنصة الرسمي (Logo)
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      ارفع صورة شعار مخصصة (PNG / JPG / WEBP / SVG) لتظهر في شاشة الدخول والشريط العلوي
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="cursor-pointer px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold flex items-center gap-1.5 transition-colors shadow-xs">
                    {uploadingLogo ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4" />
                    )}
                    <span>رفع صورة الشعار</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoFileChange}
                      className="hidden"
                    />
                  </label>

                  {logoDataUrl && (
                    <button
                      type="button"
                      onClick={() => setLogoDataUrl('')}
                      className="px-3 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-400 font-semibold flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>إزالة الشعار</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1.5 font-semibold">
                    الاسم المختصر للمنصة:
                  </label>
                  <input
                    type="text"
                    required
                    value={shortName}
                    onChange={(e) => setShortName(e.target.value)}
                    placeholder="UMED"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] font-bold focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[var(--text-secondary)] mb-1.5 font-semibold">
                    الاسم الكامل الرسمي للمنصة:
                  </label>
                  <input
                    type="text"
                    required
                    value={fullNameArabic}
                    onChange={(e) => setFullNameArabic(e.target.value)}
                    placeholder="UMED — منصة التعليم الطبي اليمنية"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] font-bold focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] mb-1.5 font-semibold">
                  الوصف الترحيبي المختصر للمنصة:
                </label>
                <input
                  type="text"
                  value={taglineArabic}
                  onChange={(e) => setTaglineArabic(e.target.value)}
                  placeholder="منصة التعليم الطبي والأكاديمي الموحدة لطلاب كليات الطب البشري..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Accordion Section 2: سياسات المنصة والشروط والخصوصية */}
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection('legal')}
            className="w-full p-4 flex items-center justify-between gap-3 text-right hover:bg-[var(--bg-elevated)]/60 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-400 shrink-0">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-bold text-[var(--text-primary)]">
                  2. سياسات المنصة والشروط والخصوصية
                </div>
                <div className="text-[11px] text-[var(--text-muted)]">
                  بنود شروط الاستخدام الأكاديمية وسياسة الخصوصية وحماية بيانات الطلاب
                </div>
              </div>
            </div>
            {openAccordion === 'legal' ? (
              <ChevronUp className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
            ) : (
              <ChevronDown className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
            )}
          </button>

          {openAccordion === 'legal' && (
            <div className="p-4 pt-2 border-t border-[var(--border-color)] space-y-4 bg-[var(--bg-card)]">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[var(--text-primary)] font-bold flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-teal-400" />
                    <span>بنود شروط الاستخدام الأكاديمية:</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setTermsText(DEFAULT_PLATFORM_SETTINGS.termsOfUseArabic)}
                    className="text-[11px] text-[var(--text-muted)] hover:text-teal-400"
                  >
                    استعادة النص الافتراضي
                  </button>
                </div>
                <textarea
                  rows={6}
                  value={termsText}
                  onChange={(e) => setTermsText(e.target.value)}
                  className="w-full p-3.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] leading-relaxed focus:outline-none focus:border-teal-500"
                  placeholder="اكتب بنود شروط استخدام المنصة هنا..."
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[var(--text-primary)] font-bold flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>سياسة الخصوصية وحماية بيانات الطلاب:</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setPrivacyText(DEFAULT_PLATFORM_SETTINGS.privacyPolicyArabic)}
                    className="text-[11px] text-[var(--text-muted)] hover:text-teal-400"
                  >
                    استعادة النص الافتراضي
                  </button>
                </div>
                <textarea
                  rows={6}
                  value={privacyText}
                  onChange={(e) => setPrivacyText(e.target.value)}
                  className="w-full p-3.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] leading-relaxed focus:outline-none focus:border-teal-500"
                  placeholder="اكتب بنود سياسة الخصوصية وحماية البيانات هنا..."
                />
              </div>
            </div>
          )}
        </div>

        {/* Accordion Section 3: قنوات التواصل والدعم الفني ومطوري النظام */}
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection('contact')}
            className="w-full p-4 flex items-center justify-between gap-3 text-right hover:bg-[var(--bg-elevated)]/60 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
                <Phone className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-bold text-[var(--text-primary)]">
                  3. قنوات التواصل والدعم الفني ومطوري النظام
                </div>
                <div className="text-[11px] text-[var(--text-muted)]">
                  واتساب، تيليجرام، البريد الرسمي، الهاتف، والعنوان الأكاديمي
                </div>
              </div>
            </div>
            {openAccordion === 'contact' ? (
              <ChevronUp className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
            ) : (
              <ChevronDown className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
            )}
          </button>

          {openAccordion === 'contact' && (
            <div className="p-4 pt-2 border-t border-[var(--border-color)] space-y-4 bg-[var(--bg-card)]">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1.5 font-semibold">
                    رقم واتساب للدعم والتواصل المباشر:
                  </label>
                  <input
                    type="text"
                    value={whatsappNumber}
                    onChange={(e) => setWhatsappNumber(e.target.value)}
                    placeholder="+967770000000"
                    dir="ltr"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-emerald-400 font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[var(--text-secondary)] mb-1.5 font-semibold">
                    البريد الإلكتروني الرسمي للدعم الفني:
                  </label>
                  <input
                    type="email"
                    value={supportEmail}
                    onChange={(e) => setSupportEmail(e.target.value)}
                    placeholder="support@example.com"
                    dir="ltr"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-teal-400 font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[var(--text-secondary)] mb-1.5 font-semibold">
                    رقم الهاتف للاتصال المباشر:
                  </label>
                  <input
                    type="text"
                    value={supportPhone}
                    onChange={(e) => setSupportPhone(e.target.value)}
                    placeholder="+967770000000"
                    dir="ltr"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[var(--text-secondary)] mb-1.5 font-semibold">
                    رابط قناة أو دعم تيليجرام (Telegram):
                  </label>
                  <input
                    type="text"
                    value={telegramUrl}
                    onChange={(e) => setTelegramUrl(e.target.value)}
                    placeholder="https://t.me/umed_yemen"
                    dir="ltr"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-sky-400 font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[var(--text-secondary)] mb-1.5 font-semibold">
                    رابط صفحة فيسبوك أو حساب رسمي (اختياري):
                  </label>
                  <input
                    type="text"
                    value={facebookUrl}
                    onChange={(e) => setFacebookUrl(e.target.value)}
                    placeholder="https://facebook.com/..."
                    dir="ltr"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[var(--text-secondary)] mb-1.5 font-semibold">
                    رابط الموقع الرسمي الإضافي (اختياري):
                  </label>
                  <input
                    type="text"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    placeholder="https://..."
                    dir="ltr"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1.5 font-semibold">
                    العنوان أو المقر الأكاديمي:
                  </label>
                  <input
                    type="text"
                    value={officeAddressArabic}
                    onChange={(e) => setOfficeAddressArabic(e.target.value)}
                    placeholder="الجمهورية اليمنية — صنعاء..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[var(--text-secondary)] mb-1.5 font-semibold">
                    أوقات العمل والاستجابة للدعم الفني:
                  </label>
                  <input
                    type="text"
                    value={workingHoursArabic}
                    onChange={(e) => setWorkingHoursArabic(e.target.value)}
                    placeholder="متاح على مدار الساعة..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="pt-2 border-t border-[var(--border-color)] flex flex-wrap items-center justify-between gap-3">
          <span className="text-[11px] text-[var(--text-muted)]">
            آخر تحديث:{' '}
            <code className="text-amber-400 font-mono">
              {new Date(settings.updatedAt).toLocaleString('ar-YE')}
            </code>
          </span>

          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-l from-amber-600 to-teal-600 hover:from-amber-500 hover:to-teal-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-2 shadow-lg transition-all"
          >
            {saving ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            <span>حفظ واعتماد إعدادات المنصة الآن</span>
          </button>
        </div>
      </form>
    </div>
  );
}

interface PlatformLegalAndContactModalProps {
  isOpen: boolean;
  initialTab: 'terms' | 'privacy' | 'contact';
  settings: PlatformBrandingAndPolicies;
  onClose: () => void;
}

export function PlatformLegalAndContactModal({
  isOpen,
  initialTab,
  settings,
  onClose
}: PlatformLegalAndContactModalProps) {
  const [tab, setTab] = useState<'terms' | 'privacy' | 'contact'>(initialTab);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab, isOpen]);

  if (!isOpen) return null;

  const cleanWhatsapp = (settings.contactChannels.whatsappNumber || '').replace(/[^\d+]/g, '');
  const whatsappLink = cleanWhatsapp
    ? `https://wa.me/${cleanWhatsapp.replace(/^\+/, '')}?text=${encodeURIComponent(
        `مرحباً بإدارة ${settings.platformNameArabic}، لدي استفسار بخصوص المنصة:`
      )}`
    : '';

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3.5 sm:p-6 overflow-y-auto"
      dir="rtl"
    >
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-5 sm:p-6 max-w-2xl w-full max-h-[88dvh] flex flex-col justify-between space-y-4 shadow-2xl my-auto">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3.5">
          <div className="flex items-center gap-3">
            <PlatformLogoBadge settings={settings} size="sm" />
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-[var(--text-primary)]">
                {settings.platformNameArabic}
              </h3>
              <p className="text-[11px] text-[var(--text-muted)]">
                شروط الاستخدام الأكاديمي، سياسة الخصوصية، وقنوات التواصل الرسمية
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1.5 p-1 bg-[var(--bg-input)] rounded-xl border border-[var(--border-color)] text-xs">
          <button
            type="button"
            onClick={() => setTab('terms')}
            className={`py-2 px-2 rounded-lg font-bold flex items-center justify-center gap-1.5 transition-all ${
              tab === 'terms'
                ? 'bg-teal-600 text-white'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <FileText className="w-3.5 h-3.5 shrink-0" />
            <span>شروط الاستخدام</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('privacy')}
            className={`py-2 px-2 rounded-lg font-bold flex items-center justify-center gap-1.5 transition-all ${
              tab === 'privacy'
                ? 'bg-emerald-600 text-white'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            <span>سياسة الخصوصية</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('contact')}
            className={`py-2 px-2 rounded-lg font-bold flex items-center justify-center gap-1.5 transition-all ${
              tab === 'contact'
                ? 'bg-indigo-600 text-white'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Phone className="w-3.5 h-3.5 shrink-0" />
            <span>تواصل مع المنصة</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
          {tab === 'terms' && (
            <div className="p-4 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] space-y-2">
              <div className="font-bold text-teal-400 text-sm flex items-center gap-2 pb-2 border-b border-[var(--border-color)]">
                <FileText className="w-4 h-4" />
                <span>شروط وأحكام استخدام المنصة</span>
              </div>
              <div className="text-[var(--text-primary)] whitespace-pre-line leading-relaxed pt-1">
                {settings.termsOfUseArabic}
              </div>
            </div>
          )}

          {tab === 'privacy' && (
            <div className="p-4 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] space-y-2">
              <div className="font-bold text-emerald-400 text-sm flex items-center gap-2 pb-2 border-b border-[var(--border-color)]">
                <ShieldCheck className="w-4 h-4" />
                <span>سياسة الخصوصية وأمن البيانات</span>
              </div>
              <div className="text-[var(--text-primary)] whitespace-pre-line leading-relaxed pt-1">
                {settings.privacyPolicyArabic}
              </div>
            </div>
          )}

          {tab === 'contact' && (
            <div className="space-y-3">
              <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/30 space-y-1">
                <div className="text-sm font-bold text-indigo-400">
                  يسعدنا تواصلكم مع إدارة {settings.platformShortName}
                </div>
                <p className="text-[11px] text-[var(--text-secondary)]">
                  للاستفسارات الأكاديمية، اعتماد القيد الجامعي، أو الدعم الفني، تواصلوا معنا مباشرة عبر القنوات المعتمدة التالية:
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {whatsappLink && (
                  <a
                    href={whatsappLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-3.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-between gap-2 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                        <MessageCircle className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-bold text-emerald-400">مراسلة عبر واتساب</div>
                        <div className="text-[11px] text-[var(--text-secondary)] font-mono" dir="ltr">
                          {settings.contactChannels.whatsappNumber}
                        </div>
                      </div>
                    </div>
                    <ExternalLink className="w-4 h-4 text-emerald-400 shrink-0" />
                  </a>
                )}

                {settings.contactChannels.telegramUrl && (
                  <a
                    href={settings.contactChannels.telegramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-3.5 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 flex items-center justify-between gap-2 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-sky-500/20 flex items-center justify-center text-sky-400">
                        <Send className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-bold text-sky-400">قناة ودعم تيليجرام</div>
                        <div
                          className="text-[11px] text-[var(--text-secondary)] font-mono truncate max-w-[160px]"
                          dir="ltr"
                        >
                          {settings.contactChannels.telegramUrl}
                        </div>
                      </div>
                    </div>
                    <ExternalLink className="w-4 h-4 text-sky-400 shrink-0" />
                  </a>
                )}

                {settings.contactChannels.supportEmail && (
                  <a
                    href={`mailto:${settings.contactChannels.supportEmail}`}
                    className="p-3.5 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-color)] flex items-center justify-between gap-2 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-teal-500/20 flex items-center justify-center text-teal-400">
                        <Mail className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-bold text-[var(--text-primary)]">البريد الإلكتروني الرسمي</div>
                        <div className="text-[11px] text-teal-400 font-mono" dir="ltr">
                          {settings.contactChannels.supportEmail}
                        </div>
                      </div>
                    </div>
                    <ExternalLink className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                  </a>
                )}

                {settings.contactChannels.supportPhone && (
                  <a
                    href={`tel:${settings.contactChannels.supportPhone}`}
                    className="p-3.5 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-color)] flex items-center justify-between gap-2 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                        <Phone className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-bold text-[var(--text-primary)]">الاتصال الهاتفي المباشر</div>
                        <div className="text-[11px] text-indigo-400 font-mono" dir="ltr">
                          {settings.contactChannels.supportPhone}
                        </div>
                      </div>
                    </div>
                    <ExternalLink className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                  </a>
                )}

                {settings.contactChannels.facebookUrl && (
                  <a
                    href={settings.contactChannels.facebookUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-3.5 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-color)] flex items-center justify-between gap-2 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400">
                        <Globe className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-bold text-[var(--text-primary)]">الصفحة الرسمية (فيسبوك)</div>
                        <div
                          className="text-[11px] text-blue-400 font-mono truncate max-w-[160px]"
                          dir="ltr"
                        >
                          {settings.contactChannels.facebookUrl}
                        </div>
                      </div>
                    </div>
                    <ExternalLink className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                  </a>
                )}

                {settings.contactChannels.websiteUrl && (
                  <a
                    href={settings.contactChannels.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-3.5 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-color)] flex items-center justify-between gap-2 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-400">
                        <Globe className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-bold text-[var(--text-primary)]">الموقع الإلكتروني</div>
                        <div
                          className="text-[11px] text-amber-400 font-mono truncate max-w-[160px]"
                          dir="ltr"
                        >
                          {settings.contactChannels.websiteUrl}
                        </div>
                      </div>
                    </div>
                    <ExternalLink className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                  </a>
                )}
              </div>

              {(settings.contactChannels.officeAddressArabic ||
                settings.contactChannels.workingHoursArabic) && (
                <div className="p-4 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] space-y-2 text-[11px] text-[var(--text-secondary)]">
                  {settings.contactChannels.officeAddressArabic && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-teal-400 shrink-0" />
                      <span>{settings.contactChannels.officeAddressArabic}</span>
                    </div>
                  )}
                  {settings.contactChannels.workingHoursArabic && (
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>{settings.contactChannels.workingHoursArabic}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="pt-3 border-t border-[var(--border-color)] flex items-center justify-between">
          <span className="text-[11px] text-[var(--text-muted)]">{settings.platformShortName}</span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-color)] text-[var(--text-primary)] text-xs font-bold"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
