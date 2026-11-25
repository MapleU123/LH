import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  RefreshCw,
  Save,
  Server,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  X,
} from 'lucide-react';
import type {
  WechatDiagnosticResponse,
  WechatImageUploadTestResponse,
  WechatMpConfigMasked,
  WechatSignatureTestResult,
} from '../shared/wechatTypes.ts';
import {
  fetchWechatDiagnosticApi,
  fetchWechatMpConfig,
  saveWechatMpConfig,
  testWechatImageUploadApi,
  testWechatSignatureApi,
} from '../utils/wechatPairingService.ts';

interface WechatMpConfigModalProps {
  open: boolean;
  onClose: () => void;
}

function generateRandomHex(length = 32): string {
  const bytes = new Uint8Array(Math.ceil(length / 2));
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, length);
}

function generateRandomAesKey43(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(43);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

export function WechatMpConfigModal({ open, onClose }: WechatMpConfigModalProps) {
  const [activeTab, setActiveTab] = useState<'config' | 'diagnostic'>('config');
  const [adminPasscode, setAdminPasscode] = useState('');
  const [adminRequired, setAdminRequired] = useState(false);

  const [loadingConfig, setLoadingConfig] = useState(false);
  const [saving, setSaving] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [maskedInfo, setMaskedInfo] = useState<WechatMpConfigMasked | null>(null);

  // Form fields (secrets default to empty so blank submits keep existing/env values)
  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [token, setToken] = useState('');
  const [aesKey, setAesKey] = useState('');
  const [originalId, setOriginalId] = useState('');
  const [mpName, setMpName] = useState('');
  const [wechatId, setWechatId] = useState('');
  const [alertTemplateId, setAlertTemplateId] = useState('');
  const [subTemplateStockId, setSubTemplateStockId] = useState('');
  const [showSecrets, setShowSecrets] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Diagnostics state
  const [sigTestLoading, setSigTestLoading] = useState(false);
  const [sigResult, setSigResult] = useState<WechatSignatureTestResult | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagInfo, setDiagInfo] = useState<WechatDiagnosticResponse | null>(null);
  const [uploadTestLoading, setUploadTestLoading] = useState(false);
  const [uploadResult, setUploadResult] = useState<WechatImageUploadTestResponse | null>(null);
  const [diagError, setDiagError] = useState<string | null>(null);

  const webhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/wechat/webhook`
      : '/api/wechat/webhook';

  const loadConfig = useCallback(async () => {
    setLoadingConfig(true);
    setConfigError(null);
    try {
      const cfg = await fetchWechatMpConfig(adminPasscode);
      setMaskedInfo(cfg);
      setAdminRequired(Boolean(cfg.adminPasscodeRequired));
      setAppId(cfg.appId || '');
      setOriginalId(cfg.originalId || '');
      setMpName(cfg.mpName || '');
      setWechatId(cfg.wechatId || '');
      setAlertTemplateId(cfg.alertTemplateId || '');
      setSubTemplateStockId(cfg.subTemplateStockId || '');
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : '读取配置失败');
    } finally {
      setLoadingConfig(false);
    }
  }, [adminPasscode]);

  const loadDiagnostic = useCallback(async () => {
    setDiagLoading(true);
    setDiagError(null);
    try {
      const data = await fetchWechatDiagnosticApi(adminPasscode);
      setDiagInfo(data);
    } catch (err) {
      setDiagError(err instanceof Error ? err.message : '读取连通性诊断失败');
    } finally {
      setDiagLoading(false);
    }
  }, [adminPasscode]);

  useEffect(() => {
    if (!open) return;
    void loadConfig();
  }, [open, loadConfig]);

  useEffect(() => {
    if (open && activeTab === 'diagnostic') {
      void loadDiagnostic();
    }
  }, [open, activeTab, loadDiagnostic]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const copyText = async (key: string, value: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(key);
      setTimeout(() => setCopiedField(null), 1800);
    } catch {
      setCopiedField(null);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setConfigError(null);
    setSaveMessage(null);
    try {
      const updated = await saveWechatMpConfig(
        {
          appId,
          appSecret,
          token,
          aesKey,
          originalId,
          mpName,
          wechatId,
          alertTemplateId,
          subTemplateStockId,
        },
        adminPasscode,
      );
      setMaskedInfo(updated);
      setAppSecret('');
      setToken('');
      setAesKey('');
      setSaveMessage('公众号配置已保存并热更新生效（已写入运行态配置文件，空白密钥字段自动沿用已有配置或环境变量）。');
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleTestSignature = async () => {
    setSigTestLoading(true);
    setDiagError(null);
    try {
      const res = await testWechatSignatureApi(token || undefined, adminPasscode);
      setSigResult(res);
    } catch (err) {
      setDiagError(err instanceof Error ? err.message : '签名测试失败');
    } finally {
      setSigTestLoading(false);
    }
  };

  const handleTestImageUpload = async () => {
    setUploadTestLoading(true);
    setDiagError(null);
    try {
      const res = await testWechatImageUploadApi(adminPasscode);
      setUploadResult(res);
    } catch (err) {
      setDiagError(err instanceof Error ? err.message : '素材上传测试失败');
    } finally {
      setUploadTestLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="公众号开发者服务器配置与连通诊断"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-3 sm:p-6 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="my-4 w-full max-w-[860px] rounded-2xl border border-slate-800 bg-[#0F1521] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/15 text-blue-400">
              <Server className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">公众号服务器配置与连通诊断</h3>
              <p className="text-xs text-slate-400">
                支持明文 / 安全加密模式加解密、热更新持久化及微信 API 出口 IP 白名单排障
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭配置弹窗"
            className="rounded-lg border border-slate-700 p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 pt-3">
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => setActiveTab('config')}
              className={`border-b-2 pb-2.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'config'
                  ? 'border-blue-500 text-white'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              服务器参数配置与热更新
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('diagnostic')}
              className={`border-b-2 pb-2.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'diagnostic'
                  ? 'border-blue-500 text-white'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              连通性与排障诊断
            </button>
          </div>

          {adminRequired && (
            <div className="mb-2 flex items-center gap-2">
              <input
                type="password"
                value={adminPasscode}
                onChange={(e) => setAdminPasscode(e.target.value)}
                placeholder="输入 ADMIN_PASSCODE"
                className="w-40 rounded-md border border-slate-700 bg-[#080B12] px-2.5 py-1 text-xs text-white focus:border-blue-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => void loadConfig()}
                className="rounded-md bg-slate-800 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-700"
              >
                校验
              </button>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-5">
          {activeTab === 'config' ? (
            <form onSubmit={handleSave} className="space-y-4">
              {/* Webhook URL Copy Bar */}
              <div className="rounded-xl border border-slate-800 bg-[#080B12] p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-medium text-slate-400">
                      服务器地址（URL）— 填写至微信公众平台「基本配置」
                    </div>
                    <div className="mt-1 truncate font-mono text-xs text-sky-300">{webhookUrl}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void copyText('webhook', webhookUrl)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 hover:text-white whitespace-nowrap"
                  >
                    {copiedField === 'webhook' ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    <span>{copiedField === 'webhook' ? '已复制 URL' : '复制 URL'}</span>
                  </button>
                </div>
              </div>

              {loadingConfig && (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>正在读取运行态配置...</span>
                </div>
              )}

              {/* Token & EncodingAESKey */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-300">
                      令牌（Token）
                      {maskedInfo?.hasToken && (
                        <span className="ml-1.5 font-mono text-[11px] text-emerald-400">
                          已配置 ({maskedInfo.tokenMasked})
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => setToken(generateRandomHex(32))}
                      className="inline-flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300"
                    >
                      <Sparkles className="h-3 w-3" />
                      <span>随机生成 32 位 Hex</span>
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      placeholder={
                        maskedInfo?.hasToken
                          ? '留空保留当前 Token，或粘贴/生成新 Token'
                          : '点击上方随机生成 32 位 Hex'
                      }
                      className="w-full rounded-lg border border-slate-700 bg-[#080B12] px-3 py-2 font-mono text-xs text-white focus:border-blue-500 focus:outline-none"
                    />
                    {token && (
                      <button
                        type="button"
                        onClick={() => void copyText('token', token)}
                        className="rounded-lg border border-slate-700 bg-slate-800 p-2 text-slate-300 hover:text-white"
                        title="复制当前生成的 Token"
                      >
                        {copiedField === 'token' ? (
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-300">
                      消息加解密密钥（EncodingAESKey）
                      {maskedInfo?.hasAesKey && (
                        <span className="ml-1.5 font-mono text-[11px] text-emerald-400">
                          已配置 ({maskedInfo.aesKeyMasked})
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => setAesKey(generateRandomAesKey43())}
                      className="inline-flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300"
                    >
                      <KeyRound className="h-3 w-3" />
                      <span>随机生成 43 位</span>
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={aesKey}
                      onChange={(e) => setAesKey(e.target.value)}
                      placeholder={
                        maskedInfo?.hasAesKey
                          ? '留空保留当前 43 位密钥，或重新生成'
                          : '43 位英文/数字字符（安全模式必填）'
                      }
                      className="w-full rounded-lg border border-slate-700 bg-[#080B12] px-3 py-2 font-mono text-xs text-white focus:border-blue-500 focus:outline-none"
                    />
                    {aesKey && (
                      <button
                        type="button"
                        onClick={() => void copyText('aesKey', aesKey)}
                        className="rounded-lg border border-slate-700 bg-slate-800 p-2 text-slate-300 hover:text-white"
                        title="复制当前生成的 AESKey"
                      >
                        {copiedField === 'aesKey' ? (
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* AppID, AppSecret, OriginalID */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <label className="block space-y-1.5 text-xs">
                  <span className="font-medium text-slate-300">
                    开发者 ID（AppID）
                    {maskedInfo?.envFallbacks.appId && (
                      <span className="ml-1 text-[10px] text-sky-400">[ENV兜底]</span>
                    )}
                  </span>
                  <input
                    type="text"
                    value={appId}
                    onChange={(e) => setAppId(e.target.value)}
                    placeholder="wx..."
                    className="w-full rounded-lg border border-slate-700 bg-[#080B12] px-3 py-2 font-mono text-xs text-white focus:border-blue-500 focus:outline-none"
                  />
                </label>

                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-300">
                      开发者密码（AppSecret）
                      {maskedInfo?.hasAppSecret && (
                        <span className="ml-1 font-mono text-[10px] text-emerald-400">
                          [{maskedInfo.appSecretMasked}]
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowSecrets((v) => !v)}
                      className="text-slate-400 hover:text-white"
                    >
                      {showSecrets ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <input
                    type={showSecrets ? 'text' : 'password'}
                    value={appSecret}
                    onChange={(e) => setAppSecret(e.target.value)}
                    placeholder={maskedInfo?.hasAppSecret ? '已配置（留空不覆盖）' : '输入 AppSecret'}
                    className="w-full rounded-lg border border-slate-700 bg-[#080B12] px-3 py-2 font-mono text-xs text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <label className="block space-y-1.5 text-xs">
                  <span className="font-medium text-slate-300">公众号原始 ID（OriginalID）</span>
                  <input
                    type="text"
                    value={originalId}
                    onChange={(e) => setOriginalId(e.target.value)}
                    placeholder="gh_xxxxxxxxxxxx"
                    className="w-full rounded-lg border border-slate-700 bg-[#080B12] px-3 py-2 font-mono text-xs text-white focus:border-blue-500 focus:outline-none"
                  />
                </label>
              </div>

              {/* Public MP Name, Wechat ID & Optional Template IDs */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="block space-y-1.5 text-xs">
                  <span className="font-medium text-slate-300">公众号展示名称</span>
                  <input
                    type="text"
                    value={mpName}
                    onChange={(e) => setMpName(e.target.value)}
                    placeholder="我爱这young"
                    className="w-full rounded-lg border border-slate-700 bg-[#080B12] px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
                  />
                </label>
                <label className="block space-y-1.5 text-xs">
                  <span className="font-medium text-slate-300">微信号</span>
                  <input
                    type="text"
                    value={wechatId}
                    onChange={(e) => setWechatId(e.target.value)}
                    placeholder="gh_7d39de02f610"
                    className="w-full rounded-lg border border-slate-700 bg-[#080B12] px-3 py-2 font-mono text-xs text-white focus:border-blue-500 focus:outline-none"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="block space-y-1.5 text-xs">
                  <span className="font-medium text-slate-400">可选：到价提醒模板 ID（alertTemplateId）</span>
                  <input
                    type="text"
                    value={alertTemplateId}
                    onChange={(e) => setAlertTemplateId(e.target.value)}
                    placeholder="选填，模板消息 ID"
                    className="w-full rounded-lg border border-slate-700 bg-[#080B12] px-3 py-2 font-mono text-xs text-white focus:border-blue-500 focus:outline-none"
                  />
                </label>
                <label className="block space-y-1.5 text-xs">
                  <span className="font-medium text-slate-400">可选：个股订阅模板 ID（subTemplateStockId）</span>
                  <input
                    type="text"
                    value={subTemplateStockId}
                    onChange={(e) => setSubTemplateStockId(e.target.value)}
                    placeholder="选填，订阅通知模板 ID"
                    className="w-full rounded-lg border border-slate-700 bg-[#080B12] px-3 py-2 font-mono text-xs text-white focus:border-blue-500 focus:outline-none"
                  />
                </label>
              </div>

              {configError && (
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3.5 py-2 text-xs text-rose-300">
                  {configError}
                </div>
              )}
              {saveMessage && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-xs text-emerald-300">
                  {saveMessage}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4">
                <span className="text-[11px] text-slate-500">
                  运行态配置保存于服务端忽略目录 `.runtime/`（不入库），空字符串自动回退至环境变量。
                </span>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  <span>保存并热更新配置</span>
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              {/* Action Buttons Row */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => void handleTestSignature()}
                  disabled={sigTestLoading}
                  className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-[#080B12] px-4 py-3 text-xs font-semibold text-slate-200 transition-colors hover:border-blue-500/50 hover:text-white disabled:opacity-50"
                >
                  {sigTestLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                  ) : (
                    <ShieldCheck className="h-4 w-4 text-blue-400" />
                  )}
                  <span>SHA-1 签名算法自检</span>
                </button>

                <button
                  type="button"
                  onClick={() => void loadDiagnostic()}
                  disabled={diagLoading}
                  className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-[#080B12] px-4 py-3 text-xs font-semibold text-slate-200 transition-colors hover:border-sky-500/50 hover:text-white disabled:opacity-50"
                >
                  {diagLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-sky-400" />
                  ) : (
                    <RefreshCw className="h-4 w-4 text-sky-400" />
                  )}
                  <span>刷新出口 IP 与回调日志</span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleTestImageUpload()}
                  disabled={uploadTestLoading}
                  className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-[#080B12] px-4 py-3 text-xs font-semibold text-slate-200 transition-colors hover:border-emerald-500/50 hover:text-white disabled:opacity-50"
                >
                  {uploadTestLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                  ) : (
                    <UploadCloud className="h-4 w-4 text-emerald-400" />
                  )}
                  <span>实测 Token 与图片素材上传</span>
                </button>
              </div>

              {diagError && (
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3.5 py-2 text-xs text-rose-300">
                  {diagError}
                </div>
              )}

              {/* Diagnostic Overview & Egress IP */}
              {diagInfo && (
                <div className="rounded-xl border border-slate-800 bg-[#080B12] p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-white">
                      <Activity className="h-4 w-4 text-sky-400" />
                      <span>服务器运行状态与公网出口 IP</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded border border-slate-700 bg-[#0D131F] px-2.5 py-1 font-mono text-xs tabular-nums text-amber-300">
                        出口 IP：{diagInfo.egressIp}
                      </span>
                      <button
                        type="button"
                        onClick={() => void copyText('egressIp', diagInfo.egressIp)}
                        className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] text-slate-200 hover:bg-slate-700"
                      >
                        {copiedField === 'egressIp' ? (
                          <Check className="h-3 w-3 text-emerald-400" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                        <span>复制加入白名单</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 text-xs">
                    <div className="rounded-lg border border-slate-800 bg-[#0D131F] p-2.5">
                      <div className="text-[11px] text-slate-400">AppID</div>
                      <div className="mt-1 font-mono text-slate-100">{diagInfo.appIdMasked}</div>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-[#0D131F] p-2.5">
                      <div className="text-[11px] text-slate-400">AppSecret</div>
                      <div className="mt-1 font-mono text-slate-100">{diagInfo.appSecretMasked}</div>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-[#0D131F] p-2.5">
                      <div className="text-[11px] text-slate-400">Token 校验</div>
                      <div className={`mt-1 font-semibold ${diagInfo.tokenConfigured ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {diagInfo.tokenConfigured ? '已启用' : '未配置'}
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-[#0D131F] p-2.5">
                      <div className="text-[11px] text-slate-400">AES 安全加解密</div>
                      <div className={`mt-1 font-semibold ${diagInfo.aesKeyConfigured ? 'text-emerald-400' : 'text-slate-400'}`}>
                        {diagInfo.aesKeyConfigured ? '已配置 43 位密钥' : '未配置（明文模式）'}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Signature Self-Test Output */}
              {sigResult && (
                <div
                  className={`rounded-xl border p-4 text-xs space-y-1.5 ${
                    sigResult.ok
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                      : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                  }`}
                >
                  <div className="font-bold">{sigResult.message}</div>
                  {sigResult.hasToken && (
                    <div className="grid grid-cols-1 gap-1 pt-1 font-mono text-[11px] text-slate-300">
                      <span>timestamp: {sigResult.timestamp}</span>
                      <span>nonce: {sigResult.nonce}</span>
                      <span className="break-all">signature: {sigResult.signature}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Media Upload Test Output */}
              {uploadResult && (
                <div
                  className={`rounded-xl border p-4 text-xs space-y-1.5 ${
                    uploadResult.ok
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                      : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 font-bold">
                    <span>
                      {uploadResult.ok ? '微信 Token 与图片素材上传实测通过' : `实测阻断（阶段：${uploadResult.step}）`}
                    </span>
                    <span className="font-mono text-[11px] opacity-80">{uploadResult.durationMs}ms</span>
                  </div>
                  <div className="leading-relaxed">{uploadResult.hint}</div>
                  {uploadResult.errcode !== undefined && (
                    <div className="font-mono text-[11px] text-rose-300">
                      微信原始错误：errcode={uploadResult.errcode} · errmsg={uploadResult.errmsg}
                    </div>
                  )}
                  {uploadResult.mediaId && (
                    <div className="font-mono text-[11px] text-emerald-300">
                      返回临时素材 media_id：{uploadResult.mediaId}
                    </div>
                  )}
                </div>
              )}

              {/* Recent Webhook Hit Logs & Visitor Trails */}
              {diagInfo && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-slate-800 bg-[#080B12] p-3.5">
                    <div className="mb-2 text-xs font-bold text-slate-200">最近 Webhook 回调命中记录</div>
                    {diagInfo.recentWebhookHits.length === 0 ? (
                      <div className="py-4 text-center text-[11px] text-slate-500">
                        暂无微信服务器回调命中记录
                      </div>
                    ) : (
                      <ul className="max-h-40 space-y-1.5 overflow-y-auto text-[11px]">
                        {diagInfo.recentWebhookHits.map((hit) => (
                          <li
                            key={hit.id}
                            className="flex items-center justify-between gap-2 rounded border border-slate-800 bg-[#0D131F] px-2.5 py-1.5"
                          >
                            <div className="min-w-0 truncate text-slate-300">
                              <span className="mr-1.5 font-mono font-semibold text-sky-400">{hit.method}</span>
                              <span>{hit.detail}</span>
                            </div>
                            <span className="shrink-0 font-mono tabular-nums text-slate-500">
                              {hit.durationMs}ms
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-[#080B12] p-3.5">
                    <div className="mb-2 text-xs font-bold text-slate-200">最近微信访客与配对轨迹</div>
                    {diagInfo.recentVisitors.length === 0 ? (
                      <div className="py-4 text-center text-[11px] text-slate-500">
                        暂无微信扫码配对或查股访客记录
                      </div>
                    ) : (
                      <ul className="max-h-40 space-y-1.5 overflow-y-auto text-[11px]">
                        {diagInfo.recentVisitors.map((v) => (
                          <li
                            key={v.id}
                            className="flex items-center justify-between gap-2 rounded border border-slate-800 bg-[#0D131F] px-2.5 py-1.5"
                          >
                            <div className="min-w-0 truncate text-slate-300">
                              <span className="font-semibold text-white">{v.nickname}</span>
                              <span className="mx-1.5 text-slate-600">·</span>
                              <span>{v.action}</span>
                            </div>
                            <span className="shrink-0 font-mono text-[10px] text-slate-500">
                              {v.maskedOpenid}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
