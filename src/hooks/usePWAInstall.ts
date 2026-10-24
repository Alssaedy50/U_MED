/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * UMED PWA Installation & Online/Offline Connectivity Hooks
 * Handles Chromium/Android `beforeinstallprompt`, iOS Safari guided installation,
 * standalone mode detection, and live online/offline network status.
 */

import { useEffect, useState, useCallback } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

declare global {
  interface Window {
    __umedDeferredPrompt?: BeforeInstallPromptEvent | null;
  }
}

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(() => {
    if (typeof window !== 'undefined' && window.__umedDeferredPrompt) {
      return window.__umedDeferredPrompt;
    }
    return null;
  });
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [isIOS, setIsIOS] = useState<boolean>(false);
  const [isAndroid, setIsAndroid] = useState<boolean>(false);
  const [showInstallGuideModal, setShowInstallGuideModal] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkStandalone = () => {
      const standaloneMatch =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      setIsInstalled(standaloneMatch);
    };

    checkStandalone();

    const userAgent = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(userAgent));
    setIsAndroid(/android/.test(userAgent));

    if (window.__umedDeferredPrompt) {
      setDeferredPrompt(window.__umedDeferredPrompt);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      window.__umedDeferredPrompt = promptEvent;
      setDeferredPrompt(promptEvent);
    };

    const handleEarlyPromptReady = () => {
      if (window.__umedDeferredPrompt) {
        setDeferredPrompt(window.__umedDeferredPrompt);
      }
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      window.__umedDeferredPrompt = null;
      setDeferredPrompt(null);
      setShowInstallGuideModal(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('umed-pwa-prompt-ready', handleEarlyPromptReady);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('umed-pwa-prompt-ready', handleEarlyPromptReady);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = useCallback(async (): Promise<boolean> => {
    const promptToUse = deferredPrompt || (typeof window !== 'undefined' ? window.__umedDeferredPrompt : null);
    if (promptToUse) {
      try {
        await promptToUse.prompt();
        const { outcome } = await promptToUse.userChoice;
        if (outcome === 'accepted') {
          setIsInstalled(true);
          window.__umedDeferredPrompt = null;
          setDeferredPrompt(null);
          return true;
        }
      } catch (e) {
        setShowInstallGuideModal(true);
      }
      return false;
    }

    // If native prompt is not immediately available (e.g. iOS Safari or preview iframe), open guided install modal
    setShowInstallGuideModal(true);
    return false;
  }, [deferredPrompt]);

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isIOS,
    isAndroid,
    install,
    showInstallGuideModal,
    setShowInstallGuideModal
  };
}
