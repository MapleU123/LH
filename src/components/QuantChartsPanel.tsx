import { useRef, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Check, Copy, Download, Image as ImageIcon, Lock } from 'lucide-react';
import type {
  ChartPoint60,
  ExpmaPeriodMode,
  ExpmaSetValues,
  KdjLatest,
  LiveStockQuote,
  QuantRuleThresholds,
  VolumeMetrics,
} from '../shared/quantTypes.ts';
import { copyElementAsPng, exportElementAsPng } from '../utils/imageExport.ts';

interface QuantChartsPanelProps {
  quote: LiveStockQuote;
  chart60: ChartPoint60[];
  periodMode: ExpmaPeriodMode;
  activeExpma: ExpmaSetValues;
  volume: VolumeMetrics;
  volumeStateLabel: string;
  volumeSynergyLabel: string;
  kdj: KdjLatest;
  thresholds: QuantRuleThresholds;
  isLoggedIn?: boolean;
  onRequireAuth?: (reason: string) => void;
}

function formatShortBoardTag(board: string): string {
  if (board.startsWith('沪A')) return '沪A';
  if (board.startsWith('深A')) return '深A';
  return board;
}

function formatAmountYiOrWan(amountWan: number): string {
  if (amountWan >= 10000) {
    return `${(amountWan / 10000).toFixed(2)}亿`;
  }
  return `${amountWan.toFixed(0)}万`;
}

function formatVolumeWanShou(volShou: number): string {
  if (volShou >= 10000) {
    return `${(volShou / 10000).toFixed(2)}万手`;
  }
  return `${Math.round(volShou)}手`;
}

export function QuantChartsPanel({
  quote,
  chart60,
  periodMode,
  activeExpma,
  volume,
  volumeStateLabel,
  kdj,
  isLoggedIn = true,
  onRequireAuth,
}: QuantChartsPanelProps) {
  const exportRef = useRef<HTMLDivElement>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const [p1, p2, p3, p4] = activeExpma.periods;
  const k1 = periodMode === 'long' ? 'expma7' : 'expma5';
  const k2 = periodMode === 'long' ? 'expma21' : 'expma10';
  const k3 = periodMode === 'long' ? 'expma55' : 'expma20';
  const k4 = periodMode === 'long' ? 'expma144' : 'expma60';

  const isUpDay = quote.change >= 0;
  const marketSuffix = quote.market.toUpperCase();
  const shortBoard = formatShortBoardTag(quote.board);
  const latestClose = chart60[chart60.length - 1]?.close ?? quote.price;
  const maxChartVol = Math.max(...chart60.map((d) => Math.max(d.volume, d.mavol5)), 1);

  const trendPrefix =
    activeExpma.trendDirection === 'bullish' || activeExpma.trendDirection === 'leaning_bull'
      ? '▲'
      : activeExpma.trendDirection === 'bearish' || activeExpma.trendDirection === 'leaning_bear'
        ? '▼'
        : '◆';

  const trendBadgeStyle =
    activeExpma.trendDirection === 'bullish' || activeExpma.trendDirection === 'leaning_bull'
      ? 'border-red-500/40 bg-red-500/15 text-red-300'
      : activeExpma.trendDirection === 'bearish' || activeExpma.trendDirection === 'leaning_bear'
        ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
        : 'border-amber-500/40 bg-amber-500/15 text-amber-300';

  const handleCopy = async () => {
    if (!isLoggedIn && onRequireAuth) {
      onRequireAuth('关注微信公众号登录后即可复制高清组合技术图');
      return;
    }
    if (!exportRef.current || exporting) return;
    setExporting(true);
    try {
      const mode = await copyElementAsPng(exportRef.current);
      setCopyFeedback(mode === 'copied' ? '已复制组合图' : '已自动下载');
      setTimeout(() => setCopyFeedback(null), 2200);
    } catch {
      setCopyFeedback('复制失败');
      setTimeout(() => setCopyFeedback(null), 2200);
    } finally {
      setExporting(false);
    }
  };

  const handleDownload = async () => {
    if (!isLoggedIn && onRequireAuth) {
      onRequireAuth('关注微信公众号登录后即可导出高清组合图片 PNG');
      return;
    }
    if (!exportRef.current || exporting) return;
    setExporting(true);
    try {
      await exportElementAsPng(
        exportRef.current,
        `${quote.name}_${quote.code}_EXPMA_KDJ组合图.png`,
      );
    } finally {
      setExporting(false);
    }
  };

  const tooltipStyle = {
    backgroundColor: '#090D16',
    borderRadius: '8px',
    border: '1px solid #334155',
    color: '#F1F5F9',
    fontSize: '12px',
    fontFamily: 'JetBrains Mono, Noto Sans SC, sans-serif',
  };

  return (
    <section className="space-y-4">
      {/* 1. Top Control Bar (matches page layout screenshot) */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-[#0D131F] px-4 py-3">
        <div className="flex items-center gap-2.5 text-sm font-semibold text-slate-100">
          <ImageIcon className="h-4 w-4 shrink-0 text-amber-400" />
          <span>
            组合技术图表：近 60 日收盘价 + EXPMA ({p1}/{p2}/{p3}/{p4}) · 成交量 · KDJ (9,3,3)
          </span>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleCopy}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3.5 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700 hover:text-white disabled:opacity-50 whitespace-nowrap"
          >
            {copyFeedback ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            ) : !isLoggedIn ? (
              <Lock className="h-3.5 w-3.5 text-amber-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            <span>{copyFeedback ?? '复制组合图'}</span>
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
          >
            {!isLoggedIn ? <Lock className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
            <span>导出组合图片</span>
          </button>
        </div>
      </div>

      {/* 2. Row 1: Full-width EXPMA Card */}
      <div className="rounded-xl border border-slate-800 bg-[#0D131F] p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-bold text-slate-100">
            近 60 日收盘价与四线 EXPMA ({p1}/{p2}/{p3}/{p4})
          </span>
          <div className="flex flex-wrap items-center gap-3 font-mono text-xs tabular-nums">
            <span className="text-yellow-400">E{p1}:{activeExpma.latest[0].toFixed(2)}</span>
            <span className="text-sky-400">E{p2}:{activeExpma.latest[1].toFixed(2)}</span>
            <span className="text-violet-400">E{p3}:{activeExpma.latest[2].toFixed(2)}</span>
            <span className="text-rose-400">E{p4}:{activeExpma.latest[3].toFixed(2)}</span>
          </div>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chart60} syncId="quant-sync" margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" />
              <XAxis
                dataKey="shortDate"
                tick={{ fontSize: 11, fill: '#94A3B8' }}
                minTickGap={22}
                stroke="#334155"
              />
              <YAxis
                orientation="left"
                domain={['auto', 'auto']}
                tick={{ fontSize: 11, fill: '#94A3B8' }}
                width={46}
                stroke="#334155"
                tickFormatter={(v: number) => v.toFixed(1)}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                itemStyle={{ color: '#E2E8F0' }}
                formatter={(value: unknown, name: unknown) => [Number(value).toFixed(2), String(name)]}
                labelFormatter={(label) => `交易日 ${String(label)}`}
              />
              <Line type="monotone" dataKey="close" name="收盘价" stroke="#F8FAFC" strokeWidth={2.2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey={k1} name={`EXPMA${p1}`} stroke="#FACC15" strokeWidth={1.6} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey={k2} name={`EXPMA${p2}`} stroke="#38BDF8" strokeWidth={1.6} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey={k3} name={`EXPMA${p3}`} stroke="#A78BFA" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey={k4} name={`EXPMA${p4}`} stroke="#F87171" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 3. Row 2: 2-Column Side-by-Side (Volume Left | KDJ Right) */}
      <div className="grid grid-cols-1 gap-4 min-[460px]:grid-cols-2">
        {/* Left: Volume */}
        <div className="min-w-0 rounded-xl border border-slate-800 bg-[#0D131F] p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-slate-100">成交量 (手)</span>
            <span className="font-mono text-xs font-semibold tabular-nums text-yellow-400">
              量比 {volume.volumeRatio.toFixed(2)}
            </span>
          </div>

          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chart60} syncId="quant-sync" margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="shortDate"
                  tick={{ fontSize: 11, fill: '#94A3B8' }}
                  minTickGap={26}
                  stroke="#334155"
                />
                <YAxis hide domain={[0, maxChartVol]} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={{ color: '#E2E8F0' }}
                  formatter={(value: unknown, name: unknown) => [
                    `${Number(value).toLocaleString()} 手`,
                    String(name),
                  ]}
                  labelFormatter={(label) => `交易日 ${String(label)}`}
                />
                <Bar dataKey="volume" name="成交量" isAnimationActive={false} radius={[2, 2, 0, 0]}>
                  {chart60.map((entry, idx) => (
                    <Cell key={`vol-${idx}`} fill={entry.isUp ? '#EF4444' : '#10B981'} fillOpacity={0.9} />
                  ))}
                </Bar>
                <Line
                  type="monotone"
                  dataKey="mavol5"
                  name="MAVOL5"
                  stroke="#EAB308"
                  strokeWidth={1.4}
                  strokeDasharray="3 3"
                  dot={false}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right: KDJ(9,3,3) */}
        <div className="min-w-0 rounded-xl border border-slate-800 bg-[#0D131F] p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-slate-100">KDJ (9,3,3)</span>
            <span className="text-xs font-semibold text-sky-400">{kdj.signalLabel}</span>
          </div>

          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart60} syncId="quant-sync" margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" />
                <XAxis
                  dataKey="shortDate"
                  tick={{ fontSize: 11, fill: '#94A3B8' }}
                  minTickGap={26}
                  stroke="#334155"
                />
                <YAxis
                  orientation="left"
                  domain={['auto', 'auto']}
                  ticks={[-10, 20, 50, 80, 110]}
                  tick={{ fontSize: 11, fill: '#94A3B8' }}
                  width={36}
                  stroke="#334155"
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={{ color: '#E2E8F0' }}
                  formatter={(value: unknown, name: unknown) => [Number(value).toFixed(2), String(name)]}
                  labelFormatter={(label) => `交易日 ${String(label)}`}
                />
                <ReferenceLine y={80} stroke="#EF4444" strokeOpacity={0.5} strokeDasharray="4 3" />
                <ReferenceLine y={20} stroke="#22C55E" strokeOpacity={0.5} strokeDasharray="4 3" />
                <Line type="monotone" dataKey="k" name="K" stroke="#FACC15" strokeWidth={1.6} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="d" name="D" stroke="#38BDF8" strokeWidth={1.6} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="j" name="J" stroke="#F472B6" strokeWidth={1.8} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 4. Hidden Dedicated 1040px Export Template (captured cleanly by html-to-image on Copy/Download) */}
      <div className="h-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div ref={exportRef} className="w-[1040px] space-y-4 bg-[#070A11] p-6">
          {/* Export Header Banner */}
          <div className="rounded-xl border border-slate-800 bg-[#0D131F] px-5 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl font-bold tracking-wide text-white">{quote.name}</span>
                  <span className="rounded border border-slate-700 bg-slate-800/80 px-2 py-0.5 font-mono text-xs font-medium tabular-nums text-slate-300">
                    {quote.code}.{marketSuffix}
                  </span>
                  <span className="rounded border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-300">
                    {shortBoard}
                  </span>
                  <span className="rounded border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-xs font-medium text-violet-300">
                    A股
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className={`inline-flex items-center gap-1 rounded border px-2.5 py-0.5 font-semibold ${trendBadgeStyle}`}>
                    <span>{trendPrefix}</span>
                    <span>{activeExpma.trendLabel}</span>
                  </span>
                  <span className="inline-flex items-center rounded border border-sky-500/30 bg-sky-500/10 px-2.5 py-0.5 font-mono tabular-nums text-sky-300">
                    量比 {volume.volumeRatio.toFixed(2)} · {volumeStateLabel}
                  </span>
                  <span className="inline-flex items-center rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 font-mono tabular-nums text-amber-300">
                    EXPMA {p1}/{p2}/{p3}/{p4} ({activeExpma.trendLabel})
                  </span>
                </div>
              </div>

              <div className="text-right">
                <div className={`font-mono text-3xl font-bold tabular-nums ${isUpDay ? 'text-red-400' : 'text-emerald-400'}`}>
                  ¥{quote.price.toFixed(2)}
                </div>
                <div className={`mt-0.5 font-mono text-sm font-semibold tabular-nums ${isUpDay ? 'text-red-400' : 'text-emerald-400'}`}>
                  {isUpDay ? '+' : ''}
                  {quote.change.toFixed(2)} ({isUpDay ? '+' : ''}
                  {quote.changePercent.toFixed(2)}%)
                </div>
                <div className="mt-1 font-mono text-[11px] tabular-nums text-slate-400">
                  行情时间：{quote.updatedAt}
                </div>
              </div>
            </div>
          </div>

          {/* Export Sub-Panel 1: Close + 4 EXPMA */}
          <div className="rounded-xl border border-slate-800 bg-[#0D131F] px-5 py-4">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-slate-100">
                近 60 日收盘价与四线 EXPMA ({p1}/{p2}/{p3}/{p4})
              </span>
              <span className="text-xs text-slate-400">A股视觉：红涨绿跌</span>
            </div>

            <div className="mb-2 flex items-center gap-4 font-mono text-xs tabular-nums">
              <span className="inline-flex items-center gap-1.5 text-slate-100">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-white" />
                收盘价: ¥{latestClose.toFixed(2)}
              </span>
              <span className="inline-flex items-center gap-1.5 text-yellow-400">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-yellow-400" />
                E{p1}: {activeExpma.latest[0].toFixed(2)}
              </span>
              <span className="inline-flex items-center gap-1.5 text-sky-400">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-sky-400" />
                E{p2}: {activeExpma.latest[1].toFixed(2)}
              </span>
              <span className="inline-flex items-center gap-1.5 text-violet-400">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-violet-400" />
                E{p3}: {activeExpma.latest[2].toFixed(2)}
              </span>
              <span className="inline-flex items-center gap-1.5 text-rose-400">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-400" />
                E{p4}: {activeExpma.latest[3].toFixed(2)}
              </span>
            </div>

            <LineChart width={950} height={225} data={chart60} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
              <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="shortDate" tick={{ fontSize: 11, fill: '#94A3B8' }} minTickGap={45} axisLine={{ stroke: '#1E293B' }} tickLine={false} />
              <YAxis orientation="right" domain={['auto', 'auto']} tick={{ fontSize: 11, fill: '#94A3B8' }} width={52} axisLine={false} tickLine={false} tickFormatter={(v: number) => v.toFixed(2)} />
              <Line type="monotone" dataKey="close" stroke="#F8FAFC" strokeWidth={2.2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey={k1} stroke="#FACC15" strokeWidth={1.6} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey={k2} stroke="#38BDF8" strokeWidth={1.6} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey={k3} stroke="#A78BFA" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey={k4} stroke="#F87171" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </LineChart>
          </div>

          {/* Export Sub-Panel 2: Volume + MAVOL5 */}
          <div className="rounded-xl border border-slate-800 bg-[#0D131F] px-5 py-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-slate-100">成交量 (手) + 5日均量线 (MAVOL5)</span>
              <div className="flex items-center gap-2 font-mono text-xs tabular-nums text-amber-400">
                <span>成交 {formatVolumeWanShou(volume.currentVolume)}</span>
                <span className="text-slate-600">|</span>
                <span>成交额 {formatAmountYiOrWan(volume.amountWan)}</span>
                <span className="text-slate-600">|</span>
                <span>量比 {volume.volumeRatio.toFixed(2)}</span>
                <span className="text-slate-600">|</span>
                <span>较5日均量 {volume.multipleToAvg5.toFixed(2)}x</span>
              </div>
            </div>

            <ComposedChart width={950} height={135} data={chart60} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
              <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="shortDate" hide />
              <YAxis
                orientation="right"
                domain={[0, maxChartVol]}
                ticks={[0, maxChartVol]}
                tick={{ fontSize: 11, fill: '#94A3B8' }}
                width={58}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => (v === 0 ? '0' : formatVolumeWanShou(v))}
              />
              <Bar dataKey="volume" isAnimationActive={false} radius={[2, 2, 0, 0]}>
                {chart60.map((entry, idx) => (
                  <Cell key={`exp-vol-${idx}`} fill={entry.isUp ? '#EF4444' : '#10B981'} fillOpacity={0.9} />
                ))}
              </Bar>
              <Line type="monotone" dataKey="mavol5" stroke="#EAB308" strokeWidth={1.6} strokeDasharray="3 3" dot={false} isAnimationActive={false} />
            </ComposedChart>
          </div>

          {/* Export Sub-Panel 3: KDJ(9,3,3) */}
          <div className="rounded-xl border border-slate-800 bg-[#0D131F] px-5 py-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-4">
                <span className="text-sm font-bold text-slate-100">KDJ (9, 3, 3) 动能指标</span>
                <div className="flex items-center gap-3 font-mono text-xs tabular-nums">
                  <span className="inline-flex items-center gap-1.5 text-yellow-400">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-yellow-400" />
                    K: {kdj.k.toFixed(2)}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-sky-400">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-sky-400" />
                    D: {kdj.d.toFixed(2)}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-pink-400">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-pink-400" />
                    J: {kdj.j.toFixed(2)}
                  </span>
                </div>
              </div>
              <span className="text-xs font-medium text-slate-300">
                当前信号：{kdj.signalLabel}
              </span>
            </div>

            <LineChart width={950} height={135} data={chart60} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
              <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="shortDate" hide />
              <YAxis orientation="right" domain={['auto', 'auto']} ticks={[20, 50, 80]} tick={{ fontSize: 11, fill: '#94A3B8' }} width={52} axisLine={false} tickLine={false} />
              <ReferenceLine y={80} stroke="#EF4444" strokeOpacity={0.55} strokeDasharray="4 3" />
              <ReferenceLine y={50} stroke="#334155" strokeOpacity={0.6} />
              <ReferenceLine y={20} stroke="#22C55E" strokeOpacity={0.55} strokeDasharray="4 3" />
              <Line type="monotone" dataKey="k" stroke="#FACC15" strokeWidth={1.6} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="d" stroke="#38BDF8" strokeWidth={1.6} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="j" stroke="#F472B6" strokeWidth={1.8} dot={false} isAnimationActive={false} />
            </LineChart>
          </div>

          {/* Export Footer Note */}
          <div className="flex items-center justify-between gap-2 px-1 pt-0.5 text-[11px] text-slate-400">
            <span>说明：近60日前复权数据由实时行情与量化算法直算生成，仅供研究参考，不构成投资建议。</span>
            <span className="font-semibold text-amber-400">公众号：我爱这young</span>
          </div>
        </div>
      </div>
    </section>
  );
}
