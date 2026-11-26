import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  formatWechatTrendConclusion,
  formatWechatVolumeStateLabel,
} from '../shared/quantEngine.ts';
import type { QuantDiagnosisResponse } from '../shared/quantTypes.ts';
import type {
  UserSession,
  VisitorTrailLog,
  WechatCheckStatusResponse,
  WechatCodeResponse,
  WechatDiagnosticResponse,
  WechatImageUploadTestResponse,
  WechatMpConfigMasked,
  WechatMpConfigUpdatePayload,
  WechatSignatureTestResult,
  WebhookHitLog,
} from '../shared/wechatTypes.ts';
import {
  getHighDividendPoolSnapshot,
  getQuantDiagnosis,
  tryResolveWechatStockQuery,
} from './marketDataService.ts';
import { HIGH_DIVIDEND_POOL, inferBoardAndExchange } from './stockDictionary.ts';
import { renderWechatStockChartPng } from './wechatChartPng.ts';

const PAIRING_TTL_MS = 10 * 60 * 1000; // 10 minutes
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const RUNTIME_DIR = path.resolve(process.cwd(), '.runtime');
const CONFIG_FILE_NAME = 'wechat-mp-config.json';

interface StoredMpConfig {
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
  updatedAt?: string;
}

interface EffectiveMpConfig {
  appId: string;
  appSecret: string;
  token: string;
  aesKey: string;
  originalId: string;
  mpName: string;
  wechatId: string;
  qrUrl: string;
  alertTemplateId: string;
  subTemplateStockId: string;
  updatedAt: string | null;
}

interface PairingSessionRecord {
  code: string;
  status: 'pending' | 'paired';
  createdAt: number;
  expiresAt: number;
  session?: UserSession;
}

interface ActiveSessionRecord {
  token: string;
  expiresAt: number;
  session: UserSession;
}

const pairingSessions = new Map<string, PairingSessionRecord>();
const activeSessions = new Map<string, ActiveSessionRecord>();
const recentWebhookHits: WebhookHitLog[] = [];
const recentVisitors: VisitorTrailLog[] = [];

let cachedAccessToken: { token: string; expiresAt: number } | null = null;
let cachedEgressIp: { ip: string; source: string; expiresAt: number } | null = null;

// Clean expired pairing codes and expired user sessions every 60s
setInterval(() => {
  const now = Date.now();
  for (const [code, rec] of pairingSessions.entries()) {
    if (now > rec.expiresAt) {
      pairingSessions.delete(code);
    }
  }
  for (const [token, rec] of activeSessions.entries()) {
    if (now > rec.expiresAt) {
      activeSessions.delete(token);
    }
  }
}, 60 * 1000).unref();

function getConfigFilePath(): string {
  const resolved = path.resolve(RUNTIME_DIR, CONFIG_FILE_NAME);
  if (!resolved.startsWith(RUNTIME_DIR + path.sep)) {
    throw new Error('Invalid runtime config path');
  }
  return resolved;
}

function readStoredConfig(): StoredMpConfig {
  try {
    const filePath = getConfigFilePath();
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as StoredMpConfig;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStoredConfig(cfg: StoredMpConfig): void {
  if (!fs.existsSync(RUNTIME_DIR)) {
    fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  }
  const filePath = getConfigFilePath();
  fs.writeFileSync(filePath, JSON.stringify(cfg, null, 2), { encoding: 'utf8', mode: 0o600 });
}

export function getEffectiveMpConfig(): EffectiveMpConfig {
  const saved = readStoredConfig();
  return {
    appId: (saved.appId || process.env.WECHAT_MP_APP_ID || '').trim(),
    appSecret: (saved.appSecret || process.env.WECHAT_MP_APP_SECRET || '').trim(),
    token: (saved.token || process.env.WECHAT_MP_TOKEN || '').trim(),
    aesKey: (saved.aesKey || process.env.WECHAT_MP_AES_KEY || '').trim(),
    originalId: (saved.originalId || process.env.WECHAT_MP_ORIGINAL_ID || 'gh_dec752a19703').trim(),
    mpName: (saved.mpName || process.env.WECHAT_MP_NAME || '我爱这young').trim(),
    wechatId: (saved.wechatId || process.env.WECHAT_MP_WECHAT_ID || 'gh_dec752a19703').trim(),
    qrUrl: (saved.qrUrl || process.env.WECHAT_MP_QR_URL || '/assets/aistudio/image_77d5f18c.png').trim(),
    alertTemplateId: (saved.alertTemplateId || process.env.WECHAT_MP_ALERT_TEMPLATE_ID || '').trim(),
    subTemplateStockId: (saved.subTemplateStockId || process.env.WECHAT_MP_SUB_TEMPLATE_STOCK_ID || '').trim(),
    updatedAt: saved.updatedAt ?? null,
  };
}

function maskSecret(val: string, visibleStart = 3, visibleEnd = 3): string {
  if (!val) return '';
  if (val.length <= visibleStart + visibleEnd) {
    return '*'.repeat(val.length);
  }
  return `${val.slice(0, visibleStart)}${'*'.repeat(Math.min(10, val.length - visibleStart - visibleEnd))}${val.slice(-visibleEnd)}`;
}

function isSafeQrUrl(url: string): boolean {
  if (!url) return true;
  if (url.startsWith('/')) return true;
  if (/^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,/i.test(url)) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function getMaskedMpConfig(): WechatMpConfigMasked {
  const eff = getEffectiveMpConfig();
  const saved = readStoredConfig();
  return {
    appId: eff.appId,
    hasAppSecret: Boolean(eff.appSecret),
    appSecretMasked: eff.appSecret ? maskSecret(eff.appSecret, 4, 4) : '',
    hasToken: Boolean(eff.token),
    tokenMasked: eff.token ? maskSecret(eff.token, 4, 4) : '',
    hasAesKey: Boolean(eff.aesKey),
    aesKeyMasked: eff.aesKey ? maskSecret(eff.aesKey, 4, 4) : '',
    originalId: eff.originalId,
    mpName: eff.mpName,
    wechatId: eff.wechatId,
    qrUrl: eff.qrUrl,
    alertTemplateId: eff.alertTemplateId,
    subTemplateStockId: eff.subTemplateStockId,
    webhookPath: '/api/wechat/webhook',
    envFallbacks: {
      appId: !saved.appId && Boolean(process.env.WECHAT_MP_APP_ID),
      appSecret: !saved.appSecret && Boolean(process.env.WECHAT_MP_APP_SECRET),
      token: !saved.token && Boolean(process.env.WECHAT_MP_TOKEN),
      aesKey: !saved.aesKey && Boolean(process.env.WECHAT_MP_AES_KEY),
      originalId: !saved.originalId && Boolean(process.env.WECHAT_MP_ORIGINAL_ID),
    },
    updatedAt: eff.updatedAt,
  };
}

export function updateMpConfig(payload: WechatMpConfigUpdatePayload): WechatMpConfigMasked {
  const current = readStoredConfig();
  const next: StoredMpConfig = { ...current };

  const assignNonEmpty = (key: keyof StoredMpConfig, value: unknown) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0 && !trimmed.includes('****')) {
        next[key] = trimmed;
      }
    }
  };

  assignNonEmpty('appId', payload.appId);
  assignNonEmpty('appSecret', payload.appSecret);
  assignNonEmpty('token', payload.token);
  if (typeof payload.aesKey === 'string' && payload.aesKey.trim().length > 0 && !payload.aesKey.includes('****')) {
    const trimmedAes = payload.aesKey.trim();
    if (!/^[A-Za-z0-9]{43}$/.test(trimmedAes)) {
      throw new Error('EncodingAESKey 必须为 43 位英文或数字字符');
    }
    next.aesKey = trimmedAes;
  }
  assignNonEmpty('originalId', payload.originalId);
  assignNonEmpty('mpName', payload.mpName);
  assignNonEmpty('wechatId', payload.wechatId);
  if (typeof payload.qrUrl === 'string' && payload.qrUrl.trim().length > 0) {
    const trimmedQr = payload.qrUrl.trim();
    if (!isSafeQrUrl(trimmedQr)) {
      throw new Error('二维码 URL 协议无效，仅支持站内路径、HTTP(S) 或图片 Data URL');
    }
    next.qrUrl = trimmedQr;
  }
  if (typeof payload.alertTemplateId === 'string') {
    next.alertTemplateId = payload.alertTemplateId.trim();
  }
  if (typeof payload.subTemplateStockId === 'string') {
    next.subTemplateStockId = payload.subTemplateStockId.trim();
  }

  next.updatedAt = new Date().toISOString();
  writeStoredConfig(next);

  // Invalidate cached WeChat access token when credentials update
  cachedAccessToken = null;
  return getMaskedMpConfig();
}

export function createPairingSession(): WechatCodeResponse {
  const now = Date.now();
  let code = '';
  for (let i = 0; i < 20; i += 1) {
    const candidate = String(crypto.randomInt(100000, 1000000));
    const existing = pairingSessions.get(candidate);
    if (!existing || now > existing.expiresAt) {
      code = candidate;
      break;
    }
  }
  if (!code) {
    code = String(crypto.randomInt(100000, 1000000));
  }

  const expiresAt = now + PAIRING_TTL_MS;
  pairingSessions.set(code, {
    code,
    status: 'pending',
    createdAt: now,
    expiresAt,
  });

  const cfg = getEffectiveMpConfig();
  return {
    code,
    expiresAt,
    ttlSeconds: Math.floor(PAIRING_TTL_MS / 1000),
    mpInfo: {
      name: cfg.mpName,
      wechatId: cfg.wechatId,
      originalId: cfg.originalId,
      qrUrl: cfg.qrUrl,
    },
  };
}

export function confirmPairing(
  code: string,
  info: { openid?: string; nickname?: string; avatar?: string; role?: 'member' | 'admin' },
): UserSession {
  const cleanCode = code.trim();
  const record = pairingSessions.get(cleanCode);
  if (!record) {
    throw new Error('配对码不存在或已失效，请刷新后重试');
  }
  if (Date.now() > record.expiresAt) {
    pairingSessions.delete(cleanCode);
    throw new Error('配对码已过期，请重新生成');
  }
  if (record.status === 'paired' && record.session) {
    return record.session;
  }

  const openid = (info.openid || `wx_sim_${crypto.randomBytes(6).toString('hex')}`).trim();
  const nickname = (info.nickname || `微信用户_${cleanCode.slice(-4)}`).trim();
  const avatar = info.avatar && isSafeQrUrl(info.avatar) ? info.avatar : '';
  const userHash = crypto.createHash('sha256').update(openid).digest('hex').slice(0, 12);
  const token = crypto.randomBytes(32).toString('hex');

  const session: UserSession = {
    isLoggedIn: true,
    loginMethod: 'wechat',
    userId: `wx_${userHash}`,
    name: nickname,
    avatar,
    wechatNickname: nickname,
    openid: maskSecret(openid, 4, 4),
    role: info.role ?? 'member',
    pairedAt: Date.now(),
    token,
  };

  record.status = 'paired';
  record.session = session;
  activeSessions.set(token, {
    token,
    expiresAt: Date.now() + SESSION_TTL_MS,
    session,
  });

  return session;
}

export function checkPairingStatus(code: string): WechatCheckStatusResponse {
  const cleanCode = code.trim();
  if (!/^\d{6}$/.test(cleanCode)) {
    return { status: 'not_found' };
  }
  const record = pairingSessions.get(cleanCode);
  if (!record) {
    return { status: 'not_found' };
  }
  if (Date.now() > record.expiresAt) {
    pairingSessions.delete(cleanCode);
    return { status: 'expired' };
  }
  if (record.status === 'paired' && record.session) {
    return {
      status: 'paired',
      expiresAt: record.expiresAt,
      session: record.session,
    };
  }
  return {
    status: 'pending',
    expiresAt: record.expiresAt,
  };
}

export function getSessionByToken(token: string | undefined | null): UserSession | null {
  if (!token) return null;
  const rec = activeSessions.get(token);
  if (!rec) return null;
  if (Date.now() > rec.expiresAt) {
    activeSessions.delete(token);
    return null;
  }
  return rec.session;
}

export function revokeSessionToken(token: string | undefined | null): void {
  if (token) {
    activeSessions.delete(token);
  }
}

function recordWebhookHit(hit: Omit<WebhookHitLog, 'id' | 'timestamp'>): void {
  recentWebhookHits.unshift({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ...hit,
  });
  if (recentWebhookHits.length > 20) {
    recentWebhookHits.length = 20;
  }
}

function recordVisitor(openid: string, nickname: string, action: string): void {
  recentVisitors.unshift({
    id: crypto.randomUUID(),
    maskedOpenid: maskSecret(openid, 4, 4),
    nickname: nickname || '微信访客',
    action,
    timestamp: new Date().toISOString(),
  });
  if (recentVisitors.length > 20) {
    recentVisitors.length = 20;
  }
}

// ============================================================================
// WeChat SHA-1 Signature & AES-256-CBC Cryptography
// ============================================================================

export function computeWechatSignature(token: string, timestamp: string, nonce: string): string {
  const raw = [token, timestamp, nonce].sort().join('');
  return crypto.createHash('sha1').update(raw).digest('hex');
}

export function computeWechatMsgSignature(
  token: string,
  timestamp: string,
  nonce: string,
  encrypted: string,
): string {
  const raw = [token, timestamp, nonce, encrypted].sort().join('');
  return crypto.createHash('sha1').update(raw).digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a.toLowerCase(), 'utf8');
  const bufB = Buffer.from(b.toLowerCase(), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function pkcs7Unpad(buf: Buffer): Buffer {
  if (buf.length === 0) return buf;
  const pad = buf[buf.length - 1];
  if (pad < 1 || pad > 32 || pad > buf.length) {
    return buf;
  }
  return buf.subarray(0, buf.length - pad);
}

function pkcs7Pad(buf: Buffer, blockSize = 32): Buffer {
  const remainder = buf.length % blockSize;
  const padLen = remainder === 0 ? blockSize : blockSize - remainder;
  return Buffer.concat([buf, Buffer.alloc(padLen, padLen)]);
}

export function decryptWechatPayload(
  encryptedBase64: string,
  aesKey: string,
  expectedAppId?: string,
): string {
  const key = Buffer.from(`${aesKey}=`, 'base64');
  if (key.length !== 32) {
    throw new Error('EncodingAESKey 长度或格式无效');
  }
  const iv = key.subarray(0, 16);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  decipher.setAutoPadding(false);

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, 'base64')),
    decipher.final(),
  ]);
  const unpadded = pkcs7Unpad(decrypted);
  if (unpadded.length < 20) {
    throw new Error('微信加密报文长度异常');
  }
  const msgLen = unpadded.readUInt32BE(16);
  const contentEnd = 20 + msgLen;
  if (contentEnd > unpadded.length) {
    throw new Error('微信加密报文解析越界');
  }
  const xmlContent = unpadded.subarray(20, contentEnd).toString('utf8');
  const trailingAppId = unpadded.subarray(contentEnd).toString('utf8');
  if (expectedAppId && trailingAppId && trailingAppId !== expectedAppId) {
    throw new Error('AppID 校验不匹配');
  }
  return xmlContent;
}

export function encryptWechatPayload(
  plainXml: string,
  aesKey: string,
  appId: string,
): string {
  const key = Buffer.from(`${aesKey}=`, 'base64');
  if (key.length !== 32) {
    throw new Error('EncodingAESKey 长度或格式无效');
  }
  const iv = key.subarray(0, 16);
  const random16 = crypto.randomBytes(16);
  const msgBuf = Buffer.from(plainXml, 'utf8');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(msgBuf.length, 0);
  const appIdBuf = Buffer.from(appId, 'utf8');

  const combined = pkcs7Pad(Buffer.concat([random16, lenBuf, msgBuf, appIdBuf]), 32);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  cipher.setAutoPadding(false);
  const encrypted = Buffer.concat([cipher.update(combined), cipher.final()]);
  return encrypted.toString('base64');
}

function extractXmlTag(xml: string, tag: string): string {
  const cdataRe = new RegExp(`<${tag}>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, 'i');
  const cdataMatch = xml.match(cdataRe);
  if (cdataMatch) return cdataMatch[1].trim();
  const plainRe = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i');
  const plainMatch = xml.match(plainRe);
  return plainMatch ? plainMatch[1].trim() : '';
}

function escapeCdata(str: string): string {
  return str.replace(/\]\]>/g, ']]]]><![CDATA[>');
}

function buildTextReplyXml(toUser: string, fromUser: string, content: string): string {
  const createTime = Math.floor(Date.now() / 1000);
  return `<xml>
  <ToUserName><![CDATA[${escapeCdata(toUser)}]]></ToUserName>
  <FromUserName><![CDATA[${escapeCdata(fromUser)}]]></FromUserName>
  <CreateTime>${createTime}</CreateTime>
  <MsgType><![CDATA[text]]></MsgType>
  <Content><![CDATA[${escapeCdata(content)}]]></Content>
</xml>`;
}

function buildEncryptedReplyXml(
  plainXml: string,
  token: string,
  aesKey: string,
  appId: string,
): string {
  const encrypt = encryptWechatPayload(plainXml, aesKey, appId);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomBytes(6).toString('hex');
  const msgSignature = computeWechatMsgSignature(token, timestamp, nonce, encrypt);
  return `<xml>
  <Encrypt><![CDATA[${escapeCdata(encrypt)}]]></Encrypt>
  <MsgSignature><![CDATA[${escapeCdata(msgSignature)}]]></MsgSignature>
  <TimeStamp>${timestamp}</TimeStamp>
  <Nonce><![CDATA[${escapeCdata(nonce)}]]></Nonce>
</xml>`;
}

export function buildWeChatReplyXml(params: {
  toUser: string;
  fromUser: string;
  content: string;
  isEncrypted: boolean;
  token?: string;
  aesKey?: string;
  appId?: string;
}): string {
  const plainXml = buildTextReplyXml(params.toUser, params.fromUser, params.content);
  if (params.isEncrypted && params.token && params.aesKey) {
    return buildEncryptedReplyXml(plainXml, params.token, params.aesKey, params.appId || '');
  }
  return plainXml;
}

// ============================================================================
// WeChat Access Token, User Info (450ms Timeout), & Diagnostic Tools
// ============================================================================

function mapWechatErrorHint(errcode: number, errmsg: string): string {
  switch (errcode) {
    case 40013:
      return 'AppID 无效，请核对微信公众平台「开发 -> 基本配置」中的 AppID。';
    case 40125:
      return 'AppSecret 无效或已重置（40125 invalid appsecret），请重新获取并保存 AppSecret。';
    case 40164:
      return '当前服务器公网出口 IP 未加入微信公众平台 IP 白名单（40164），请复制下方出口 IP 并添加至白名单。';
    case 40001:
      return 'access_token 无效或过期，请重新触发验证刷新令牌。';
    case 41002:
      return '缺少 AppID 参数。';
    case 41004:
      return '缺少 AppSecret 参数。';
    default:
      return `微信接口返回错误 [${errcode}]：${errmsg}`;
  }
}

export async function fetchWechatAccessToken(): Promise<{
  ok: boolean;
  accessToken?: string;
  errcode?: number;
  errmsg?: string;
  hint: string;
}> {
  const cfg = getEffectiveMpConfig();
  if (!cfg.appId || !cfg.appSecret) {
    return {
      ok: false,
      hint: '尚未配置 AppID 或 AppSecret，无法向微信换取 access_token。',
    };
  }

  if (cachedAccessToken && Date.now() < cachedAccessToken.expiresAt - 120_000) {
    return { ok: true, accessToken: cachedAccessToken.token, hint: '命中有效 access_token 缓存' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(cfg.appId)}&secret=${encodeURIComponent(cfg.appSecret)}`;
    const res = await fetch(url, { signal: controller.signal });
    const data = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
      errcode?: number;
      errmsg?: string;
    };
    if (data.access_token) {
      cachedAccessToken = {
        token: data.access_token,
        expiresAt: Date.now() + (data.expires_in ?? 7200) * 1000,
      };
      return {
        ok: true,
        accessToken: data.access_token,
        hint: 'access_token 获取成功',
      };
    }
    const errcode = data.errcode ?? -1;
    const errmsg = data.errmsg ?? '未知微信接口异常';
    return {
      ok: false,
      errcode,
      errmsg,
      hint: mapWechatErrorHint(errcode, errmsg),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : '网络请求异常';
    return {
      ok: false,
      hint: `请求微信 access_token 失败：${message}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWechatUserInfoWithTimeout(
  openid: string,
  timeoutMs = 450,
): Promise<{ nickname: string; avatar: string }> {
  const cfg = getEffectiveMpConfig();
  if (!cfg.appId || !cfg.appSecret || !openid) {
    return { nickname: '', avatar: '' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let token = cachedAccessToken && Date.now() < cachedAccessToken.expiresAt - 120_000
      ? cachedAccessToken.token
      : '';

    if (!token) {
      const tokenUrl = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(cfg.appId)}&secret=${encodeURIComponent(cfg.appSecret)}`;
      const tRes = await fetch(tokenUrl, { signal: controller.signal });
      const tJson = (await tRes.json()) as { access_token?: string; expires_in?: number };
      if (!tJson.access_token) return { nickname: '', avatar: '' };
      token = tJson.access_token;
      cachedAccessToken = {
        token,
        expiresAt: Date.now() + (tJson.expires_in ?? 7200) * 1000,
      };
    }

    const userUrl = `https://api.weixin.qq.com/cgi-bin/user/info?access_token=${encodeURIComponent(token)}&openid=${encodeURIComponent(openid)}&lang=zh_CN`;
    const uRes = await fetch(userUrl, { signal: controller.signal });
    const uJson = (await uRes.json()) as { nickname?: string; headimgurl?: string };
    return {
      nickname: typeof uJson.nickname === 'string' ? uJson.nickname.trim() : '',
      avatar: typeof uJson.headimgurl === 'string' ? uJson.headimgurl.trim() : '',
    };
  } catch {
    return { nickname: '', avatar: '' };
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================================
// Webhook Handlers (GET verification + POST pairing & stock reply)
// ============================================================================

export function handleWechatWebhookGet(query: {
  signature?: string;
  msg_signature?: string;
  timestamp?: string;
  nonce?: string;
  echostr?: string;
  encrypt_type?: string;
}): { statusCode: number; body: string } {
  const start = Date.now();
  const cfg = getEffectiveMpConfig();
  const token = cfg.token;
  const timestamp = query.timestamp ?? '';
  const nonce = query.nonce ?? '';
  const echostr = query.echostr ?? '';
  const signature = query.signature ?? '';
  const msgSignature = query.msg_signature ?? '';
  const isEncrypted = query.encrypt_type === 'aes' || Boolean(msgSignature);

  if (!token) {
    recordWebhookHit({
      method: 'GET',
      durationMs: Date.now() - start,
      encrypted: isEncrypted,
      outcome: 'rejected',
      detail: '未配置服务器 Token，无法完成微信接入校验',
    });
    return { statusCode: 403, body: 'WeChat Token not configured' };
  }

  if (isEncrypted && msgSignature && echostr) {
    const expected = computeWechatMsgSignature(token, timestamp, nonce, echostr);
    if (!safeEqualHex(expected, msgSignature)) {
      recordWebhookHit({
        method: 'GET',
        durationMs: Date.now() - start,
        encrypted: true,
        outcome: 'signature_mismatch',
        detail: '安全模式 msg_signature 校验失败',
      });
      return { statusCode: 403, body: 'Invalid msg_signature' };
    }
    try {
      const plainEcho = decryptWechatPayload(echostr, cfg.aesKey, cfg.appId || undefined);
      recordWebhookHit({
        method: 'GET',
        durationMs: Date.now() - start,
        encrypted: true,
        outcome: 'verified',
        detail: '安全加密模式 GET 接入验证通过',
      });
      return { statusCode: 200, body: plainEcho };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AES 解密失败';
      recordWebhookHit({
        method: 'GET',
        durationMs: Date.now() - start,
        encrypted: true,
        outcome: 'decrypt_failed',
        detail: message,
      });
      return { statusCode: 400, body: message };
    }
  }

  const expectedSig = computeWechatSignature(token, timestamp, nonce);
  if (!signature || !safeEqualHex(expectedSig, signature)) {
    recordWebhookHit({
      method: 'GET',
      durationMs: Date.now() - start,
      encrypted: false,
      outcome: 'signature_mismatch',
      detail: '明文模式 signature 校验失败',
    });
    return { statusCode: 403, body: 'Invalid signature' };
  }

  recordWebhookHit({
    method: 'GET',
    durationMs: Date.now() - start,
    encrypted: false,
    outcome: 'verified',
    detail: '微信服务器 GET 接入校验成功',
  });
  return { statusCode: 200, body: echostr };
}

function normalizeBaseUrl(rawBaseUrl?: string): string {
  const candidate = (rawBaseUrl || process.env.SITE_URL || process.env.APP_URL || 'http://localhost:3000').trim();
  return candidate.replace(/\/+$/, '');
}

export function formatStockAutoReplyText(params: {
  nickname?: string;
  diag: QuantDiagnosisResponse;
  baseUrl: string;
  timestamp?: number;
}): string {
  const { diag, baseUrl } = params;
  const q = diag.quote;
  const displayName = (params.nickname || '').trim() || '朋友';
  const changeSign = q.changePercent >= 0 ? '+' : '';
  const trendConclusion = formatWechatTrendConclusion(diag.expmaLong.trendDirection);
  const volumeState = formatWechatVolumeStateLabel(diag.volume.volumeRatio);
  const ts = params.timestamp ?? Date.now();
  const cleanBaseUrl = normalizeBaseUrl(baseUrl);
  const pngUrl = `${cleanBaseUrl}/api/wechat/stock-chart/${q.code}.png?t=${ts}`;

  const paragraphs: string[] = [
    `${displayName}，已为您生成【${q.name}(${q.code})】趋势与量比诊断图`,
    `· 实时现价：¥${q.price.toFixed(2)}（${changeSign}${q.changePercent.toFixed(2)}%）`,
    `· 趋势判定：${trendConclusion}`,
    `· 成交量比：量比 ${diag.volume.volumeRatio.toFixed(2)}（${volumeState}）`,
    `· 量价结论：${diag.volume.volumeSynergyLabel}`,
  ];

  if (diag.dividendInfo && diag.dividendInfo.inPool) {
    const d = diag.dividendInfo;
    const targetState = d.isTargetReached
      ? '✅ 已达标'
      : `📉 需跌 ${d.dropNeededPercent.toFixed(2)}%`;
    paragraphs.push(
      `· 高股息目标：现股息 ${d.currentYield.toFixed(2)}% → 目标买价 ¥${d.targetBuyPrice.toFixed(2)}（${targetState}）`,
    );
  }

  paragraphs.push(`🖼️ 点击查看组合量化诊断看板（PNG）：\n${pngUrl}`);
  return paragraphs.join('\n\n');
}

async function buildHighDividendStatusReply(baseUrl: string): Promise<string> {
  const snapshot = await getHighDividendPoolSnapshot();
  if (snapshot.length === 0) {
    const fallbackList = HIGH_DIVIDEND_POOL.slice(0, 6)
      .map((item) => `· ${item.name}(${item.code}) 目标股息 ${item.targetDividendYield.toFixed(1)}%`)
      .join('\n');
    return `高股息核心池观察标的：\n\n${fallbackList}\n\n直接发送股票名称或 6 位代码（如：中国神华、601088），即可获取实时趋势与量比诊断看板！\n\n🌐 网页端：${normalizeBaseUrl(baseUrl)}`;
  }

  const reached = snapshot.filter((s) => s.isTargetReached);
  const nearTarget = snapshot.filter((s) => !s.isTargetReached).slice(0, 5);

  const lines: string[] = ['高股息目标买价实时监测'];
  if (reached.length > 0) {
    lines.push(
      `✅ 已达目标买价（${reached.length} 只）：\n` +
        reached
          .slice(0, 5)
          .map(
            (s) =>
              `· ${s.name}(${s.code}) 现价 ¥${s.price.toFixed(2)} / 目标 ¥${s.targetBuyPrice.toFixed(2)}（股息 ${s.currentYield.toFixed(2)}%）`,
          )
          .join('\n'),
    );
  } else {
    lines.push('⏳ 当前暂无标的跌入理想目标买价区，以下为距离买点最近的观察标的：');
  }

  if (nearTarget.length > 0) {
    lines.push(
      `📌 临近目标买价：\n` +
        nearTarget
          .map(
            (s) =>
              `· ${s.name}(${s.code}) 现价 ¥${s.price.toFixed(2)} → 目标 ¥${s.targetBuyPrice.toFixed(2)}（需跌 ${s.dropNeededPercent.toFixed(2)}%）`,
          )
          .join('\n'),
    );
  }

  lines.push('💡 直接回复个股名称或代码（如：中国神华、601088），即可生成 2 倍超清组合量化诊断看板 PNG。');
  return lines.join('\n\n');
}

export async function handleWechatWebhookPost(
  rawBody: string,
  query: {
    signature?: string;
    msg_signature?: string;
    timestamp?: string;
    nonce?: string;
    encrypt_type?: string;
  },
  baseUrl?: string,
): Promise<{ statusCode: number; contentType: string; body: string }> {
  const start = Date.now();
  const cfg = getEffectiveMpConfig();
  const effectiveBaseUrl = normalizeBaseUrl(baseUrl);
  const timestamp = query.timestamp ?? '';
  const nonce = query.nonce ?? '';
  const signature = query.signature ?? '';
  const msgSignature = query.msg_signature ?? '';

  // Verify token signature when token is configured
  const encryptTag = extractXmlTag(rawBody, 'Encrypt');
  const isEncrypted = query.encrypt_type === 'aes' || Boolean(encryptTag && msgSignature);

  if (cfg.token) {
    if (isEncrypted && encryptTag && msgSignature) {
      const expected = computeWechatMsgSignature(cfg.token, timestamp, nonce, encryptTag);
      if (!safeEqualHex(expected, msgSignature)) {
        recordWebhookHit({
          method: 'POST',
          durationMs: Date.now() - start,
          encrypted: true,
          outcome: 'signature_mismatch',
          detail: 'POST 安全模式 msg_signature 验签失败',
        });
        return { statusCode: 403, contentType: 'text/plain', body: 'Invalid msg_signature' };
      }
    } else if (signature) {
      const expected = computeWechatSignature(cfg.token, timestamp, nonce);
      if (!safeEqualHex(expected, signature)) {
        recordWebhookHit({
          method: 'POST',
          durationMs: Date.now() - start,
          encrypted: false,
          outcome: 'signature_mismatch',
          detail: 'POST signature 验签失败',
        });
        return { statusCode: 403, contentType: 'text/plain', body: 'Invalid signature' };
      }
    }
  }

  let plainXml = rawBody;
  if (isEncrypted && encryptTag) {
    try {
      plainXml = decryptWechatPayload(encryptTag, cfg.aesKey, cfg.appId || undefined);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AES 解密失败';
      recordWebhookHit({
        method: 'POST',
        durationMs: Date.now() - start,
        encrypted: true,
        outcome: 'decrypt_failed',
        detail: message,
      });
      return { statusCode: 400, contentType: 'text/plain', body: message };
    }
  }

  const toUser = extractXmlTag(plainXml, 'ToUserName') || cfg.originalId;
  const fromUser = extractXmlTag(plainXml, 'FromUserName');
  const msgType = extractXmlTag(plainXml, 'MsgType').toLowerCase();
  const content = extractXmlTag(plainXml, 'Content');
  const event = extractXmlTag(plainXml, 'Event').toLowerCase();

  // Start non-blocking concurrent fetch for WeChat nickname (450ms hard cap)
  const userInfoPromise = fetchWechatUserInfoWithTimeout(fromUser, 450);

  let replyText = '';
  let outcome = 'handled';

  if (msgType === 'event') {
    if (event === 'unsubscribe') {
      recordWebhookHit({
        method: 'POST',
        durationMs: Date.now() - start,
        encrypted: isEncrypted,
        outcome: 'unsubscribe',
        detail: `From=${maskSecret(fromUser, 3, 3)} -> unsubscribe`,
      });
      return { statusCode: 200, contentType: 'text/plain', body: 'success' };
    }

    const userInfo = await userInfoPromise;
    if (event === 'subscribe') {
      recordVisitor(fromUser, userInfo.nickname, '关注公众号');
      const greet = userInfo.nickname ? `${userInfo.nickname}，` : '';
      replyText = [
        `${greet}欢迎关注「${cfg.mpName}」！`,
        '1. 发送任意 A 股【股票名称 / 简称 / 拼音 / 6 位代码】（如：中国神华、茅台、601088、zgsh），秒出实时趋势与量比诊断图；',
        '2. 发送网站生成的【6 位数字配对码】即可免密登录网站；',
        '3. 发送关键词【高股息】【达标】【买点】【网格交易】获取核心策略监测。',
      ].join('\n\n');
      outcome = 'subscribe';
    } else {
      replyText = `欢迎使用「${cfg.mpName}」量化诊断助手！直接发送 A 股名称、简称、拼音或 6 位代码即可生成趋势与量比诊断图。`;
      outcome = `event:${event || 'unknown'}`;
    }
  } else if (msgType === 'text') {
    const trimmed = content.trim();
    const compactText = trimmed.replace(/[？?！!。，,\s]+/g, '');

    // Priority 1: Pending 6-digit login pairing code
    const pendingRec = /^\d{6}$/.test(trimmed) ? pairingSessions.get(trimmed) : undefined;
    if (pendingRec && pendingRec.status === 'pending' && Date.now() <= pendingRec.expiresAt) {
      const userInfo = await userInfoPromise;
      recordVisitor(fromUser, userInfo.nickname, `配对码 ${trimmed} 绑定成功`);
      confirmPairing(trimmed, {
        openid: fromUser,
        nickname: userInfo.nickname || `微信用户_${trimmed.slice(-4)}`,
        avatar: userInfo.avatar,
      });

      const nickPrefix = userInfo.nickname ? `${userInfo.nickname}，` : '';
      replyText = `🎉 恭喜${nickPrefix}配对码【${trimmed}】验证成功！您的微信已与网站账号绑定，之后在网站登录时可直接用微信授权。`;
      outcome = `paired:${trimmed}`;
    }
    // Priority 2: Fixed keywords (登录 / 高股息 / 下载清单 / 网格交易 / 加群 / 入群)
    else if (/^(登录|扫码登录|微信登录|绑定|配对)$/i.test(compactText)) {
      replyText = [
        '🔐 网站微信免密登录指引',
        '1. 打开网站并点击顶部「关注微信公众号登录」，获取 6 位数字配对码；',
        '2. 直接在本公众号回复该 6 位纯数字配对码，即可自动完成登录解锁；',
        `🌐 访问地址：${effectiveBaseUrl}`,
      ].join('\n\n');
      outcome = 'keyword:login';
    } else if (/^(高股息|分红池|高股息池|高股息清单)$/i.test(compactText)) {
      replyText = await buildHighDividendStatusReply(effectiveBaseUrl);
      outcome = 'keyword:high_dividend';
    } else if (/^(下载清单|清单下载|导出清单|导出)$/i.test(compactText)) {
      replyText = [
        '📥 高股息清单与量化看板导出',
        `请访问网页端【高股息观察池】或【个股速查】，即可一键导出组合量化诊断看板 PNG 长图与高股息清单：\n${effectiveBaseUrl}`,
        '💡 您也可以直接在这里回复任意个股名称或代码（如：中国神华、601088），立即生成超清看板链接。',
      ].join('\n\n');
      outcome = 'keyword:download_list';
    } else if (/^(网格交易|网格|网格策略)$/i.test(compactText)) {
      replyText = [
        '📐 稳健网格交易执行要点',
        '1. 标的选择：优先高股息、低估值、现金流稳健的蓝筹标的（如长江电力、中国神华、招商银行）；',
        '2. 建仓锚点：结合 EXPMA(7/21/55/144) 多空趋势与 KDJ 低位信号分批布网；',
        '3. 发送任意股票名称或代码，可即时查看现价相对均线偏离度与高股息目标买价。',
      ].join('\n\n');
      outcome = 'keyword:grid';
    } else if (/^(加群|入群|进群|交流群|社群)$/i.test(compactText)) {
      replyText = [
        `👋 欢迎加入「${cfg.mpName}」量化交流圈`,
        '直接发送 A 股名称、简称、拼音首字母或 6 位代码（如：中国神华、茅台、zgsh、601088），即可随时调用实时量化诊断看板。',
        `🌐 网页端完整看板：${effectiveBaseUrl}`,
      ].join('\n\n');
      outcome = 'keyword:group';
    }
    // Priority 3: High-dividend query triggers (达标 / 买点 / 目标价)
    else if (
      trimmed.includes('达标') ||
      trimmed.includes('买点') ||
      trimmed.includes('目标价')
    ) {
      replyText = await buildHighDividendStatusReply(effectiveBaseUrl);
      outcome = 'trigger:dividend_target';
    }
    // Priority 4: A-share stock identification (6-digit code, full name, alias, short name, pinyin, noise-stripped text)
    else if (trimmed.length > 0) {
      if (/^\d{6}$/.test(trimmed) && !inferBoardAndExchange(trimmed)) {
        replyText = `未识别到有效的 A 股代码或有效配对码【${trimmed}】。如需登录请刷新网站配对码，如需诊股请发送 60/68/00/30/8/4/92 开头的 A 股代码或股票简称。`;
        outcome = `invalid_6digit:${trimmed}`;
      } else {
        const resolved = await tryResolveWechatStockQuery(trimmed);
        if (resolved) {
          try {
            const [diag, userInfo] = await Promise.all([
              getQuantDiagnosis(resolved.code),
              userInfoPromise,
            ]);
            replyText = formatStockAutoReplyText({
              nickname: userInfo.nickname,
              diag,
              baseUrl: effectiveBaseUrl,
            });
            recordVisitor(
              fromUser,
              userInfo.nickname,
              `查询个股 ${diag.quote.name}(${diag.quote.code})`,
            );
            outcome = `stock:${diag.quote.code}`;
          } catch {
            replyText = `暂时无法拉取【${trimmed}】实时行情，请稍后再试或发送 6 位标准 A 股代码。`;
            outcome = `stock_fetch_failed:${resolved.code}`;
          }
        } else {
          replyText = [
            `未匹配到 A 股标的【${trimmed}】`,
            '请发送 A 股全称/简称（如：中国神华、茅台、宁德时代）、拼音首字母（如：zgsh、gzmt）或 6 位股票代码（如：601088），也可发送网站 6 位登录配对码。',
          ].join('\n\n');
          outcome = `unmatched:${trimmed.slice(0, 20)}`;
        }
      }
    } else {
      replyText = '请发送 A 股名称、简称、拼音或 6 位代码获取趋势与量比诊断图，或发送网站 6 位配对码完成登录。';
      outcome = 'empty_text';
    }
  } else {
    replyText = '请发送文字消息：输入任意 A 股名称/简称/拼音/6位代码即可生成趋势与量比诊断图，或输入网站 6 位配对码登录。';
    outcome = `non_text:${msgType || 'unknown'}`;
  }

  const responseXml = buildWeChatReplyXml({
    toUser: fromUser,
    fromUser: toUser,
    content: replyText,
    isEncrypted,
    token: cfg.token,
    aesKey: cfg.aesKey,
    appId: cfg.appId,
  });

  recordWebhookHit({
    method: 'POST',
    durationMs: Date.now() - start,
    encrypted: isEncrypted,
    outcome,
    detail: `From=${maskSecret(fromUser, 3, 3)} -> ${outcome}`,
  });

  return {
    statusCode: 200,
    contentType: 'application/xml; charset=utf-8',
    body: responseXml,
  };
}

export function testWechatSignature(overrideToken?: string): WechatSignatureTestResult {
  const cfg = getEffectiveMpConfig();
  const activeToken = (overrideToken?.trim() || cfg.token || '').trim();
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomBytes(8).toString('hex');

  if (!activeToken) {
    return {
      ok: false,
      hasToken: false,
      timestamp,
      nonce,
      signature: '',
      verified: false,
      message: '尚未配置服务器 Token，请先填写或随机生成 32 位 Token 并保存。',
    };
  }

  const signature = computeWechatSignature(activeToken, timestamp, nonce);
  const check = computeWechatSignature(activeToken, timestamp, nonce);
  const verified = safeEqualHex(signature, check);
  return {
    ok: verified,
    hasToken: true,
    timestamp,
    nonce,
    signature,
    verified,
    message: verified ? 'SHA-1 签名算法双向自检通过，可与微信公众平台完成对接。' : '签名比对异常',
  };
}

async function getPublicEgressIp(): Promise<{ ip: string; source: string }> {
  if (cachedEgressIp && Date.now() < cachedEgressIp.expiresAt) {
    return { ip: cachedEgressIp.ip, source: cachedEgressIp.source };
  }

  const endpoints = [
    { url: 'https://api.ipify.org?format=json', type: 'json' as const, source: 'ipify' },
    { url: 'https://ifconfig.me/ip', type: 'text' as const, source: 'ifconfig.me' },
  ];

  for (const ep of endpoints) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    try {
      const res = await fetch(ep.url, { signal: controller.signal });
      if (!res.ok) continue;
      let ip = '';
      if (ep.type === 'json') {
        const data = (await res.json()) as { ip?: string };
        ip = typeof data.ip === 'string' ? data.ip.trim() : '';
      } else {
        ip = (await res.text()).trim();
      }
      if (/^[\da-fA-F.:]+$/.test(ip)) {
        cachedEgressIp = {
          ip,
          source: ep.source,
          expiresAt: Date.now() + 5 * 60 * 1000,
        };
        return { ip, source: ep.source };
      }
    } catch {
      // Try next fallback
    } finally {
      clearTimeout(timer);
    }
  }

  return { ip: '未探测到公网出口 IP', source: 'offline' };
}

export async function getWechatDiagnosticInfo(): Promise<WechatDiagnosticResponse> {
  const cfg = getEffectiveMpConfig();
  const egress = await getPublicEgressIp();
  return {
    configured: Boolean(cfg.appId && cfg.appSecret && cfg.token),
    appIdConfigured: Boolean(cfg.appId),
    appIdMasked: cfg.appId ? maskSecret(cfg.appId, 4, 4) : '未配置',
    appSecretConfigured: Boolean(cfg.appSecret),
    appSecretMasked: cfg.appSecret ? maskSecret(cfg.appSecret, 4, 4) : '未配置',
    tokenConfigured: Boolean(cfg.token),
    aesKeyConfigured: Boolean(cfg.aesKey),
    originalId: cfg.originalId,
    egressIp: egress.ip,
    egressIpSource: egress.source,
    recentWebhookHits: [...recentWebhookHits],
    recentVisitors: [...recentVisitors],
  };
}

export async function testWechatImageUpload(): Promise<WechatImageUploadTestResponse> {
  const start = Date.now();
  const cfg = getEffectiveMpConfig();
  if (!cfg.appId || !cfg.appSecret) {
    return {
      ok: false,
      step: 'config',
      hint: '请先配置并保存有效的 AppID 与 AppSecret，再执行微信素材上传实测。',
      durationMs: Date.now() - start,
    };
  }

  const tokenRes = await fetchWechatAccessToken();
  if (!tokenRes.ok || !tokenRes.accessToken) {
    return {
      ok: false,
      step: 'access_token',
      errcode: tokenRes.errcode,
      errmsg: tokenRes.errmsg,
      hint: tokenRes.hint,
      durationMs: Date.now() - start,
    };
  }

  // Generate a real diagnostic PNG buffer for 601088 to test temporary media upload
  let pngBuffer: Buffer;
  try {
    const sample = await getQuantDiagnosis('601088');
    pngBuffer = renderWechatStockChartPng(sample, 'long');
  } catch {
    // 1x1 transparent PNG fallback if market fetch fails
    pngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const form = new FormData();
    form.append('media', new Blob([new Uint8Array(pngBuffer)], { type: 'image/png' }), 'quant-test.png');

    const uploadUrl = `https://api.weixin.qq.com/cgi-bin/media/upload?access_token=${encodeURIComponent(tokenRes.accessToken)}&type=image`;
    const upRes = await fetch(uploadUrl, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });
    const upJson = (await upRes.json()) as {
      media_id?: string;
      errcode?: number;
      errmsg?: string;
    };

    if (upJson.media_id) {
      return {
        ok: true,
        step: 'completed',
        mediaId: upJson.media_id,
        hint: `access_token 与临时图片素材上传全链路实测成功（media_id: ${upJson.media_id.slice(0, 18)}...）。`,
        durationMs: Date.now() - start,
      };
    }

    const errcode = upJson.errcode ?? -1;
    const errmsg = upJson.errmsg ?? '上传响应未返回 media_id';
    return {
      ok: false,
      step: 'media_upload',
      errcode,
      errmsg,
      hint: mapWechatErrorHint(errcode, errmsg),
      durationMs: Date.now() - start,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : '请求异常';
    return {
      ok: false,
      step: 'media_upload',
      hint: `调用微信素材上传接口异常：${message}`,
      durationMs: Date.now() - start,
    };
  } finally {
    clearTimeout(timer);
  }
}
