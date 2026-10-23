/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * UMED Academic Notification Center Modal & Live Alerts Drawer
 * Allows medical students and faculty to:
 * - View unread alerts for posts, data, exams, competitions, and status updates
 * - Switch directly to the relevant course, exam, or library material
 * - Toggle sound alerts (Web Audio API synthesized chimes)
 * - Enable native browser notifications
 * - Run instant test alerts to verify system readiness
 */

import React, { useState, useEffect } from 'react';
import { 
  Bell, 
  Volume2, 
  VolumeX, 
  CheckCheck, 
  Trash2, 
  X, 
  BookOpen, 
  Trophy, 
  FileText, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  ExternalLink,
  Settings,
  ChevronDown,
  ChevronUp,
  ShieldCheck
} from 'lucide-react';
import { 
  AppNotification, 
  NotificationSettings,
  NotificationCategoryType,
  getNotificationSettings,
  updateNotificationSettings,
  getBrowserNotificationPermission,
  requestBrowserNotificationPermission,
  getStoredNotifications,
  subscribeToAppNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  clearAllNotifications,
  triggerTestNotification,
  playNotificationSound
} from '../../services/notificationService.ts';

interface NotificationCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateTab?: (tab: string, payload?: Record<string, unknown>) => void;
  isDarkMode?: boolean;
}

export default function NotificationCenterModal({
  isOpen,
  onClose,
  onNavigateTab,
  isDarkMode = true
}: NotificationCenterModalProps) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [settings, setSettings] = useState<NotificationSettings>(getNotificationSettings());
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission | 'unsupported'>(getBrowserNotificationPermission());
  const [showSettingsDrawer, setShowSettingsDrawer] = useState<boolean>(false);
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'post' | 'data' | 'assessment' | 'update'>('all');
  const [testAlertTriggering, setTestAlertTriggering] = useState<boolean>(false);

  useEffect(() => {
    const unsub = subscribeToAppNotifications((list) => {
      setNotifications(list);
    });
    setBrowserPermission(getBrowserNotificationPermission());
    return () => unsub();
  }, []);

  if (!isOpen) return null;

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleToggleSound = () => {
    const updated = updateNotificationSettings({ sound: !settings.sound });
    setSettings(updated);
    if (updated.sound) {
      playNotificationSound('system');
    }
  };

  const handleRequestPermission = async () => {
    const perm = await requestBrowserNotificationPermission();
    setBrowserPermission(perm);
  };

  const handleTestChime = async () => {
    setTestAlertTriggering(true);
    try {
      await triggerTestNotification();
    } finally {
      setTimeout(() => setTestAlertTriggering(false), 600);
    }
  };

  const handleNotificationClick = (notif: AppNotification) => {
    markNotificationAsRead(notif.id);
    if (notif.actionTab && onNavigateTab) {
      onNavigateTab(notif.actionTab, notif.actionPayload);
      onClose();
    }
  };

  const filteredNotifications = notifications.filter(n => {
    if (selectedFilter === 'all') return true;
    if (selectedFilter === 'post') return n.category === 'post';
    if (selectedFilter === 'data') return n.category === 'data';
    if (selectedFilter === 'assessment') return n.category === 'exam' || n.category === 'competition';
    if (selectedFilter === 'update') return n.category === 'update';
    return true;
  });

  const getCategoryBadge = (category: NotificationCategoryType) => {
    switch (category) {
      case 'post':
        return {
          label: 'منشور دفعة',
          bg: isDarkMode ? 'bg-sky-950/80 text-sky-400 border-sky-800/50' : 'bg-sky-50 text-sky-700 border-sky-200',
          icon: <Bell className="w-3.5 h-3.5" />
        };
      case 'data':
        return {
          label: 'داتا ومحاضرة',
          bg: isDarkMode ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800/50' : 'bg-emerald-50 text-emerald-700 border-emerald-200',
          icon: <BookOpen className="w-3.5 h-3.5" />
        };
      case 'exam':
        return {
          label: 'اختبار أكاديمي',
          bg: isDarkMode ? 'bg-amber-950/80 text-amber-400 border-amber-800/50' : 'bg-amber-50 text-amber-700 border-amber-200',
          icon: <FileText className="w-3.5 h-3.5" />
        };
      case 'competition':
        return {
          label: 'مسابقة طبية',
          bg: isDarkMode ? 'bg-purple-950/80 text-purple-400 border-purple-800/50' : 'bg-purple-50 text-purple-700 border-purple-200',
          icon: <Trophy className="w-3.5 h-3.5" />
        };
      case 'update':
        return {
          label: 'تحديث وقيد',
          bg: isDarkMode ? 'bg-indigo-950/80 text-indigo-400 border-indigo-800/50' : 'bg-indigo-50 text-indigo-700 border-indigo-200',
          icon: <CheckCircle2 className="w-3.5 h-3.5" />
        };
      default:
        return {
          label: 'تنبيه نظام',
          bg: isDarkMode ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-200',
          icon: <Sparkles className="w-3.5 h-3.5" />
        };
    }
  };

  const formatTimestampArabic = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const diffMs = Date.now() - date.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      const diffHrs = Math.floor(diffMin / 60);

      if (diffMin < 1) return 'الآن';
      if (diffMin < 60) return `منذ ${diffMin} دقيقة`;
      if (diffHrs < 24) return `منذ ${diffHrs} ساعة`;
      return date.toLocaleDateString('ar-YE', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div 
        className={`w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl shadow-2xl border overflow-hidden ${
          isDarkMode 
            ? 'bg-slate-900 border-slate-800 text-slate-100' 
            : 'bg-white border-slate-200 text-slate-800'
        }`}
      >
        {/* Modal Header */}
        <div className={`p-4 border-b flex items-center justify-between ${
          isDarkMode ? 'border-slate-800 bg-slate-900/90' : 'border-slate-200 bg-slate-50'
        }`}>
          <div className="flex items-center gap-3">
            <div className="relative p-2.5 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 text-white shadow-md">
              <Bell className="w-5 h-5 animate-pulse" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow">
                  {unreadCount > 9 ? '+9' : unreadCount}
                </span>
              )}
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold flex items-center gap-2">
                مركز التنبيهات الأكاديمية
                {unreadCount > 0 && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                    isDarkMode ? 'bg-sky-950 text-sky-400 border border-sky-800' : 'bg-sky-100 text-sky-700'
                  }`}>
                    {unreadCount} جديد
                  </span>
                )}
              </h2>
              <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                إشعارات مباشرة للمناشير والداتا السريرية والاختبارات
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowSettingsDrawer(!showSettingsDrawer)}
              className={`p-2 rounded-xl transition-colors ${
                showSettingsDrawer
                  ? (isDarkMode ? 'bg-sky-900/40 text-sky-400' : 'bg-sky-100 text-sky-700')
                  : (isDarkMode ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200' : 'text-slate-500 hover:bg-slate-100')
              }`}
              title="إعدادات الإشعارات والأصوات"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className={`p-2 rounded-xl transition-colors ${
                isDarkMode ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200' : 'text-slate-500 hover:bg-slate-100'
              }`}
              title="إغلاق"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Browser Permission & Quick Action Strip */}
        <div className={`px-4 py-2.5 border-b flex items-center justify-between gap-2 text-xs ${
          isDarkMode ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
        }`}>
          <div className="flex items-center gap-2 overflow-hidden text-ellipsis whitespace-nowrap">
            {browserPermission === 'granted' ? (
              <span className="flex items-center gap-1.5 text-emerald-500 font-medium">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                تنبيهات النظام مفعلة
              </span>
            ) : browserPermission === 'denied' ? (
              <span className="flex items-center gap-1.5 text-amber-500 font-medium">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                الإشعارات محظورة بالمتصفح
              </span>
            ) : (
              <button
                onClick={handleRequestPermission}
                className="font-bold text-sky-400 hover:underline flex items-center gap-1.5"
              >
                <Bell className="w-3.5 h-3.5 text-sky-400 animate-bounce" />
                انقر لتفعيل إشعارات المتصفح
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleToggleSound}
              className={`p-1.5 rounded-lg border flex items-center gap-1 transition-colors ${
                settings.sound
                  ? (isDarkMode ? 'bg-emerald-950/50 border-emerald-800/60 text-emerald-400' : 'bg-emerald-50 border-emerald-300 text-emerald-700')
                  : (isDarkMode ? 'bg-slate-800 border-slate-700 text-slate-400' : 'bg-slate-100 border-slate-300 text-slate-500')
              }`}
              title={settings.sound ? 'كتم الصوت' : 'تشغيل الصوت'}
            >
              {settings.sound ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              <span className="text-[11px] hidden sm:inline">{settings.sound ? 'صوت مفعل' : 'صامت'}</span>
            </button>

            <button
              onClick={handleTestChime}
              disabled={testAlertTriggering}
              className={`px-2 py-1 rounded-lg border text-[11px] font-semibold transition-all flex items-center gap-1 ${
                isDarkMode
                  ? 'bg-sky-950/60 border-sky-800 text-sky-300 hover:bg-sky-900/60'
                  : 'bg-sky-50 border-sky-200 text-sky-700 hover:bg-sky-100'
              }`}
            >
              <Sparkles className={`w-3 h-3 ${testAlertTriggering ? 'animate-spin' : ''}`} />
              تجربة إشعار
            </button>
          </div>
        </div>

        {/* Collapsible Settings Drawer */}
        {showSettingsDrawer && (
          <div className={`p-4 border-b space-y-3 transition-all ${
            isDarkMode ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-100 border-slate-200'
          }`}>
            <div className="flex items-center justify-between pb-2 border-b border-slate-800/50">
              <span className="text-xs font-bold text-sky-400 flex items-center gap-1.5">
                <Settings className="w-3.5 h-3.5" />
                تفضيلات التنبيهات الفورية
              </span>
              <button 
                onClick={() => setShowSettingsDrawer(false)}
                className="text-[11px] text-slate-400 hover:text-slate-200"
              >
                إخفاء
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <label className="flex items-center justify-between p-2 rounded-lg bg-slate-900/50 border border-slate-800">
                <span>تنبيهات المناشير (📢)</span>
                <input
                  type="checkbox"
                  checked={settings.notifyPosts}
                  onChange={(e) => setSettings(updateNotificationSettings({ notifyPosts: e.target.checked }))}
                  className="rounded text-sky-500 focus:ring-0"
                />
              </label>

              <label className="flex items-center justify-between p-2 rounded-lg bg-slate-900/50 border border-slate-800">
                <span>داتا ومحاضرات المكتبة (📚)</span>
                <input
                  type="checkbox"
                  checked={settings.notifyData}
                  onChange={(e) => setSettings(updateNotificationSettings({ notifyData: e.target.checked }))}
                  className="rounded text-sky-500 focus:ring-0"
                />
              </label>

              <label className="flex items-center justify-between p-2 rounded-lg bg-slate-900/50 border border-slate-800">
                <span>الاختبارات الأكاديمية (📝)</span>
                <input
                  type="checkbox"
                  checked={settings.notifyExams}
                  onChange={(e) => setSettings(updateNotificationSettings({ notifyExams: e.target.checked }))}
                  className="rounded text-sky-500 focus:ring-0"
                />
              </label>

              <label className="flex items-center justify-between p-2 rounded-lg bg-slate-900/50 border border-slate-800">
                <span>المسابقات الطبية (🏆)</span>
                <input
                  type="checkbox"
                  checked={settings.notifyCompetitions}
                  onChange={(e) => setSettings(updateNotificationSettings({ notifyCompetitions: e.target.checked }))}
                  className="rounded text-sky-500 focus:ring-0"
                />
              </label>

              <label className="flex items-center justify-between p-2 rounded-lg bg-slate-900/50 border border-slate-800 sm:col-span-2">
                <span>تحديثات الاعتماد والقيد الجامعي (🔄)</span>
                <input
                  type="checkbox"
                  checked={settings.notifyUpdates}
                  onChange={(e) => setSettings(updateNotificationSettings({ notifyUpdates: e.target.checked }))}
                  className="rounded text-sky-500 focus:ring-0"
                />
              </label>
            </div>
          </div>
        )}

        {/* Filter Pills */}
        <div className={`p-2.5 border-b flex items-center gap-1.5 overflow-x-auto no-scrollbar ${
          isDarkMode ? 'border-slate-800 bg-slate-900/50' : 'border-slate-200 bg-white'
        }`}>
          {[
            { id: 'all', label: 'الكل' },
            { id: 'post', label: '📢 منشورات' },
            { id: 'data', label: '📚 داتا' },
            { id: 'assessment', label: '📝 اختبارات ومسابقات' },
            { id: 'update', label: '🔄 تحديثات' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedFilter(tab.id as typeof selectedFilter)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                selectedFilter === tab.id
                  ? 'bg-sky-500 text-white shadow-sm shadow-sky-500/20'
                  : (isDarkMode ? 'bg-slate-800 text-slate-400 hover:text-slate-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Notifications Scroll List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5 min-h-[260px] max-h-[460px]">
          {filteredNotifications.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-3 ${
                isDarkMode ? 'bg-slate-800/80 text-slate-500' : 'bg-slate-100 text-slate-400'
              }`}>
                <Bell className="w-7 h-7" />
              </div>
              <h3 className="text-sm font-bold mb-1">لا توجد إشعارات جديدة حالياً</h3>
              <p className={`text-xs max-w-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                ستتلقى تنبيهات فورية هنا عند إضافة منشور، داتا، اختبار، أو مسابقة جديدة.
              </p>
            </div>
          ) : (
            filteredNotifications.map((notif) => {
              const badge = getCategoryBadge(notif.category);
              return (
                <div
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  className={`relative p-3 rounded-xl border transition-all cursor-pointer group ${
                    notif.read
                      ? (isDarkMode ? 'bg-slate-900/40 border-slate-800/60 opacity-80 hover:opacity-100' : 'bg-slate-50/60 border-slate-200')
                      : (isDarkMode ? 'bg-slate-800/60 border-sky-900/50 hover:border-sky-700 shadow-sm' : 'bg-white border-sky-200 shadow-sm hover:border-sky-300')
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    {/* Category Icon */}
                    <div className="pt-0.5 shrink-0">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold border ${badge.bg}`}>
                        {badge.icon}
                        {badge.label}
                      </span>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <h4 className={`text-xs sm:text-sm font-bold truncate ${
                          notif.read ? (isDarkMode ? 'text-slate-300' : 'text-slate-700') : (isDarkMode ? 'text-white' : 'text-slate-900')
                        }`}>
                          {notif.title}
                        </h4>
                        <span className={`text-[10px] shrink-0 ${isDarkMode ? 'text-slate-400' : 'text-slate-400'}`}>
                          {formatTimestampArabic(notif.createdAt)}
                        </span>
                      </div>

                      <p className={`text-xs line-clamp-2 leading-relaxed mb-2 ${
                        isDarkMode ? 'text-slate-300' : 'text-slate-600'
                      }`}>
                        {notif.body}
                      </p>

                      <div className="flex items-center justify-between text-[11px]">
                        <span className={`font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                          {notif.authorName || 'UMED'}
                        </span>

                        {notif.actionTab && (
                          <span className="text-sky-400 font-semibold flex items-center gap-1 group-hover:underline">
                            عرض التفاصيل
                            <ExternalLink className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Unread indicator */}
                    {!notif.read && (
                      <div className="w-2 h-2 rounded-full bg-sky-500 shrink-0 mt-1.5 shadow-sm shadow-sky-500/50" />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className={`p-3 border-t flex items-center justify-between text-xs ${
          isDarkMode ? 'border-slate-800 bg-slate-900/90' : 'border-slate-200 bg-slate-50'
        }`}>
          <button
            onClick={markAllNotificationsAsRead}
            disabled={unreadCount === 0}
            className={`flex items-center gap-1.5 font-medium transition-colors ${
              unreadCount > 0
                ? 'text-sky-400 hover:text-sky-300'
                : 'text-slate-500 cursor-not-allowed opacity-50'
            }`}
          >
            <CheckCheck className="w-4 h-4" />
            تحديد الكل كمقروء
          </button>

          <button
            onClick={clearAllNotifications}
            disabled={notifications.length === 0}
            className={`flex items-center gap-1.5 transition-colors ${
              notifications.length > 0
                ? 'text-rose-400 hover:text-rose-300'
                : 'text-slate-500 cursor-not-allowed opacity-50'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            مسح السجل
          </button>
        </div>
      </div>
    </div>
  );
}
