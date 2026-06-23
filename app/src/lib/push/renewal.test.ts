/**
 * Tests for push subscription renewal — ordering and failure-safety guarantees.
 *
 * Tests: app/src/lib/push/renewal.ts::checkAndRenewPushSubscription
 *
 * Regression focus: renewal MUST unsubscribe the old PushSubscription BEFORE
 * calling subscribeToPush(). subscribeToPush() reuses any existing subscription,
 * so subscribing-then-unsubscribing would re-register and then immediately drop
 * the same endpoint — leaving the device with no push capability while still
 * stamping the "last renewal" marker (the silent-kill bug). See renewal.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// subscribeToPush is mocked so we can assert call ordering relative to unsubscribe.
vi.mock('./subscribe', () => ({
  subscribeToPush: vi.fn(),
}));

import { subscribeToPush } from './subscribe';
import { checkAndRenewPushSubscription } from './renewal';

const mockSubscribeToPush = vi.mocked(subscribeToPush);

const LAST_RENEWAL_KEY = 'cos-push-last-renewal';
const RENEWAL_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

/** Minimal in-memory localStorage stub for the node test environment. */
function makeLocalStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

interface FakeSubscription {
  expirationTime: number | null;
  unsubscribe: ReturnType<typeof vi.fn>;
}

/**
 * Installs the browser globals checkAndRenewPushSubscription relies on, wired so
 * that getSubscription() returns the provided fake subscription. Records the order
 * of side effects (unsubscribe vs subscribe) into `callOrder`.
 */
function installPushEnvironment(opts: {
  permission?: NotificationPermission;
  subscription: FakeSubscription | null;
  callOrder: string[];
}) {
  const { permission = 'granted', subscription, callOrder } = opts;

  if (subscription) {
    subscription.unsubscribe.mockImplementation(async () => {
      callOrder.push('unsubscribe');
      return true;
    });
  }

  const registration = {
    pushManager: {
      getSubscription: vi.fn().mockResolvedValue(subscription),
    },
  };

  vi.stubGlobal('navigator', {
    serviceWorker: { ready: Promise.resolve(registration) },
  });
  vi.stubGlobal('window', { PushManager: function () {} });
  vi.stubGlobal('Notification', { permission });

  const localStorage = makeLocalStorage();
  vi.stubGlobal('localStorage', localStorage);
  return { localStorage };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSubscribeToPush.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('checkAndRenewPushSubscription — renewal ordering', () => {
  it('unsubscribes the OLD subscription BEFORE re-subscribing', async () => {
    const callOrder: string[] = [];
    const subscription: FakeSubscription = {
      expirationTime: null,
      unsubscribe: vi.fn(),
    };
    const { localStorage } = installPushEnvironment({ subscription, callOrder });

    // Force time-based renewal: last renewal was more than the interval ago.
    localStorage.setItem(LAST_RENEWAL_KEY, String(Date.now() - RENEWAL_INTERVAL_MS - 1000));

    mockSubscribeToPush.mockImplementation(async () => {
      callOrder.push('subscribe');
      return true;
    });

    const result = await checkAndRenewPushSubscription();

    expect(result).toBe(true);
    // The crux of the fix: unsubscribe happens first, THEN subscribe.
    expect(callOrder).toEqual(['unsubscribe', 'subscribe']);
    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);
    expect(mockSubscribeToPush).toHaveBeenCalledTimes(1);
    // Successful renewal stamps the marker.
    expect(localStorage.getItem(LAST_RENEWAL_KEY)).not.toBeNull();
  });

  it('does NOT stamp the renewal marker when re-subscribe fails (so it retries next load)', async () => {
    const callOrder: string[] = [];
    const subscription: FakeSubscription = {
      expirationTime: null,
      unsubscribe: vi.fn(),
    };
    const { localStorage } = installPushEnvironment({ subscription, callOrder });

    const staleStamp = String(Date.now() - RENEWAL_INTERVAL_MS - 1000);
    localStorage.setItem(LAST_RENEWAL_KEY, staleStamp);

    mockSubscribeToPush.mockResolvedValue(false); // fresh subscribe fails

    const result = await checkAndRenewPushSubscription();

    expect(result).toBe(false);
    // Marker must NOT advance — otherwise the device sleeps ~7 days with no push.
    expect(localStorage.getItem(LAST_RENEWAL_KEY)).toBe(staleStamp);
  });

  it('skips renewal entirely when there is no existing subscription', async () => {
    const callOrder: string[] = [];
    installPushEnvironment({ subscription: null, callOrder });

    const result = await checkAndRenewPushSubscription();

    expect(result).toBe(false);
    expect(mockSubscribeToPush).not.toHaveBeenCalled();
  });
});
