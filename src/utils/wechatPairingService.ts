import type {
  UserSession,
  WechatCheckStatusResponse,
  WechatCodeResponse,
  WechatDiagnosticResponse,
  WechatImageUploadTestResponse,
  WechatMpConfigMasked,
  WechatMpConfigUpdatePayload,
  WechatSignatureTestResult,
} from '../shared/wechatTypes.ts';

const CUSTOM_MP_STORAGE_KEY = 'wx_mp_custom_profile_v1';

export interface CustomMpProfile {
  mpName: string;
  wechatId: string;
  qrUrl: string;
}

export function isSafeClientQrUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/')) return true;
  if (/^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,/i.test(trimmed)) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function loadCustomMpProfile(): CustomMpProfile | null {
  try {
    const raw = localStorage.getItem(CUSTOM_MP_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CustomMpProfile>;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      mpName: typeof parsed.mpName === 'string' ? parsed.mpName.trim() : '',
      wechatId: typeof parsed.wechatId === 'string' ? parsed.wechatId.trim() : '',
      qrUrl: typeof parsed.qrUrl === 'string' && isSafeClientQrUrl(parsed.qrUrl) ? parsed.qrUrl.trim() : '',
    };
  } catch {
    return null;
  }
}

export function saveCustomMpProfile(profile: CustomMpProfile): void {
  try {
    localStorage.setItem(
      CUSTOM_MP_STORAGE_KEY,
      JSON.stringify({
        mpName: profile.mpName.trim(),
        wechatId: profile.wechatId.trim(),
        qrUrl: isSafeClientQrUrl(profile.qrUrl) ? profile.qrUrl.trim() : '',
      }),
    );
  } catch {
    // Ignore storage quota errors
  }
}

export function resetCustomMpProfile(): void {
  try {
    localStorage.removeItem(CUSTOM_MP_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

export function formatCountdownMmSs(expiresAt: number | null, nowMs: number): string {
  if (!expiresAt) return '10:00';
  const remainingSec = Math.max(0, Math.floor((expiresAt - nowMs) / 1000));
  const mins = Math.floor(remainingSec / 60);
  const secs = remainingSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export async function fetchWechatPairingCode(): Promise<WechatCodeResponse> {
  const res = await fetch('/api/wechat/code', { credentials: 'include' });
  const data = (await res.json()) as WechatCodeResponse & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || '获取配对码失败');
  }
  return data;
}

export async function checkWechatPairingStatus(code: string): Promise<WechatCheckStatusResponse> {
  const res = await fetch(`/api/wechat/check-status?code=${encodeURIComponent(code)}`, {
    credentials: 'include',
  });
  const data = (await res.json()) as WechatCheckStatusResponse & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || '校验配对状态失败');
  }
  return data;
}

export async function confirmWechatPair(payload: {
  code: string;
  nickname?: string;
  avatar?: string;
  openid?: string;
}): Promise<UserSession> {
  const res = await fetch('/api/wechat/pair', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as { ok?: boolean; session?: UserSession; error?: string };
  if (!res.ok || !data.session) {
    throw new Error(data.error || '配对确认失败');
  }
  return data.session;
}

export async function fetchCurrentSession(token?: string): Promise<UserSession | null> {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch('/api/auth/me', {
    headers,
    credentials: 'include',
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { isLoggedIn?: boolean; session?: UserSession | null };
  return data.isLoggedIn && data.session ? data.session : null;
}

export async function logoutSession(token?: string): Promise<void> {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  await fetch('/api/auth/logout', {
    method: 'POST',
    headers,
    credentials: 'include',
  });
}

function buildAdminHeaders(adminPasscode?: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (adminPasscode && adminPasscode.trim()) {
    headers['x-admin-passcode'] = adminPasscode.trim();
  }
  return headers;
}

export async function fetchWechatMpConfig(
  adminPasscode?: string,
): Promise<WechatMpConfigMasked & { adminPasscodeRequired?: boolean }> {
  const res = await fetch('/api/wechat/mp-config', {
    headers: buildAdminHeaders(adminPasscode),
    credentials: 'include',
  });
  const data = (await res.json()) as WechatMpConfigMasked & {
    adminPasscodeRequired?: boolean;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || '读取公众号配置失败');
  }
  return data;
}

export async function saveWechatMpConfig(
  payload: WechatMpConfigUpdatePayload,
  adminPasscode?: string,
): Promise<WechatMpConfigMasked> {
  const res = await fetch('/api/wechat/mp-config', {
    method: 'POST',
    headers: buildAdminHeaders(adminPasscode),
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as { ok?: boolean; config?: WechatMpConfigMasked; error?: string };
  if (!res.ok || !data.config) {
    throw new Error(data.error || '保存公众号配置失败');
  }
  return data.config;
}

export async function testWechatSignatureApi(
  token?: string,
  adminPasscode?: string,
): Promise<WechatSignatureTestResult> {
  const res = await fetch('/api/wechat/test-signature', {
    method: 'POST',
    headers: buildAdminHeaders(adminPasscode),
    credentials: 'include',
    body: JSON.stringify({ token }),
  });
  const data = (await res.json()) as WechatSignatureTestResult & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || '签名自检失败');
  }
  return data;
}

export async function fetchWechatDiagnosticApi(
  adminPasscode?: string,
): Promise<WechatDiagnosticResponse> {
  const res = await fetch('/api/wechat/image-reply-diagnostic', {
    headers: buildAdminHeaders(adminPasscode),
    credentials: 'include',
  });
  const data = (await res.json()) as WechatDiagnosticResponse & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || '获取连通诊断信息失败');
  }
  return data;
}

export async function testWechatImageUploadApi(
  adminPasscode?: string,
): Promise<WechatImageUploadTestResponse> {
  const res = await fetch('/api/wechat/test-image-upload', {
    method: 'POST',
    headers: buildAdminHeaders(adminPasscode),
    credentials: 'include',
  });
  const data = (await res.json()) as WechatImageUploadTestResponse & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || '素材上传实测请求失败');
  }
  return data;
}
