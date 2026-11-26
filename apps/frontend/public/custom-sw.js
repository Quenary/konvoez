(function () {
  const bodies = new WeakMap();
  const originalJson = PushMessageData.prototype.json;

  function cachedJson() {
    if (bodies.has(this)) {
      return bodies.get(this);
    }
    const payload = originalJson.call(this);
    bodies.set(this, payload);
    return payload;
  }

  try {
    PushMessageData.prototype.json = cachedJson;
  } catch {
    // The listener below restores the body on the event if this fails.
  }

  self.addEventListener('push', (event) => {
    if (!event.data) {
      return;
    }

    let data;
    try {
      data = event.data.json();
    } catch {
      return;
    }

    const raw = JSON.stringify(data);
    const json = () => data;
    const text = () => raw;
    try {
      event.data.json = json;
      event.data.text = text;
    } catch {
      // Angular's worker already received a cached body from cachedJson.
    }

    if (!data || (data.action !== 'dismiss' && data.action !== 'update')) {
      return;
    }

    if (data.action === 'update') {
      event.stopImmediatePropagation();
      const update = data.notification;
      if (!update || typeof update.tag !== 'string') {
        return;
      }
      event.waitUntil(
        self.registration.getNotifications().then(async (notifications) => {
          const existing = notifications.find(
            (notification) => notification.tag === update.tag,
          );
          await self.registration.showNotification(update.title, {
            body: update.body,
            icon: update.icon,
            tag: update.tag,
            data: update.data,
            silent: Boolean(existing),
          });
        }),
      );
      return;
    }

    event.stopImmediatePropagation();
    event.waitUntil(
      self.registration.getNotifications().then(async (notifications) => {
        for (const notification of notifications) {
          const directMatch = data.tag
            ? notification.tag === data.tag
            : Array.isArray(data.tags)
              ? data.tags.includes(notification.tag)
              : Boolean(
                  data.messageId &&
                  notification.data &&
                  notification.data.messageId === data.messageId,
                );
          const matches =
            directMatch ||
            (data.maxMessageId && matchesReadThrough(notification, data));
          if (matches) {
            notification.close();
          }
        }
      }),
    );
  });

  function matchesReadThrough(notification, dismissal) {
    const data = notification.data;
    if (
      !data ||
      data.type === 'reaction' ||
      typeof data.messageId !== 'string' ||
      typeof dismissal.maxMessageId !== 'string'
    ) {
      return false;
    }

    const belongsToChat = dismissal.roomId
      ? data.roomId === dismissal.roomId
      : data.type === 'direct-message' &&
        data.senderId === dismissal.recipientId;

    const messageId = data.messageId.replace(/-/g, '').toLowerCase();
    const maxMessageId = dismissal.maxMessageId.replace(/-/g, '').toLowerCase();
    if (
      !/^[0-9a-f]{32}$/.test(messageId) ||
      !/^[0-9a-f]{32}$/.test(maxMessageId)
    ) {
      return false;
    }

    return belongsToChat && messageId <= maxMessageId;
  }
})();

importScripts('./ngsw-worker.js');
