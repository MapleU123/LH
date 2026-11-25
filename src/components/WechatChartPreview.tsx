import { useState } from 'react';
import { Check, Copy, Download, Lock, RefreshCw } from 'lucide-react';
import type { ExpmaPeriodMode } from '../shared/quantTypes.ts';
import { copyImageUrlToClipboard } from '../utils/imageExport.ts';

interface WechatChartPreviewProps {
  stockCode: string;
  stockName: string;
  periodMode: ExpmaPeriodMode;
  onChangePeriod: (mode: ExpmaPeriodMode) => void;
  isLoggedIn?: boolean;
  onRequireAuth?: (reason: string) => void;
}

export function WechatChartPreview({
  stockCode,
  stockName,
  periodMode,
  onChangePeriod,
  isLoggedIn = true,
  onRequireAuth,
}: WechatChartPreviewProps) {
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const imageUrl = `/api/wechat/stock-chart/${stockCode}.png?period=${periodMode}&v=${refreshNonce}`;

  const handleRefresh = () => {
    setImgLoaded(false);
    setImgError(false);
    setRefreshNonce((n) => n + 1);
  };

  const handleCopy = async () => {
    if (!isLoggedIn && onRequireAuth) {
      onRequireAuth('关注微信公众号登录后即可复制公众号同款 1120px 高清看板');
      return;
    }
    try {
      const mode = await copyImageUrlToClipboard(imageUrl, `${stockCode}-${stockName}-公众号诊断看板.png`);
      setCopyFeedback(mode === 'copied' ? '已复制到剪贴板' : '已下载图片');
      setTimeout(() => setCopyFeedback(null), 2200);
    } catch {
      setCopyFeedback('复制失败');
      setTimeout(() => setCopyFeedback(null), 2200);
    }
  };

  return (
    <section className="rounded-xl border border-slate-800 bg-[#0F1521]">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 px-5 py-3.5">
        <div>
          <h3 className="text-base font-semibold tracking-wide text-slate-100">
            公众号自动回复同源看板（1120px 高清 PNG）
          </h3>
          <p className="mt-0.5 text-xs text-slate-400">
            服务端基于 @resvg/resvg-js 与内置中文字体直出渲染，与微信公众号回复个股诊断图完全同源
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 rounded-lg bg-slate-900 p-1 border border-slate-800">
            <button
              type="button"
              onClick={() => {
                setImgLoaded(false);
                onChangePeriod('long');
              }}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                periodMode === 'long' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              7/21/55/144
            </button>
            <button
              type="button"
              onClick={() => {
                setImgLoaded(false);
                onChangePeriod('short');
              }}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                periodMode === 'short' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              5/10/20/60
            </button>
          </div>

          <button
            type="button"
            onClick={handleRefresh}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-800 whitespace-nowrap"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>刷新渲染</span>
          </button>

          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-800 whitespace-nowrap"
          >
            {copyFeedback ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            ) : !isLoggedIn ? (
              <Lock className="h-3.5 w-3.5 text-amber-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            <span>{copyFeedback ?? '复制原图'}</span>
          </button>

          {isLoggedIn ? (
            <a
              href={imageUrl}
              download={`${stockCode}-${stockName}-组合量化诊断看板.png`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500 whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5" />
              <span>下载 1120px PNG</span>
            </a>
          ) : (
            <button
              type="button"
              onClick={() => onRequireAuth?.('关注微信公众号登录后即可下载 1120px 高清公众号看板 PNG')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500 whitespace-nowrap"
            >
              <Lock className="h-3.5 w-3.5" />
              <span>下载 1120px PNG</span>
            </button>
          )}
        </div>
      </div>

      <div className="bg-[#080B12] p-5">
        {!imgLoaded && !imgError && (
          <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-slate-800 bg-[#0F1521] text-xs text-slate-400">
            正在通过服务端 Resvg 引擎渲染 1120px 高清看板...
          </div>
        )}

        {imgError ? (
          <div className="flex h-52 flex-col items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-300">
            <span>公众号诊断看板 PNG 渲染失败，请点击「刷新渲染」重试。</span>
            <button
              type="button"
              onClick={handleRefresh}
              className="rounded-md bg-slate-900 px-3 py-1.5 font-medium text-red-200 border border-red-500/40 hover:bg-slate-800"
            >
              重新加载
            </button>
          </div>
        ) : (
          <div className={`mx-auto max-w-[1120px] overflow-hidden rounded-lg border border-slate-800 bg-[#0F1521] ${imgLoaded ? 'block' : 'hidden'}`}>
            <img
              src={imageUrl}
              alt={`${stockName} (${stockCode}) 公众号同源组合量化诊断看板`}
              referrerPolicy="no-referrer"
              onLoad={() => {
                setImgLoaded(true);
                setImgError(false);
              }}
              onError={() => {
                setImgError(true);
                setImgLoaded(false);
              }}
              className="block h-auto w-full"
            />
          </div>
        )}
      </div>
    </section>
  );
}
