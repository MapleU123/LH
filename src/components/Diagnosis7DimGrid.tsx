import { useRef, useState } from 'react';
import { Check, Copy, Download, Lock } from 'lucide-react';
import type {
  DiagnosisDimension,
  DiagnosisStatus,
  HighDividendInfo,
  KdjLatest,
  LiveStockQuote,
  QuantDiagnosisEvaluation,
  QuantRuleThresholds,
  VolumeMetrics,
} from '../shared/quantTypes.ts';
import { copyElementAsPng, exportElementAsPng } from '../utils/imageExport.ts';

interface Diagnosis7DimGridProps {
  quote: LiveStockQuote;
  dividendInfo: HighDividendInfo | null;
  volume: VolumeMetrics;
  kdj: KdjLatest;
  evaluation: QuantDiagnosisEvaluation;
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

function getRowVisualStyle(status: DiagnosisStatus): {
  dotClass: string;
  badgeClass: string;
} {
  if (status === 'pass') {
    return {
      dotClass: 'bg-rose-500',
      badgeClass: 'border-rose-500/40 bg-rose-500/15 text-rose-300',
    };
  }
  if (status === 'warn') {
    return {
      dotClass: 'bg-amber-400',
      badgeClass: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
    };
  }
  return {
    dotClass: 'bg-emerald-400',
    badgeClass: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
  };
}

function getDimensionDisplay(
  dim: DiagnosisDimension,
  idx: number,
  params: {
    quote: LiveStockQuote;
    dividendInfo: HighDividendInfo | null;
    volume: VolumeMetrics;
    kdj: KdjLatest;
    evaluation: QuantDiagnosisEvaluation;
    thresholds: QuantRuleThresholds;
  },
): { title: string; subtitle: string; badgeText: string } {
  const { quote, dividendInfo, volume, kdj, evaluation, thresholds } = params;
  const activeExpma = evaluation.activeExpma;
  const [p1, p2, p3, p4] = activeExpma.periods;
  const [e1, e2, e3, e4] = activeExpma.latest;

  switch (dim.key) {
    case 'expma_trend':
      return {
        title: `${idx + 1}. EXPMA多空趋势 (${p1}/${p2}/${p3}/${p4})`,
        subtitle: `${p1}:${e1.toFixed(2)} / ${p2}:${e2.toFixed(2)} / ${p3}:${e3.toFixed(2)} / ${p4}:${e4.toFixed(2)}`,
        badgeText: `${activeExpma.trendLabel} · ${dim.statusLabel}`,
      };
    case 'pullback_confirm':
      return {
        title: `${idx + 1}. 均线回踩确认`,
        subtitle: `距 EXPMA${p2}(¥${e2.toFixed(2)}) 偏离 ${activeExpma.devFromSecondPct >= 0 ? '+' : ''}${activeExpma.devFromSecondPct.toFixed(2)}% · EXPMA${p1} ${activeExpma.devFromFastPct >= 0 ? '+' : ''}${activeExpma.devFromFastPct.toFixed(2)}%`,
        badgeText: dim.status === 'pass' ? '良性回踩支撑' : dim.status === 'warn' ? '偏离警示' : '破位待企稳',
      };
    case 'valuation_pe_pb':
      return {
        title: `${idx + 1}. PE/PB估值 (0<PE≤${thresholds.peMax})`,
        subtitle: `动态PE ${quote.pe > 0 ? quote.pe.toFixed(2) : '亏损'}  |  PB ${quote.pb.toFixed(2)}`,
        badgeText: dim.status === 'pass' ? '估值达标' : dim.status === 'warn' ? '估值偏高' : '估值不达标',
      };
    case 'fundamental_dividend':
      if (dividendInfo && dividendInfo.inPool) {
        return {
          title: `${idx + 1}. 基本面与分红体检`,
          subtitle: `每股派息 ¥${dividendInfo.ttmDividendPerShare.toFixed(2)} · 目标买价 ¥${dividendInfo.targetBuyPrice.toFixed(2)}`,
          badgeText: `股息率 ${dividendInfo.currentYield.toFixed(2)}%`,
        };
      }
      return {
        title: `${idx + 1}. 基本面与分红体检`,
        subtitle: `总市值 ${quote.totalMarketCapYi.toFixed(0)}亿 · ${quote.pe > 0 ? `动态PE ${quote.pe.toFixed(2)}` : '盈利承压'}`,
        badgeText: dim.statusLabel,
      };
    case 'kdj_signal':
      return {
        title: `${idx + 1}. KDJ(9,3,3) 动能信号`,
        subtitle: `K:${kdj.k.toFixed(1)}   D:${kdj.d.toFixed(1)}   J:${kdj.j.toFixed(1)}`,
        badgeText: kdj.signalLabel,
      };
    case 'turnover_activity':
      return {
        title: `${idx + 1}. 成交活跃度 (${thresholds.turnoverMin}~${thresholds.turnoverMax}%)`,
        subtitle: `换手率 ${volume.turnoverRate.toFixed(2)}%  |  成交额 ${formatAmountYiOrWan(volume.amountWan)}`,
        badgeText:
          volume.turnoverRate < thresholds.turnoverMin
            ? '低换手观望'
            : volume.turnoverRate > thresholds.turnoverMax
              ? '高换手活跃'
              : '活跃度达标',
      };
    case 'volume_ratio':
      return {
        title: `${idx + 1}. 盘口量比 (${thresholds.volumeRatioMin}~${thresholds.volumeRatioMax})`,
        subtitle: `实时量比 ${volume.volumeRatio.toFixed(2)}  |  较5日均量 ${volume.multipleToAvg5.toFixed(2)}x`,
        badgeText: evaluation.volumeStateLabel,
      };
  }
}

export function Diagnosis7DimGrid({
  quote,
  dividendInfo,
  volume,
  kdj,
  evaluation,
  thresholds,
  isLoggedIn = true,
  onRequireAuth,
}: Diagnosis7DimGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const isUpDay = quote.change >= 0;
  const marketSuffix = quote.market.toUpperCase();
  const shortBoard = formatShortBoardTag(quote.board);
  const activeExpma = evaluation.activeExpma;
  const [p1, p2, p3, p4] = activeExpma.periods;

  const trendPrefix =
    activeExpma.trendDirection === 'bullish' || activeExpma.trendDirection === 'leaning_bull'
      ? '▲'
      : activeExpma.trendDirection === 'bearish' || activeExpma.trendDirection === 'leaning_bear'
        ? '▼'
        : '◆';

  const handleCopy = async () => {
    if (!isLoggedIn && onRequireAuth) {
      onRequireAuth('关注微信公众号登录后即可复制 7 维量化诊断图');
      return;
    }
    if (!gridRef.current || exporting) return;
    setExporting(true);
    try {
      const mode = await copyElementAsPng(gridRef.current);
      setCopyFeedback(mode === 'copied' ? '已复制诊断图' : '已自动下载');
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
      onRequireAuth('关注微信公众号登录后即可导出高清 7 维量化诊断 PNG');
      return;
    }
    if (!gridRef.current || exporting) return;
    setExporting(true);
    try {
      await exportElementAsPng(gridRef.current, `${quote.name}_${quote.code}_7维量化诊断.png`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="rounded-xl border border-slate-800 bg-[#0F1521]">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 px-5 py-3.5">
        <div>
          <h3 className="text-base font-semibold tracking-wide text-slate-100">7 维量化诊断面板</h3>
          <p className="mt-0.5 text-xs text-slate-400">
            单列结构化体检清单 · 支持一键复制或导出高清诊断卡片
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopy}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-800 hover:text-white disabled:opacity-50 whitespace-nowrap"
          >
            {copyFeedback ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            ) : !isLoggedIn ? (
              <Lock className="h-3.5 w-3.5 text-amber-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            <span>{copyFeedback ?? '复制 7 维诊断图'}</span>
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50 whitespace-nowrap"
          >
            {!isLoggedIn ? <Lock className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
            <span>导出图片</span>
          </button>
        </div>
      </div>

      {/* Single-Column Diagnostic & Export Canvas */}
      <div ref={gridRef} className="space-y-4 rounded-b-xl bg-[#070A11] p-5 sm:p-6">
        {/* Top Stock Overview Header */}
        <div className="rounded-xl border border-slate-800 bg-[#0D131F] p-5">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-2xl font-bold tracking-wide text-white">{quote.name}</span>
                <span className="rounded border border-slate-700 bg-slate-800/80 px-2 py-0.5 font-mono text-xs font-medium tabular-nums text-slate-300">
                  {quote.code}.{marketSuffix}
                </span>
                <span className="rounded border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-300">
                  {shortBoard}
                </span>
                <span className="rounded border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-xs font-medium text-violet-300">
                  {quote.sector}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1 rounded border border-rose-500/40 bg-rose-500/15 px-2.5 py-0.5 font-semibold text-rose-300">
                  <span>{trendPrefix}</span>
                  <span>{activeExpma.trendLabel}</span>
                </span>
                <span className="inline-flex items-center rounded border border-sky-500/30 bg-sky-500/10 px-2.5 py-0.5 font-mono tabular-nums text-sky-300">
                  量比 {volume.volumeRatio.toFixed(2)} · {evaluation.volumeStateLabel}
                </span>
                <span className="inline-flex items-center rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 font-mono tabular-nums text-amber-300">
                  EXPMA {p1}/{p2}/{p3}/{p4}
                </span>
              </div>
            </div>

            <div className="text-left sm:text-right">
              <div
                className={`font-mono text-3xl font-bold tabular-nums ${
                  isUpDay ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                ¥{quote.price.toFixed(2)}
              </div>
              <div
                className={`mt-0.5 font-mono text-sm font-semibold tabular-nums ${
                  isUpDay ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                {isUpDay ? '+' : ''}
                {quote.change.toFixed(2)} ({isUpDay ? '+' : ''}
                {quote.changePercent.toFixed(2)}%)
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80 pt-3.5">
            <div className="text-sm text-slate-300">
              量价结论：<span className="font-medium text-slate-100">{evaluation.volumeSynergyLabel}</span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-1.5 font-mono text-sm font-bold tabular-nums text-rose-300">
              <span>评分</span>
              <span className="text-base text-rose-200">{evaluation.compositeScore}/100</span>
            </div>
          </div>
        </div>

        {/* Subheader Rule Line */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5 text-xs">
          <span className="text-sm font-bold text-slate-100">7 维量化诊断结果明细</span>
          <span className="font-mono tabular-nums text-slate-400">
            EXPMA {p1}/{p2}/{p3}/{p4} · PE≤{thresholds.peMax} · 换手{thresholds.turnoverMin}~{thresholds.turnoverMax}% · 量比{thresholds.volumeRatioMin}~{thresholds.volumeRatioMax}
          </span>
        </div>

        {/* Single-Column 7 Dimensions Stack */}
        <div className="flex flex-col gap-3">
          {evaluation.dimensions.map((dim, idx) => {
            const style = getRowVisualStyle(dim.status);
            const display = getDimensionDisplay(dim, idx, {
              quote,
              dividendInfo,
              volume,
              kdj,
              evaluation,
              thresholds,
            });
            return (
              <div
                key={dim.key}
                className="flex flex-col justify-between gap-2 rounded-xl border border-slate-800 bg-[#0D131F] px-5 py-3.5 sm:flex-row sm:items-center"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5">
                    <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${style.dotClass}`} />
                    <span className="text-sm font-bold text-slate-100">{display.title}</span>
                  </div>
                  <div className="pl-5 font-mono text-xs tabular-nums text-slate-300">
                    {display.subtitle}
                  </div>
                </div>

                <div className="pl-5 sm:pl-0 shrink-0">
                  <span
                    className={`inline-flex items-center rounded-md border px-3 py-1 text-xs font-semibold whitespace-nowrap ${style.badgeClass}`}
                  >
                    {display.badgeText}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* High-Dividend Target Price Calculation Callout */}
        {dividendInfo && dividendInfo.inPool && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-sm font-bold text-amber-400">
                <span>◆</span>
                <span>高股息目标买价测算</span>
              </div>
              <span
                className={`font-mono text-sm font-bold tabular-nums ${
                  dividendInfo.isTargetReached ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {dividendInfo.isTargetReached
                  ? '已达理想买价区间'
                  : `还需下跌 ${dividendInfo.dropNeededPercent.toFixed(2)}%`}
              </span>
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs tabular-nums text-slate-200">
              <span>现股息率 {dividendInfo.currentYield.toFixed(2)}%</span>
              <span className="text-slate-600">|</span>
              <span>每股派息 ¥{dividendInfo.ttmDividendPerShare.toFixed(2)}</span>
              <span className="text-slate-600">|</span>
              <span>理想目标股息 {dividendInfo.targetYield.toFixed(2)}%</span>
              <span className="text-slate-600">|</span>
              <span>目标买入价 ¥{dividendInfo.targetBuyPrice.toFixed(2)}</span>
            </div>

            <div className="mt-1.5 text-[11px] text-slate-400">
              计算公式：目标买入价 = 每股派息 ÷ 理想股息率 (%)
            </div>
          </div>
        )}

        {/* Footer Attribution */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-400">
          <span className="font-mono tabular-nums">
            行情时间 {quote.updatedAt} · 由实时行情与量化算法直算生成（非投资建议）
          </span>
          <span className="font-semibold text-amber-400">公众号：我爱这young</span>
        </div>
      </div>
    </section>
  );
}
