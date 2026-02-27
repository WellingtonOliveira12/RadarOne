/**
 * Push Notifications - Gerenciamento de notificações push
 *
 * Features:
 * - Registrar service worker
 * - Solicitar permissão de notificações
 * - Criar subscription e enviar ao backend
 * - Revogar subscription
 */

import { API_BASE_URL } from '../constants/app';
import { getToken } from './auth';

// VAPID public key - deve ser gerada no backend e configurada aqui
// Execute: npx web-push generate-vapid-keys
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

/**
 * URL-safe base64 to Uint8Array
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Verifica se o navegador suporta push notifications
 */
export function isPushSupported(): boolean {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * Registrar Service Worker
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    console.log('[Push] Service Worker não suportado');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    console.log('[Push] Service Worker registrado:', registration);
    return registration;
  } catch (error) {
    console.error('[Push] Erro ao registrar Service Worker:', error);
    return null;
  }
}

/**
 * Solicitar permissão de notificações
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    console.log('[Push] Notifications não suportadas');
    return 'denied';
  }

  if (Notification.permission === 'granted') {
    return 'granted';
  }

  if (Notification.permission === 'denied') {
    return 'denied';
  }

  // Solicitar permissão ao usuário
  const permission = await Notification.requestPermission();
  console.log('[Push] Permissão:', permission);
  return permission;
}

/**
 * Criar subscription e enviar ao backend
 */
export async function subscribeToPushNotifications(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    // 1. Verificar suporte
    if (!isPushSupported()) {
      return { success: false, error: 'Push notifications não suportadas' };
    }

    // 2. Solicitar permissão
    const permission = await requestNotificationPermission();
    if (permission !== 'granted') {
      return { success: false, error: 'Permissão negada' };
    }

    // 3. Registrar Service Worker
    const registration = await registerServiceWorker();
    if (!registration) {
      return { success: false, error: 'Falha ao registrar Service Worker' };
    }

    // 4. Criar Push Subscription
    if (!VAPID_PUBLIC_KEY) {
      return { success: false, error: 'VAPID key não configurada' };
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    console.log('[Push] Subscription criada:', subscription);

    // 5. Enviar subscription ao backend
    const token = getToken();
    const response = await fetch(`${API_BASE_URL}/api/push/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        keys: {
          p256dh: arrayBufferToBase64(subscription.getKey('p256dh')),
          auth: arrayBufferToBase64(subscription.getKey('auth')),
        },
      }),
    });

    if (!response.ok) {
      throw new Error('Falha ao salvar subscription no backend');
    }

    console.log('[Push] Subscription salva no backend');
    return { success: true };
  } catch (error: unknown) {
    console.error('[Push] Erro ao criar subscription:', error);
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    return { success: false, error: message };
  }
}

/**
 * Revogar subscription
 */
export async function unsubscribeFromPushNotifications(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      return { success: true }; // Já não tem subscription
    }

    // Unsubscribe do navegador
    await subscription.unsubscribe();

    // Remover do backend
    const token = getToken();
    await fetch(`${API_BASE_URL}/api/push/unsubscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        endpoint: subscription.endpoint,
      }),
    });

    console.log('[Push] Unsubscribed');
    return { success: true };
  } catch (error: unknown) {
    console.error('[Push] Erro ao unsubscribe:', error);
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    return { success: false, error: message };
  }
}

/**
 * Verificar se já tem subscription ativa
 */
export async function hasActiveSubscription(): Promise<boolean> {
  try {
    if (!isPushSupported()) return false;

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    return subscription !== null;
  } catch (error) {
    console.error('[Push] Erro ao verificar subscription:', error);
    return false;
  }
}

/**
 * Helper: ArrayBuffer to base64
 */
function arrayBufferToBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}
