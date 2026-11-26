import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { GuestQuotaInfo } from '../shared/wechatTypes.ts';

export const GUEST_QUERY_LIMIT = 3;
export const DEFAULT_SHOWCASE_CODE = '601088';

const RUNTIME_DIR = path.resolve(process.cwd(), '.runtime');
const QUOTA_FILE_NAME = 'guest-quota.json';

interface StoredGuestQuotaEntry {
  queriedCodes: string[];
  createdAt: string;
  updatedAt: string;
}

type StoredGuestQuotaMap = Record<string, StoredGuestQuotaEntry>;

const memoryQuotaMap = new Map<string, StoredGuestQuotaEntry>();
let storeLoaded = false;

function getQuotaFilePath(): string {
  const resolved = path.resolve(RUNTIME_DIR, QUOTA_FILE_NAME);
  if (!resolved.startsWith(RUNTIME_DIR + path.sep)) {
    throw new Error('Invalid guest quota file path');
  }
  return resolved;
}

function ensureStoreLoaded(): void {
  if (storeLoaded) return;
  storeLoaded = true;
  try {
    const filePath = getQuotaFilePath();
    if (!fs.existsSync(filePath)) return;
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as StoredGuestQuotaMap;
    if (!parsed || typeof parsed !== 'object') return;
    for (const [key, entry] of Object.entries(parsed)) {
      if (
        entry &&
        typeof entry === 'object' &&
        Array.isArray(entry.queriedCodes)
      ) {
        const cleanCodes = Array.from(
          new Set(
            entry.queriedCodes.filter(
              (c): c is string => typeof c === 'string' && /^\d{6}$/.test(c),
            ),
          ),
        );
        memoryQuotaMap.set(key, {
          queriedCodes: cleanCodes,
          createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : new Date().toISOString(),
          updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : new Date().toISOString(),
        });
      }
    }
  } catch {
    // Ignore corrupt cache file
  }
}

function persistStore(): void {
  try {
    if (!fs.existsSync(RUNTIME_DIR)) {
      fs.mkdirSync(RUNTIME_DIR, { recursive: true });
    }
    const obj: StoredGuestQuotaMap = {};
    for (const [key, entry] of memoryQuotaMap.entries()) {
      obj[key] = entry;
    }
    const filePath = getQuotaFilePath();
    fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), { encoding: 'utf8', mode: 0o600 });
  } catch {
    // Best effort persistence
  }
}

export function sanitizeGuestKey(raw: string | undefined | null): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (/^[a-zA-Z0-9_-]{12,64}$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

function resolveMergedRecord(keys: {
  cookieId?: string | null;
  clientId?: string | null;
}): {
  primaryGuestId: string;
  allKeys: string[];
  queriedCodes: string[];
} {
  ensureStoreLoaded();
  const cookieId = sanitizeGuestKey(keys.cookieId);
  const clientId = sanitizeGuestKey(keys.clientId);

  const primaryGuestId = cookieId || clientId || crypto.randomBytes(16).toString('hex');
  const allKeys = Array.from(new Set([primaryGuestId, cookieId, clientId].filter((k): k is string => Boolean(k))));

  // Merge queriedCodes across any matching keys (no date filtering, permanent lifetime accumulation)
  const mergedSet = new Set<string>();
  for (const k of allKeys) {
    const rec = memoryQuotaMap.get(k);
    if (rec) {
      for (const code of rec.queriedCodes) {
        mergedSet.add(code);
      }
    }
  }

  return {
    primaryGuestId,
    allKeys,
    queriedCodes: Array.from(mergedSet),
  };
}

function saveMergedCodes(allKeys: string[], queriedCodes: string[]): void {
  const nowIso = new Date().toISOString();
  for (const key of allKeys) {
    const prev = memoryQuotaMap.get(key);
    memoryQuotaMap.set(key, {
      queriedCodes: [...queriedCodes],
      createdAt: prev?.createdAt ?? nowIso,
      updatedAt: nowIso,
    });
  }
  persistStore();
}

function buildQuotaInfo(queriedCodes: string[], isLoggedIn: boolean): GuestQuotaInfo {
  const used = queriedCodes.length;
  return {
    limit: GUEST_QUERY_LIMIT,
    used,
    remaining: isLoggedIn ? GUEST_QUERY_LIMIT : Math.max(0, GUEST_QUERY_LIMIT - used),
    queriedCodes: [...queriedCodes],
    isUnlimited: isLoggedIn,
    neverResets: true,
  };
}

export function getGuestQuotaStatus(
  keys: { cookieId?: string | null; clientId?: string | null },
  isLoggedIn: boolean,
): { guestId: string; quota: GuestQuotaInfo } {
  const { primaryGuestId, allKeys, queriedCodes } = resolveMergedRecord(keys);
  // Ensure linked keys stay synchronized if one key had prior records
  if (queriedCodes.length > 0) {
    const needsSync = allKeys.some((k) => (memoryQuotaMap.get(k)?.queriedCodes.length ?? 0) < queriedCodes.length);
    if (needsSync) {
      saveMergedCodes(allKeys, queriedCodes);
    }
  }
  return {
    guestId: primaryGuestId,
    quota: buildQuotaInfo(queriedCodes, isLoggedIn),
  };
}

export function checkAndConsumeGuestQuota(
  keys: { cookieId?: string | null; clientId?: string | null },
  stockCode: string,
  isLoggedIn: boolean,
): { allowed: boolean; guestId: string; quota: GuestQuotaInfo } {
  const { primaryGuestId, allKeys, queriedCodes } = resolveMergedRecord(keys);

  if (isLoggedIn) {
    return {
      allowed: true,
      guestId: primaryGuestId,
      quota: buildQuotaInfo(queriedCodes, true),
    };
  }

  if (queriedCodes.includes(stockCode)) {
    return {
      allowed: true,
      guestId: primaryGuestId,
      quota: buildQuotaInfo(queriedCodes, false),
    };
  }

  if (queriedCodes.length >= GUEST_QUERY_LIMIT) {
    return {
      allowed: false,
      guestId: primaryGuestId,
      quota: buildQuotaInfo(queriedCodes, false),
    };
  }

  const nextCodes = [...queriedCodes, stockCode];
  saveMergedCodes(allKeys, nextCodes);

  return {
    allowed: true,
    guestId: primaryGuestId,
    quota: buildQuotaInfo(nextCodes, false),
  };
}
