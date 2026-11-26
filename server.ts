import 'dotenv/config';
import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { GoogleGenAI, Type } from '@google/genai';
import {
  getQuantDiagnosis,
  resolveTargetStock,
  searchAShareStocks,
} from './src/server/marketDataService.ts';
import {
  checkAndConsumeGuestQuota,
  DEFAULT_SHOWCASE_CODE,
  getGuestQuotaStatus,
  sanitizeGuestKey,
} from './src/server/guestQuotaService.ts';
import { HIGH_DIVIDEND_POOL, inferBoardAndExchange } from './src/server/stockDictionary.ts';
import { renderWechatStockChartPng } from './src/server/wechatChartPng.ts';
import {
  checkPairingStatus,
  confirmPairing,
  createPairingSession,
  getMaskedMpConfig,
  getSessionByToken,
  getWechatDiagnosticInfo,
  handleWechatWebhookGet,
  handleWechatWebhookPost,
  revokeSessionToken,
  testWechatImageUpload,
  testWechatSignature,
  updateMpConfig,
} from './src/server/wechatService.ts';
import type { AiDiagnosisRequest, AiDiagnosisResult, ExpmaPeriodMode } from './src/shared/quantTypes.ts';
import type { WechatMpConfigUpdatePayload } from './src/shared/wechatTypes.ts';

const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';
const SESSION_COOKIE_NAME = 'wx_quant_session';
const GUEST_COOKIE_NAME = 'wx_quant_guest_id';

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  const result: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = part.slice(0, eqIdx).trim();
    const val = part.slice(eqIdx + 1).trim();
    try {
      result[key] = decodeURIComponent(val);
    } catch {
      result[key] = val;
    }
  }
  return result;
}

function extractSessionToken(req: express.Request): string | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }
  const cookies = parseCookies(req.headers.cookie);
  return cookies[SESSION_COOKIE_NAME] || null;
}

function setSessionCookie(res: express.Response, token: string): void {
  const cookieAttrs = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'Max-Age=86400',
    'SameSite=None',
    'Secure',
    'Partitioned',
  ];
  res.setHeader('Set-Cookie', cookieAttrs.join('; '));
}

function clearSessionCookie(res: express.Response): void {
  const cookieAttrs = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Max-Age=0',
    'SameSite=None',
    'Secure',
    'Partitioned',
  ];
  res.setHeader('Set-Cookie', cookieAttrs.join('; '));
}

function extractGuestIds(req: express.Request): {
  cookieId: string | null;
  clientId: string | null;
} {
  const cookies = parseCookies(req.headers.cookie);
  const cookieId = sanitizeGuestKey(cookies[GUEST_COOKIE_NAME]);
  const rawHeader = req.headers['x-guest-client-id'];
  const clientId = sanitizeGuestKey(typeof rawHeader === 'string' ? rawHeader : undefined);
  return { cookieId, clientId };
}

function setGuestQuotaCookie(res: express.Response, guestId: string): void {
  const cookieAttrs = [
    `${GUEST_COOKIE_NAME}=${encodeURIComponent(guestId)}`,
    'Path=/',
    'HttpOnly',
    'Max-Age=315360000', // 10 years, never resets by date
    'SameSite=None',
    'Secure',
    'Partitioned',
  ];
  res.append('Set-Cookie', cookieAttrs.join('; '));
}

function checkAdminAccess(req: express.Request): boolean {
  const configuredPasscode = (process.env.ADMIN_PASSCODE || '').trim();
  if (!configuredPasscode) {
    return true;
  }
  const provided = typeof req.headers['x-admin-passcode'] === 'string'
    ? req.headers['x-admin-passcode'].trim()
    : '';
  const bufA = Buffer.from(configuredPasscode, 'utf8');
  const bufB = Buffer.from(provided, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function resolveRequestBaseUrl(req: express.Request): string {
  const rawForwardedHost = req.headers['x-forwarded-host'];
  const hostHeader = Array.isArray(rawForwardedHost)
    ? rawForwardedHost[0]
    : typeof rawForwardedHost === 'string'
      ? rawForwardedHost.split(',')[0].trim()
      : (req.headers.host || '').trim();

  const rawProto = req.headers['x-forwarded-proto'];
  const protoCandidate = (
    Array.isArray(rawProto)
      ? rawProto[0]
      : typeof rawProto === 'string'
        ? rawProto.split(',')[0].trim()
        : req.protocol || 'http'
  ).toLowerCase();

  const proto = protoCandidate === 'https' || protoCandidate === 'http' ? protoCandidate : 'https';

  // Strictly validate hostname[:port] to guard against header injection
  if (hostHeader && /^[a-zA-Z0-9.-]+(?::\d{1,5})?$/.test(hostHeader)) {
    const isLocal = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(hostHeader);
    const effectiveProto = !isLocal && protoCandidate === 'https' ? 'https' : proto;
    return `${effectiveProto}://${hostHeader}`;
  }

  const fallback = (process.env.SITE_URL || process.env.APP_URL || `http://localhost:${PORT}`).trim();
  return fallback.replace(/\/+$/, '');
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);

  // WeChat Webhook GET verification & POST XML messages (mount before json parser)
  app.get('/api/wechat/webhook', (req, res) => {
    const result = handleWechatWebhookGet({
      signature: typeof req.query.signature === 'string' ? req.query.signature : undefined,
      msg_signature: typeof req.query.msg_signature === 'string' ? req.query.msg_signature : undefined,
      timestamp: typeof req.query.timestamp === 'string' ? req.query.timestamp : undefined,
      nonce: typeof req.query.nonce === 'string' ? req.query.nonce : undefined,
      echostr: typeof req.query.echostr === 'string' ? req.query.echostr : undefined,
      encrypt_type: typeof req.query.encrypt_type === 'string' ? req.query.encrypt_type : undefined,
    });
    res.status(result.statusCode).type('text/plain').send(result.body);
  });

  app.post(
    '/api/wechat/webhook',
    express.text({ type: ['text/xml', 'application/xml', 'text/plain', '*/*'], limit: '512kb' }),
    async (req, res) => {
      try {
        const rawBody = typeof req.body === 'string' ? req.body : '';
        const baseUrl = resolveRequestBaseUrl(req);
        const result = await handleWechatWebhookPost(
          rawBody,
          {
            signature: typeof req.query.signature === 'string' ? req.query.signature : undefined,
            msg_signature: typeof req.query.msg_signature === 'string' ? req.query.msg_signature : undefined,
            timestamp: typeof req.query.timestamp === 'string' ? req.query.timestamp : undefined,
            nonce: typeof req.query.nonce === 'string' ? req.query.nonce : undefined,
            encrypt_type: typeof req.query.encrypt_type === 'string' ? req.query.encrypt_type : undefined,
          },
          baseUrl,
        );
        res.status(result.statusCode).type(result.contentType).send(result.body);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Webhook 处理异常';
        res.status(500).type('text/plain').send(message);
      }
    },
  );

  app.use(express.json({ limit: '512kb' }));

  // Auth Session Check & Logout
  app.get('/api/auth/me', (req, res) => {
    const token = extractSessionToken(req);
    const session = getSessionByToken(token);
    if (!session) {
      res.json({ isLoggedIn: false, session: null });
      return;
    }
    res.json({ isLoggedIn: true, session });
  });

  app.post('/api/auth/logout', (req, res) => {
    const token = extractSessionToken(req);
    revokeSessionToken(token);
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  // WeChat Pairing Flow
  app.get('/api/wechat/code', (_req, res) => {
    const payload = createPairingSession();
    res.json(payload);
  });

  app.get('/api/wechat/check-status', (req, res) => {
    const code = typeof req.query.code === 'string' ? req.query.code.trim() : '';
    const statusRes = checkPairingStatus(code);
    if (statusRes.status === 'paired' && statusRes.session?.token) {
      setSessionCookie(res, statusRes.session.token);
    }
    res.json(statusRes);
  });

  app.post('/api/wechat/pair', (req, res) => {
    try {
      const body = req.body as {
        code?: string;
        nickname?: string;
        avatar?: string;
        openid?: string;
      };
      const code = typeof body.code === 'string' ? body.code.trim() : '';
      if (!/^\d{6}$/.test(code)) {
        res.status(400).json({ error: '请提供有效的 6 位纯数字配对码' });
        return;
      }
      const session = confirmPairing(code, {
        nickname: typeof body.nickname === 'string' ? body.nickname : undefined,
        avatar: typeof body.avatar === 'string' ? body.avatar : undefined,
        openid: typeof body.openid === 'string' ? body.openid : undefined,
      });
      if (session.token) {
        setSessionCookie(res, session.token);
      }
      res.json({ ok: true, status: 'paired', session });
    } catch (err) {
      const message = err instanceof Error ? err.message : '配对确认失败';
      res.status(400).json({ error: message });
    }
  });

  // WeChat MP Developer Configuration & Diagnostics
  app.get('/api/wechat/mp-config', (req, res) => {
    if (!checkAdminAccess(req)) {
      res.status(403).json({ error: '管理员校验失败，请在请求头提供有效管理密钥' });
      return;
    }
    res.json({
      ...getMaskedMpConfig(),
      adminPasscodeRequired: Boolean((process.env.ADMIN_PASSCODE || '').trim()),
    });
  });

  app.post('/api/wechat/mp-config', (req, res) => {
    if (!checkAdminAccess(req)) {
      res.status(403).json({ error: '管理员校验失败，请在请求头提供有效管理密钥' });
      return;
    }
    try {
      const body = (req.body || {}) as WechatMpConfigUpdatePayload;
      const updated = updateMpConfig(body);
      res.json({ ok: true, config: updated });
    } catch (err) {
      const message = err instanceof Error ? err.message : '保存公众号配置失败';
      res.status(400).json({ error: message });
    }
  });

  app.post('/api/wechat/test-signature', (req, res) => {
    if (!checkAdminAccess(req)) {
      res.status(403).json({ error: '管理员校验失败' });
      return;
    }
    const body = (req.body || {}) as { token?: string };
    const result = testWechatSignature(typeof body.token === 'string' ? body.token : undefined);
    res.json(result);
  });

  app.get('/api/wechat/image-reply-diagnostic', async (req, res) => {
    if (!checkAdminAccess(req)) {
      res.status(403).json({ error: '管理员校验失败' });
      return;
    }
    const diag = await getWechatDiagnosticInfo();
    res.json(diag);
  });

  app.post('/api/wechat/test-image-upload', async (req, res) => {
    if (!checkAdminAccess(req)) {
      res.status(403).json({ error: '管理员校验失败' });
      return;
    }
    const result = await testWechatImageUpload();
    res.json(result);
  });

  // 1. Stock search autocomplete (filters out ETF/LOF/bonds/indices, max 8 items)
  app.get('/api/search', async (req, res) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      const items = await searchAShareStocks(q);
      res.json({ items });
    } catch (err) {
      const message = err instanceof Error ? err.message : '检索失败';
      res.status(500).json({ error: message });
    }
  });

  // 2. High-dividend watchlist pool metadata
  app.get('/api/dividend-pool', (_req, res) => {
    const items = HIGH_DIVIDEND_POOL.map((d) => {
      const boardInfo = inferBoardAndExchange(d.code);
      return {
        ...d,
        board: boardInfo?.board ?? '沪A主板',
        market: boardInfo?.market ?? 'sh',
      };
    });
    res.json({ items });
  });

  // 2b. Permanent lifetime guest query quota (3 stocks total when not followed/logged in; never resets on date change)
  app.get('/api/guest-quota', (req, res) => {
    const token = extractSessionToken(req);
    const session = getSessionByToken(token);
    const isLoggedIn = Boolean(session?.isLoggedIn);
    const guestIds = extractGuestIds(req);
    const { guestId, quota } = getGuestQuotaStatus(guestIds, isLoggedIn);
    if (!guestIds.cookieId || guestIds.cookieId !== guestId) {
      setGuestQuotaCookie(res, guestId);
    }
    res.json(quota);
  });

  // 3. Full-market real-time quote & pure-algorithm 7-dim quant diagnosis
  app.get('/api/stock/quant-diagnosis', async (req, res) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      if (!q) {
        res.status(400).json({ error: '请提供股票代码、简称或拼音首字母参数 q' });
        return;
      }

      const token = extractSessionToken(req);
      const session = getSessionByToken(token);
      const isLoggedIn = Boolean(session?.isLoggedIn);
      const isInitialShowcasePreview = req.query.preview === '1';

      const target = await resolveTargetStock(q);
      const guestIds = extractGuestIds(req);

      // Default homepage showcase stock (601088) preview on boot does not burn guest quota,
      // while all explicit stock queries are strictly capped at 3 distinct stocks permanently.
      if (!isLoggedIn && !(isInitialShowcasePreview && target.code === DEFAULT_SHOWCASE_CODE)) {
        const check = checkAndConsumeGuestQuota(guestIds, target.code, false);
        if (!guestIds.cookieId || guestIds.cookieId !== check.guestId) {
          setGuestQuotaCookie(res, check.guestId);
        }
        if (!check.allowed) {
          res.status(403).json({
            error: '未关注公众号最多仅可查询 3 个个股（永久累计，不随日期更新而重置），关注微信公众号登录后即可解锁无限查询。',
            code: 'GUEST_QUOTA_EXCEEDED',
            quota: check.quota,
          });
          return;
        }
        const diagnosis = await getQuantDiagnosis(target.code);
        res.json({ ...diagnosis, guestQuota: check.quota });
        return;
      }

      const { guestId, quota } = getGuestQuotaStatus(guestIds, isLoggedIn);
      if (!guestIds.cookieId || guestIds.cookieId !== guestId) {
        setGuestQuotaCookie(res, guestId);
      }
      const diagnosis = await getQuantDiagnosis(target.code);
      res.json({ ...diagnosis, guestQuota: quota });
    } catch (err) {
      const message = err instanceof Error ? err.message : '量化直算引擎异常';
      res.status(404).json({ error: message });
    }
  });

  // 4. WeChat auto-reply 2x Retina 2240px combo quant diagnosis PNG (default full/long view)
  app.get('/api/wechat/stock-chart/:fileParam', async (req, res) => {
    try {
      const rawParam = req.params.fileParam || '';
      const codeMatch = rawParam.match(/^(\d{6})(?:\.png)?$/i);
      if (!codeMatch) {
        res.status(400).json({ error: '无效的股票代码图片路径' });
        return;
      }
      const code = codeMatch[1];
      if (!inferBoardAndExchange(code)) {
        res.status(400).json({ error: '仅支持 A 股（沪A/深A/科创/创业/北交所）股票代码' });
        return;
      }

      const periodParam = req.query.period === 'short' ? 'short' : 'long';
      const periodMode: ExpmaPeriodMode = periodParam;
      const diagnosis = await getQuantDiagnosis(code);
      const pngBuffer = renderWechatStockChartPng(diagnosis, periodMode);

      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Disposition', `inline; filename="quant-${code}-${periodMode}.png"`);
      res.setHeader('Cache-Control', 'public, max-age=60');
      res.send(pngBuffer);
    } catch (err) {
      const message = err instanceof Error ? err.message : '生成组合看板图片失败';
      res.status(500).json({ error: message });
    }
  });

  // 5. On-demand AI deep diagnosis (Gemini structured JSON)
  app.post('/api/stock/ai-diagnosis', async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(503).json({
        error: '服务端尚未配置 GEMINI_API_KEY，请在 Settings > Secrets 中设置后重试。',
      });
      return;
    }

    const body = req.body as Partial<AiDiagnosisRequest>;
    const stockCode = typeof body.stockCode === 'string' ? body.stockCode.trim() : '';
    const stockName = typeof body.stockName === 'string' ? body.stockName.trim() : '';
    const sectorName = typeof body.sectorName === 'string' ? body.sectorName.trim() : '';
    const price = Number(body.price);
    const changePercent = Number(body.changePercent);
    const mainNetInflow = Number(body.mainNetInflow);
    const superLargeInflow = Number(body.superLargeInflow);
    const orderBookSnippet = typeof body.orderBookSnippet === 'string' ? body.orderBookSnippet.trim() : '';

    if (!/^\d{6}$/.test(stockCode) || !stockName || !Number.isFinite(price) || !orderBookSnippet) {
      res.status(400).json({ error: 'AI 深度诊股参数不完整或格式无效' });
      return;
    }

    const userPrompt = `请作为A股盘口与资金流专家，对以下个股进行主力动向深度复盘与明日操盘研判：
- 股票代码与名称: ${stockCode} ${stockName} (所属板块: ${sectorName || 'A股核心'})
- 当前股价: ¥${price.toFixed(2)} (今日涨跌幅: ${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%)
- 主力资金净流入: ${mainNetInflow.toFixed(2)}亿元 (超大单流入: ${superLargeInflow.toFixed(2)}亿元)
- 盘口特征: ${orderBookSnippet}

请分析主力真实行为(如: 机构建仓 / 主升浪拉升 / 洗盘吸筹 / 高位派发出货 / 假突破)，并给出具体操盘建议。`;

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: userPrompt,
        config: {
          systemInstruction: '你是一位A股盘口语言与主力筹码结构分析专家，请输出严谨客观的分析。',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              mainBehavior: {
                type: Type.STRING,
                description: '主力核心操盘行为（如机构建仓、主升浪拉升、洗盘吸筹、高位派发出货、假突破等）',
              },
              confidenceScore: {
                type: Type.NUMBER,
                description: '多头强度评分，0到100之间的整数',
              },
              capitalStructure: {
                type: Type.STRING,
                description: '资金结构与单笔挂单解析',
              },
              shortTermOutlook: {
                type: Type.STRING,
                description: '短期 1-3 日走势推演',
              },
              supportPrice: {
                type: Type.STRING,
                description: '短线支撑/止损位（给出具体价位区间与依据）',
              },
              pressurePrice: {
                type: Type.STRING,
                description: '第一压力目标位（给出具体价位区间与依据）',
              },
              operationTips: {
                type: Type.STRING,
                description: '具体可执行的操盘指导建议',
              },
            },
            required: [
              'mainBehavior',
              'confidenceScore',
              'capitalStructure',
              'shortTermOutlook',
              'supportPrice',
              'pressurePrice',
              'operationTips',
            ],
          },
        },
      });

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        res.status(502).json({ error: 'AI 模型未返回有效研判内容，请稍后重试。' });
        return;
      }

      const parsed = JSON.parse(rawText) as AiDiagnosisResult;
      res.json(parsed);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI 深度诊股调用失败';
      res.status(502).json({ error: `AI 研判接口调用异常：${message}` });
    }
  });

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
