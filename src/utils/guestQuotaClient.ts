import type { GuestQuotaInfo } from '../shared/wechatTypes.ts';

export const GUEST_QUERY_LIMIT = 3;
const GUEST_CLIENT_ID_KEY = 'quant_guest_client_id_v1';
const GUEST_QUOTA_STORAGE_KEY = 'quant_guest_quota_v1';

function generateClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

export function getOrCreateGuestClientId(): string {
  try {
    const existing = localStorage.getItem(GUEST_CLIENT_ID_KEY);
    if (existing && /^[a-zA-Z0-9_-]{12,64}$/.test(existing)) {
      return existing;
    }
    const fresh = generateClientId();
    localStorage.setItem(GUEST_CLIENT_ID_KEY, fresh);
    return fresh;
  } catch {
    return 'guest_fallback_client';
  }
}

export function loadLocalGuestQuota(isLoggedIn = false): GuestQuotaInfo {
  let queriedCodes: string[] = [];
  try {
    const raw = localStorage.getItem(GUEST_QUOTA_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { queriedCodes?: unknown };
      if (Array.isArray(parsed?.queriedCodes)) {
        queriedCodes = Array.from(
          new Set(
            parsed.queriedCodes.filter(
              (c): c is string => typeof c === 'string' && /^\d{6}$/.test(c),
            ),
          ),
        );
      }
    }
  } catch {
    // Ignore storage read errors
  }

  const used = queriedCodes.length;
  return {
    limit: GUEST_QUERY_LIMIT,
    used,
    remaining: isLoggedIn ? GUEST_QUERY_LIMIT : Math.max(0, GUEST_QUERY_LIMIT - used),
    queriedCodes,
    isUnlimited: isLoggedIn,
    neverResets: true,
  };
}

export function mergeAndSaveGuestQuota(
  incoming: GuestQuotaInfo | null | undefined,
  isLoggedIn: boolean,
): GuestQuotaInfo {
  const local = loadLocalGuestQuota(isLoggedIn);
  const mergedSet = new Set<string>(local.queriedCodes);
  if (incoming && Array.isArray(incoming.queriedCodes)) {
    for (const c of incoming.queriedCodes) {
      if (/^\d{6}$/.test(c)) {
        mergedSet.add(c);
      }
    }
  }
  const mergedCodes = Array.from(mergedSet);
  try {
    localStorage.setItem(
      GUEST_QUOTA_STORAGE_KEY,
      JSON.stringify({
        queriedCodes: mergedCodes,
        neverResets: true,
      }),
    );
  } catch {
    // Ignore storage quota errors
  }

  const used = mergedCodes.length;
  return {
    limit: GUEST_QUERY_LIMIT,
    used,
    remaining: isLoggedIn ? GUEST_QUERY_LIMIT : Math.max(0, GUEST_QUERY_LIMIT - used),
    queriedCodes: mergedCodes,
    isUnlimited: isLoggedIn,
    neverResets: true,
  };
}

export async function fetchServerGuestQuota(isLoggedIn: boolean): Promise<GuestQuotaInfo> {
  try {
    const clientId = getOrCreateGuestClientId();
    const res = await fetch('/api/guest-quota', {
      headers: {
        'x-guest-client-id': clientId,
      },
      credentials: 'include',
    });
    if (!res.ok) {
      return loadLocalGuestQuota(isLoggedIn);
    }
    const data = (await res.json()) as GuestQuotaInfo;
    return mergeAndSaveGuestQuota(data, isLoggedIn || Boolean(data.isUnlimited));
  } catch {
    return loadLocalGuestQuota(isLoggedIn);
  }
}
