/**
 * Browser-side helper for Web Push subscription (Phase 2 P2.1.4).
 *
 * Flow:
 *   1. Ask the server for the VAPID public key (`GET /api/push/public-key`).
 *      If the server returns 503, push is unconfigured for this deployment
 *      and we bail silently.
 *   2. Get the active service worker registration.
 *   3. Request Notification permission from the browser (returns early with
 *      `'denied'` if the user already refused).
 *   4. Call `PushManager.subscribe(...)` with the VAPID key.
 *   5. POST the resulting `PushSubscription.toJSON()` to `/api/push/subscribe`.
 *
 * All failures resolve to `{ ok: false, reason }` rather than throwing —
 * push is an optional enhancement; a failure should never bubble into the
 * caller's UI flow.
 */

type Result =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'unsupported'
        | 'unconfigured'
        | 'no-registration'
        | 'permission-denied'
        | 'subscribe-failed'
        | 'post-failed';
      detail?: string;
    };

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  // The VAPID public key is base64url; PushManager expects a Uint8Array
  // backed by a plain ArrayBuffer (not SharedArrayBuffer). Pad to a multiple
  // of 4 and swap url-safe chars for standard base64 before atob().
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const buf = new ArrayBuffer(rawData.length);
  const output = new Uint8Array(buf);
  for (let i = 0; i < rawData.length; i += 1) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export async function getPermissionState(): Promise<NotificationPermission | 'unsupported'> {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

export async function subscribeToPush(): Promise<Result> {
  if (!isPushSupported()) return { ok: false, reason: 'unsupported' };

  let keyRes: Response;
  try {
    keyRes = await fetch('/api/push/public-key', { credentials: 'include' });
  } catch (err) {
    return { ok: false, reason: 'unconfigured', detail: String(err) };
  }
  if (keyRes.status === 503) return { ok: false, reason: 'unconfigured' };
  if (!keyRes.ok) return { ok: false, reason: 'unconfigured' };
  const { publicKey } = (await keyRes.json()) as { publicKey?: string };
  if (!publicKey) return { ok: false, reason: 'unconfigured' };

  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return { ok: false, reason: 'no-registration' };

  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, reason: 'permission-denied' };

  let subscription: PushSubscription;
  try {
    const existing = await reg.pushManager.getSubscription();
    subscription =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      }));
  } catch (err) {
    return { ok: false, reason: 'subscribe-failed', detail: String(err) };
  }

  try {
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription.toJSON()),
    });
    if (!res.ok) {
      return { ok: false, reason: 'post-failed', detail: `HTTP ${res.status}` };
    }
  } catch (err) {
    return { ok: false, reason: 'post-failed', detail: String(err) };
  }

  return { ok: true };
}

export async function unsubscribeFromPush(): Promise<Result> {
  if (!isPushSupported()) return { ok: false, reason: 'unsupported' };
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return { ok: false, reason: 'no-registration' };
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return { ok: true };
  const endpoint = sub.endpoint;
  try {
    await sub.unsubscribe();
  } catch {
    /* best-effort — fall through to server-side delete anyway */
  }
  try {
    const res = await fetch('/api/push/unsubscribe', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint }),
    });
    if (!res.ok) {
      return { ok: false, reason: 'post-failed', detail: `HTTP ${res.status}` };
    }
  } catch (err) {
    return { ok: false, reason: 'post-failed', detail: String(err) };
  }
  return { ok: true };
}
