/**
 * Service Worker - Push Notifications
 *
 * Responsável por:
 * - Receber notificações push do servidor
 * - Exibir notificações ao usuário
 * - Lidar com cliques nas notificações
 */

// Instalação do Service Worker
self.addEventListener('install', (event) => {
  console.log('[SW] Service Worker instalado');
  self.skipWaiting();
});

// Ativação do Service Worker
self.addEventListener('activate', (event) => {
  console.log('[SW] Service Worker ativado');
  event.waitUntil(clients.claim());
});

// Receber Push Notification
self.addEventListener('push', (event) => {
  console.log('[SW] Push recebido', event);

  if (!event.data) {
    console.log('[SW] Push sem dados');
    return;
  }

  let data;
  try {
    data = event.data.json();
  } catch (err) {
    console.error('[SW] Erro ao parsear dados do push:', err);
    return;
  }

  const title = data.title || 'RadarOne';
  const options = {
    body: data.body || '',
    icon: data.icon || '/favicon.ico',
    badge: '/favicon.ico',
    data: {
      url: data.url || '/',
      couponCode: data.couponCode,
      type: data.type,
    },
    requireInteraction: data.requireInteraction || false,
    tag: data.tag || 'default',
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Clique na Notification
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notificação clicada', event);

  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Se já tem uma janela do RadarOne aberta, focar nela
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus().then(() => {
            return client.navigate(urlToOpen);
          });
        }
      }

      // Caso contrário, abrir nova janela
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// Background Sync (futuro - sincronização offline)
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);
  // Pode ser usado no futuro para sincronizar dados offline
});
