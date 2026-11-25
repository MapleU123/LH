export type PairingStatus = 'pending' | 'paired' | 'expired' | 'not_found';

export interface WechatMpPublicInfo {
  name: string;
  wechatId: string;
  originalId: string;
  qrUrl: string;
}

export interface UserSession {
  isLoggedIn: boolean;
  loginMethod: 'wechat';
  userId: string;
  name: string;
  avatar: string;
  wechatNickname: string;
  openid: string;
  role: 'member' | 'admin';
  pairedAt: number;
  token?: string;
}

export interface WechatCodeResponse {
  code: string;
  expiresAt: number;
  ttlSeconds: number;
  mpInfo: WechatMpPublicInfo;
}

export interface WechatCheckStatusResponse {
  status: PairingStatus;
  expiresAt?: number;
  session?: UserSession;
}

export interface WechatMpConfigMasked {
  appId: string;
  hasAppSecret: boolean;
  appSecretMasked: string;
  hasToken: boolean;
  tokenMasked: string;
  hasAesKey: boolean;
  aesKeyMasked: string;
  originalId: string;
  mpName: string;
  wechatId: string;
  qrUrl: string;
  alertTemplateId: string;
  subTemplateStockId: string;
  webhookPath: string;
  envFallbacks: {
    appId: boolean;
    appSecret: boolean;
    token: boolean;
    aesKey: boolean;
    originalId: boolean;
  };
  updatedAt: string | null;
}

export interface WechatMpConfigUpdatePayload {
  appId?: string;
  appSecret?: string;
  token?: string;
  aesKey?: string;
  originalId?: string;
  mpName?: string;
  wechatId?: string;
  qrUrl?: string;
  alertTemplateId?: string;
  subTemplateStockId?: string;
}

export interface WechatSignatureTestResult {
  ok: boolean;
  hasToken: boolean;
  timestamp: string;
  nonce: string;
  signature: string;
  verified: boolean;
  message: string;
}

export interface WebhookHitLog {
  id: string;
  method: 'GET' | 'POST';
  timestamp: string;
  durationMs: number;
  encrypted: boolean;
  outcome: string;
  detail: string;
}

export interface VisitorTrailLog {
  id: string;
  maskedOpenid: string;
  nickname: string;
  action: string;
  timestamp: string;
}

export interface WechatDiagnosticResponse {
  configured: boolean;
  appIdConfigured: boolean;
  appIdMasked: string;
  appSecretConfigured: boolean;
  appSecretMasked: string;
  tokenConfigured: boolean;
  aesKeyConfigured: boolean;
  originalId: string;
  egressIp: string;
  egressIpSource: string;
  recentWebhookHits: WebhookHitLog[];
  recentVisitors: VisitorTrailLog[];
}

export interface WechatImageUploadTestResponse {
  ok: boolean;
  step: 'config' | 'access_token' | 'media_upload' | 'completed';
  errcode?: number;
  errmsg?: string;
  mediaId?: string;
  hint: string;
  durationMs: number;
}
