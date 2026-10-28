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

    if (!data || data.action !== 'dismiss') {
      return;
    }

    event.stopImmediatePropagation();
    const tag = data.tag;
    const messageId = data.messageId;
    event.waitUntil(
      self.registration.getNotifications().then((notifications) => {
        for (const notification of notifications) {
          const matches = tag
            ? notification.tag === tag
            : Boolean(
                messageId &&
                notification.data &&
                notification.data.messageId === messageId,
              );
          if (matches) {
            notification.close();
          }
        }
      }),
    );
  });
})();

importScripts('./ngsw-worker.js');
