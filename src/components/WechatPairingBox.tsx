import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Loader2,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { PairingStatus, UserSession, WechatMpPublicInfo } from '../shared/wechatTypes.ts';
import {
  checkWechatPairingStatus,
  confirmWechatPair,
  fetchWechatPairingCode,
  formatCountdownMmSs,
} from '../utils/wechatPairingService.ts';

interface WechatPairingBoxProps {
  active?: boolean;
  compact?: boolean;
  onLoginSuccess: (session: UserSession) => void;
}

export function WechatPairingBox({
  active = true,
  compact = false,
  onLoginSuccess,
}: WechatPairingBoxProps) {
  const [code, setCode] = useState<string>('');
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [status, setStatus] = useState<PairingStatus>('pending');
  const [loadingCode, setLoadingCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [simulating, setSimulating] = useState(false);

  const [serverMpInfo, setServerMpInfo] = useState<WechatMpPublicInfo>({
    name: '我爱这young',
    wechatId: 'gh_7d39de02f610',
    originalId: 'gh_7d39de02f610',
    qrUrl: '/assets/aistudio/qrcode_gh_7d39de02f610_ff29ce68.jpg',
  });

  const pairedCallbackFiredRef = useRef(false);

  const effectiveName = serverMpInfo.name;
  const effectiveWechatId = serverMpInfo.wechatId;
  const effectiveQrUrl = serverMpInfo.qrUrl || '/assets/aistudio/qrcode_gh_7d39de02f610_ff29ce68.jpg';

  const loadNewCode = useCallback(async () => {
    setLoadingCode(true);
    setError(null);
    pairedCallbackFiredRef.current = false;
    try {
      const res = await fetchWechatPairingCode();
      setCode(res.code);
      setExpiresAt(res.expiresAt);
      setNowMs(Date.now());
      setStatus('pending');
      setServerMpInfo(res.mpInfo);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取配对码失败');
    } finally {
      setLoadingCode(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    if (!code) {
      void loadNewCode();
    }
  }, [active, code, loadNewCode]);

  // Countdown tick every 1s
  useEffect(() => {
    if (!active || !expiresAt || status !== 'pending') return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setNowMs(now);
      if (now >= expiresAt) {
        setStatus('expired');
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [active, expiresAt, status]);

  // Poll check-status every 1.8s
  useEffect(() => {
    if (!active || !code || status !== 'pending') return;
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await checkWechatPairingStatus(code);
        if (cancelled) return;
        if (res.status === 'paired' && res.session) {
          setStatus('paired');
          if (!pairedCallbackFiredRef.current) {
            pairedCallbackFiredRef.current = true;
            onLoginSuccess(res.session);
          }
        } else if (res.status === 'expired' || res.status === 'not_found') {
          setStatus(res.status);
        }
      } catch {
        // Ignore transient poll errors
      }
    };

    const timer = window.setInterval(() => {
      void poll();
    }, 1800);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [active, code, status, onLoginSuccess]);

  const handleCopyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const handleSimulatePair = async () => {
    if (!code || simulating) return;
    setSimulating(true);
    setError(null);
    try {
      const session = await confirmWechatPair({
        code,
        nickname: '量化会员_测试微信',
      });
      setStatus('paired');
      if (!pairedCallbackFiredRef.current) {
        pairedCallbackFiredRef.current = true;
        onLoginSuccess(session);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '模拟配对失败');
    } finally {
      setSimulating(false);
    }
  };

  const countdownText = formatCountdownMmSs(expiresAt, nowMs);

  return (
    <div className="space-y-4">
      <div
        className={`grid grid-cols-1 gap-5 ${
          compact ? 'md:grid-cols-[200px_1fr]' : 'sm:grid-cols-[210px_1fr]'
        } items-center`}
      >
        {/* Left: Official Account QR Code + Profile */}
        <div className="flex flex-col items-center rounded-xl border border-slate-800 bg-[#080B12] p-4 text-center">
          <div className="relative h-36 w-36 overflow-hidden rounded-xl border border-slate-700 bg-white p-1.5">
            <img
              src={effectiveQrUrl}
              alt={`${effectiveName} 公众号二维码`}
              className="h-full w-full rounded-lg object-contain"
            />
          </div>
          <div className="mt-2.5 text-sm font-bold text-white">{effectiveName}</div>
          <div className="mt-0.5 font-mono text-[11px] text-slate-400">
            微信号：{effectiveWechatId}
          </div>
        </div>

        {/* Right: 6-digit Pairing Code & Guidance */}
        <div className="space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-400">
              <QrCode className="h-4 w-4" />
              <span>微信扫码 + 6 位配对码免密登录</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="font-mono tabular-nums text-amber-400">
                有效期 {countdownText}
              </span>
              <span className="text-slate-600">|</span>
              {status === 'paired' ? (
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-400">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  已验证通过
                </span>
              ) : status === 'expired' || status === 'not_found' ? (
                <span className="font-semibold text-rose-400">已过期，请刷新</span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-slate-400">
                  <Loader2 className="h-3 w-3 animate-spin text-sky-400" />
                  等待公众号消息回传...
                </span>
              )}
            </div>
          </div>

          {/* 6-digit code display box */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700/80 bg-[#080B12] px-4 py-3.5">
            <div>
              <div className="text-[11px] text-slate-400">当前 6 位专属配对码</div>
              <div className="mt-1 font-mono text-3xl font-bold tracking-[0.26em] tabular-nums text-white">
                {loadingCode ? '------' : code || '------'}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyCode}
                disabled={!code || loadingCode}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700 hover:text-white disabled:opacity-50 whitespace-nowrap"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? '已复制' : '复制配对码'}</span>
              </button>
              <button
                type="button"
                onClick={loadNewCode}
                disabled={loadingCode}
                title="刷新配对码"
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white disabled:opacity-50 whitespace-nowrap"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingCode ? 'animate-spin' : ''}`} />
                <span>刷新</span>
              </button>
            </div>
          </div>

          {/* Guidance copy */}
          <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 px-3.5 py-2.5 text-xs leading-relaxed text-slate-300">
            扫码关注公众号 → 在公众号聊天窗口直接发送上方 <span className="font-mono font-semibold text-amber-300">6 位配对码</span>，系统将自动识别并即时解锁全部数据与高清导图权限。
          </div>

          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {error}
            </div>
          )}

          {/* Action / Dev Simulate Link */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-[11px] text-slate-500">
            <button
              type="button"
              onClick={handleSimulatePair}
              disabled={!code || simulating || status !== 'pending'}
              className="inline-flex items-center gap-1 rounded-md border border-slate-800 bg-slate-900/90 px-2.5 py-1 text-[11px] font-medium text-slate-300 transition-colors hover:border-slate-700 hover:text-white disabled:opacity-40"
            >
              {simulating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3 text-amber-400" />}
              <span>联调模拟微信回传完成配对</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
