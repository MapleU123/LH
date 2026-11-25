import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BrainCircuit,
  Clock,
  Image as ImageIcon,
  LineChart as LineChartIcon,
  Loader2,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import { DEFAULT_QUANT_THRESHOLDS, evaluate7Dimensions } from '../shared/quantEngine.ts';
import type {
  AiDiagnosisResult,
  ExpmaPeriodMode,
  QuantDiagnosisResponse,
  QuantRuleThresholds,
  StockSearchItem,
} from '../shared/quantTypes.ts';
import { AiDeepDiagnosisCard } from './AiDeepDiagnosisCard.tsx';
import { Diagnosis7DimGrid } from './Diagnosis7DimGrid.tsx';
import { QuantChartsPanel } from './QuantChartsPanel.tsx';
import { WechatChartPreview } from './WechatChartPreview.tsx';

export interface RecentStockItem {
  code: string;
  name: string;
}

const DEFAULT_RECENT_STOCKS: RecentStockItem[] = [
  { code: '601088', name: '中国神华' },
  { code: '600519', name: '贵州茅台' },
  { code: '600036', name: '招商银行' },
  { code: '002594', name: '比亚迪' },
];

const RECENT_STORAGE_KEY = 'quant_recent_stocks_v1';

function isValidSixDigitAShare(value: string): boolean {
  return /^(60\d{4}|68\d{4}|00\d{4}|30\d{4}|[84]\d{5}|92\d{4})$/.test(value.trim());
}

function loadRecentStocks(): RecentStockItem[] {
  try {
    const raw = localStorage.getItem(RECENT_STORAGE_KEY);
    if (!raw) return DEFAULT_RECENT_STOCKS;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_RECENT_STOCKS;
    const valid = parsed.filter(
      (x): x is RecentStockItem =>
        Boolean(x) && typeof x.code === 'string' && typeof x.name === 'string' && /^\d{6}$/.test(x.code),
    );
    return valid.length > 0 ? valid.slice(0, 8) : DEFAULT_RECENT_STOCKS;
  } catch {
    return DEFAULT_RECENT_STOCKS;
  }
}

interface StockQuickLookupProps {
  mode: 'embedded' | 'modal';
  initialQuery?: string;
  onCloseModal?: () => void;
  isLoggedIn?: boolean;
  onRequireAuth?: (reason: string) => void;
}

export function StockQuickLookup({
  mode,
  initialQuery = '601088',
  onCloseModal,
  isLoggedIn = true,
  onRequireAuth,
}: StockQuickLookupProps) {
  const [searchInput, setSearchInput] = useState(initialQuery);
  const [suggestions, setSuggestions] = useState<StockSearchItem[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [autoQueryEnabled, setAutoQueryEnabled] = useState(true);
  const [recentStocks, setRecentStocks] = useState<RecentStockItem[]>(loadRecentStocks);

  const [viewMode, setViewMode] = useState<'interactive' | 'wechat'>('interactive');
  const [periodMode, setPeriodMode] = useState<ExpmaPeriodMode>('long');
  const [thresholds, setThresholds] = useState<QuantRuleThresholds>(DEFAULT_QUANT_THRESHOLDS);

  const [diagnosisData, setDiagnosisData] = useState<QuantDiagnosisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<AiDiagnosisResult | null>(null);

  const searchBoxRef = useRef<HTMLDivElement>(null);
  const lastFetchedQueryRef = useRef<string>('');
  const suppressAutoRef = useRef(false);

  const saveRecentStock = useCallback((code: string, name: string) => {
    setRecentStocks((prev) => {
      const next = [{ code, name }, ...prev.filter((item) => item.code !== code)].slice(0, 8);
      try {
        localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage quota errors
      }
      return next;
    });
  }, []);

  const runDiagnosis = useCallback(
    async (queryText: string) => {
      const q = queryText.trim();
      if (!q) return;
      lastFetchedQueryRef.current = q;
      setDropdownOpen(false);
      setLoading(true);
      setError(null);
      setAiResult(null);
      setAiError(null);

      try {
        const res = await fetch(`/api/stock/quant-diagnosis?q=${encodeURIComponent(q)}`);
        const json = (await res.json()) as QuantDiagnosisResponse & { error?: string };
        if (!res.ok) {
          throw new Error(json.error || '查询个股量化数据失败');
        }
        setDiagnosisData(json);
        suppressAutoRef.current = true;
        setSearchInput(`${json.quote.code} ${json.quote.name}`);
        saveRecentStock(json.quote.code, json.quote.name);
      } catch (err) {
        setError(err instanceof Error ? err.message : '网络请求异常');
      } finally {
        setLoading(false);
      }
    },
    [saveRecentStock],
  );

  useEffect(() => {
    if (initialQuery) {
      void runDiagnosis(initialQuery);
    }
  }, [initialQuery, runDiagnosis]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (suppressAutoRef.current) {
      suppressAutoRef.current = false;
      return;
    }

    const q = searchInput.trim();
    if (!q) {
      setSuggestions([]);
      setActiveIndex(-1);
      return;
    }

    if (diagnosisData && q === `${diagnosisData.quote.code} ${diagnosisData.quote.name}`) {
      return;
    }

    let cancelled = false;

    const suggestTimer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { items?: StockSearchItem[] };
        const items = data.items ?? [];
        if (cancelled) return;
        setSuggestions(items);
        setActiveIndex(items.length > 0 ? 0 : -1);

        if (autoQueryEnabled) {
          const isExact6 = isValidSixDigitAShare(q);
          const uniqueMatch =
            items.length === 1 &&
            (items[0].code === q ||
              items[0].name.toLowerCase() === q.toLowerCase() ||
              items[0].pinyin.toLowerCase() === q.toLowerCase());

          if (isExact6 || uniqueMatch) {
            const targetCode = isExact6 ? q : items[0].code;
            if (targetCode !== diagnosisData?.quote.code && targetCode !== lastFetchedQueryRef.current) {
              setTimeout(() => {
                if (!cancelled) {
                  void runDiagnosis(targetCode);
                }
              }, 170);
            }
          }
        }
      } catch {
        // Ignore transient autocomplete error
      }
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(suggestTimer);
    };
  }, [searchInput, autoQueryEnabled, diagnosisData, runDiagnosis]);

  const liveEvaluation = useMemo(() => {
    if (!diagnosisData) return null;
    return evaluate7Dimensions({
      quote: diagnosisData.quote,
      expmaLong: diagnosisData.expmaLong,
      expmaShort: diagnosisData.expmaShort,
      activeMode: periodMode,
      volume: diagnosisData.volume,
      kdj: diagnosisData.kdj,
      dividendInfo: diagnosisData.dividendInfo,
      thresholds,
    });
  }, [diagnosisData, periodMode, thresholds]);

  const handleSelectSuggestion = (item: StockSearchItem) => {
    setDropdownOpen(false);
    void runDiagnosis(item.code);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!dropdownOpen) setDropdownOpen(true);
      setActiveIndex((prev) => (suggestions.length === 0 ? -1 : (prev + 1) % suggestions.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!dropdownOpen) setDropdownOpen(true);
      setActiveIndex((prev) =>
        suggestions.length === 0 ? -1 : (prev - 1 + suggestions.length) % suggestions.length,
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (dropdownOpen && activeIndex >= 0 && suggestions[activeIndex]) {
        handleSelectSuggestion(suggestions[activeIndex]);
      } else {
        const cleanCode = searchInput.trim().split(/\s+/)[0];
        void runDiagnosis(cleanCode || searchInput);
      }
    } else if (e.key === 'Escape') {
      setDropdownOpen(false);
    }
  };

  const handleTriggerAiDiagnosis = async () => {
    if (!diagnosisData || !liveEvaluation || aiLoading) return;
    setAiLoading(true);
    setAiError(null);

    try {
      const res = await fetch('/api/stock/ai-diagnosis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stockCode: diagnosisData.quote.code,
          stockName: diagnosisData.quote.name,
          sectorName: diagnosisData.quote.sector,
          price: diagnosisData.quote.price,
          changePercent: diagnosisData.quote.changePercent,
          mainNetInflow: diagnosisData.estimatedMainNetInflowYi,
          superLargeInflow: diagnosisData.estimatedSuperLargeInflowYi,
          orderBookSnippet: liveEvaluation.orderBookSnippet,
        }),
      });
      const json = (await res.json()) as AiDiagnosisResult & { error?: string };
      if (!res.ok) {
        throw new Error(json.error || 'AI 深度诊股请求失败');
      }
      setAiResult(json);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI 深度诊股调用异常');
    } finally {
      setAiLoading(false);
    }
  };

  const quote = diagnosisData?.quote;
  const dividend = diagnosisData?.dividendInfo;
  const isUpDay = (quote?.change ?? 0) >= 0;

  return (
    <div className={mode === 'modal' ? 'space-y-5' : 'space-y-6'}>
      {/* 1. Top Search & Control Bar */}
      <section className="rounded-xl border border-slate-800 bg-[#0F1521] p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold tracking-wide text-slate-100">
              个股速查
            </h2>
            {mode === 'modal' && onCloseModal && (
              <button
                type="button"
                onClick={onCloseModal}
                aria-label="关闭速查弹窗"
                className="rounded-lg border border-slate-700 p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white md:hidden"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* View Mode Switcher */}
            <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-[#080B12] p-1">
              <button
                type="button"
                onClick={() => setViewMode('interactive')}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  viewMode === 'interactive'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <LineChartIcon className="h-3.5 w-3.5" />
                <span>交互双周期图表</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('wechat')}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  viewMode === 'wechat'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <ImageIcon className="h-3.5 w-3.5" />
                <span>公众号自动回复图</span>
              </button>
            </div>

            {mode === 'modal' && onCloseModal && (
              <button
                type="button"
                onClick={onCloseModal}
                className="hidden md:inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white whitespace-nowrap"
              >
                <X className="h-3.5 w-3.5" />
                <span>关闭弹窗</span>
              </button>
            )}
          </div>
        </div>

        {/* Search Box + Auto Query Toggle */}
        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
          <div ref={searchBoxRef} className="relative flex-1">
            <div className="flex items-center rounded-lg border border-slate-700 bg-[#080B12] focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20">
              <Search className="ml-3.5 h-4 w-4 shrink-0 text-slate-500" />
              <input
                type="text"
                value={searchInput}
                onFocus={() => setDropdownOpen(true)}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  setDropdownOpen(true);
                }}
                onKeyDown={handleInputKeyDown}
                placeholder="输入 A 股 6 位代码（沪60/科创68/深00/创业30/北交8·4·92）、简称或拼音首字母（如 zgsh）"
                className="w-full bg-transparent px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput('');
                    setSuggestions([]);
                    setDropdownOpen(true);
                  }}
                  aria-label="清空输入"
                  className="mr-1 rounded p-1 text-slate-500 hover:text-slate-200"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  const cleanCode = searchInput.trim().split(/\s+/)[0];
                  void runDiagnosis(cleanCode || searchInput);
                }}
                className="m-1 rounded-md bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-500 whitespace-nowrap shrink-0"
              >
                立即诊断
              </button>
            </div>

            {/* Autocomplete Dropdown */}
            {dropdownOpen && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-40 mt-1.5 overflow-hidden rounded-lg border border-slate-700 bg-[#0D1320] shadow-2xl">
                <div className="border-b border-slate-800 px-3 py-1.5 text-[11px] text-slate-400">
                  仅展示 A 股股票（已自动过滤 ETF / LOF / 债券 / 指数）· ↑↓ 选择 · Enter 确认 · Esc 关闭
                </div>
                <ul role="listbox" className="divide-y divide-slate-800/80">
                  {suggestions.map((item, idx) => (
                    <li key={item.code}>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectSuggestion(item);
                        }}
                        className={`flex w-full items-center justify-between px-3.5 py-2.5 text-left text-sm transition-colors ${
                          idx === activeIndex ? 'bg-blue-600/20 text-white' : 'hover:bg-slate-800/70'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs font-semibold tabular-nums text-slate-300">
                            {item.code}
                          </span>
                          <span className="font-semibold text-slate-100">{item.name}</span>
                          <span className="font-mono text-xs uppercase text-slate-500">{item.pinyin}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          {item.isHighDividend && (
                            <span className="font-medium text-amber-400">高股息池</span>
                          )}
                          <span aria-hidden="true">·</span>
                          <span>{item.board}</span>
                          <span aria-hidden="true">·</span>
                          <span>{item.sector}</span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Auto Query Switch */}
          <label className="inline-flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-800 bg-[#080B12] px-3.5 py-2.5 text-xs font-medium text-slate-300 select-none shrink-0">
            <input
              type="checkbox"
              checked={autoQueryEnabled}
              onChange={(e) => setAutoQueryEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-blue-500"
            />
            <span className="whitespace-nowrap">输入自动查询（350ms）</span>
          </label>
        </div>

        {/* Recent Search History Strip */}
        <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-3">
          <span className="inline-flex items-center gap-1 text-xs text-slate-400 shrink-0">
            <Clock className="h-3.5 w-3.5" />
            <span>最近查询：</span>
          </span>
          {recentStocks.map((item) => {
            const isCurrent = quote?.code === item.code;
            return (
              <button
                key={item.code}
                type="button"
                onClick={() => void runDiagnosis(item.code)}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors whitespace-nowrap ${
                  isCurrent
                    ? 'border-blue-500/60 bg-blue-600 font-semibold text-white'
                    : 'border-slate-800 bg-[#080B12] text-slate-300 hover:border-slate-700 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <span>{item.name}</span>
                <span className={`font-mono tabular-nums ${isCurrent ? 'text-blue-100' : 'text-slate-500'}`}>
                  {item.code}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Loading & Error States */}
      {loading && (
        <div className="flex items-center justify-center gap-3 rounded-xl border border-slate-800 bg-[#0F1521] py-14 text-sm text-slate-300">
          <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
          <span>正在拉取实时盘口行情与 250 日前复权 K 线并直算双周期 EXPMA / KDJ...</span>
        </div>
      )}

      {error && !loading && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-300">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <div className="font-semibold text-red-200">未能获取该标的量化诊断数据</div>
            <p className="mt-1 text-xs">{error}</p>
          </div>
        </div>
      )}

      {/* Main Populated Dashboard */}
      {diagnosisData && liveEvaluation && quote && !loading && (
        <>
          {/* 2. Header Overview Card */}
          <section className="rounded-xl border border-slate-800 bg-[#0F1521] p-5">
            <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
              <div className="space-y-2">
                <div className="flex flex-wrap items-baseline gap-3">
                  <h2 className="text-2xl font-bold tracking-wide text-white">{quote.name}</h2>
                  <span className="font-mono text-lg font-semibold tabular-nums text-slate-400">
                    {quote.code}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold ${
                      liveEvaluation.activeExpma.trendDirection === 'bullish' ||
                      liveEvaluation.activeExpma.trendDirection === 'leaning_bull'
                        ? 'border border-red-500/30 bg-red-500/15 text-red-300'
                        : liveEvaluation.activeExpma.trendDirection === 'bearish' ||
                            liveEvaluation.activeExpma.trendDirection === 'leaning_bear'
                          ? 'border border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                          : 'border border-amber-500/30 bg-amber-500/15 text-amber-300'
                    }`}
                  >
                    {liveEvaluation.activeExpma.trendLabel}
                  </span>
                </div>

                {/* Unboxed clean metadata line */}
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <span className="font-medium text-slate-200">{quote.board}</span>
                  <span aria-hidden="true" className="text-slate-600">·</span>
                  <span>{quote.sector}</span>
                  <span aria-hidden="true" className="text-slate-600">·</span>
                  <span className="font-mono tabular-nums">PE {quote.pe.toFixed(2)}</span>
                  <span aria-hidden="true" className="text-slate-600">·</span>
                  <span className="font-mono tabular-nums">PB {quote.pb.toFixed(2)}</span>
                  <span aria-hidden="true" className="text-slate-600">·</span>
                  <span className="font-mono tabular-nums">总市值 {quote.totalMarketCapYi.toFixed(0)}亿</span>
                  <span aria-hidden="true" className="text-slate-600">·</span>
                  <span className="font-mono tabular-nums">更新 {quote.updatedAt}</span>
                </div>

                <p className="text-sm font-medium text-slate-200">{liveEvaluation.oneLineSummary}</p>
              </div>

              {/* Right Price + AI CTA */}
              <div className="flex flex-wrap items-center gap-6 lg:justify-end">
                <div className="text-left lg:text-right">
                  <div
                    className={`font-mono text-3xl font-bold tabular-nums ${
                      isUpDay ? 'text-red-400' : 'text-emerald-400'
                    }`}
                  >
                    ¥{quote.price.toFixed(2)}
                  </div>
                  <div
                    className={`mt-0.5 font-mono text-sm font-semibold tabular-nums ${
                      isUpDay ? 'text-red-400' : 'text-emerald-400'
                    }`}
                  >
                    {isUpDay ? '+' : ''}
                    {quote.change.toFixed(2)} ({isUpDay ? '+' : ''}
                    {quote.changePercent.toFixed(2)}%)
                  </div>
                </div>

                <div className="hidden h-10 w-px bg-slate-800 sm:block" />

                <div className="flex items-center gap-4">
                  <div>
                    <div className="text-[11px] text-slate-400">7维综合评分</div>
                    <div className="font-mono text-2xl font-bold tabular-nums text-white">
                      {liveEvaluation.compositeScore}
                      <span className="text-xs font-normal text-slate-500"> / 100</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleTriggerAiDiagnosis}
                    disabled={aiLoading}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-60 whitespace-nowrap shrink-0"
                  >
                    {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BrainCircuit className="h-4 w-4" />}
                    <span>AI 深度诊股</span>
                  </button>
                </div>
              </div>
            </div>

            {/* High-Dividend Linkage Strip */}
            {dividend && dividend.inPool && (
              <div className="mt-4 grid grid-cols-2 gap-4 border-t border-slate-800 pt-4 sm:grid-cols-3 lg:grid-cols-6">
                <div>
                  <div className="text-[11px] text-slate-400">TTM 每股派息</div>
                  <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-slate-100">
                    ¥{dividend.ttmDividendPerShare.toFixed(3)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">当前股息率</div>
                  <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-blue-400">
                    {dividend.currentYield.toFixed(2)}%
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">理想目标股息率</div>
                  <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-slate-100">
                    {dividend.targetYield.toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">目标理想买价</div>
                  <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-slate-100">
                    ¥{dividend.targetBuyPrice.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">距目标还需下跌</div>
                  <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-slate-100">
                    {dividend.isTargetReached ? '0.00%' : `${dividend.dropNeededPercent.toFixed(2)}%`}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">高股息到价状态</div>
                  <div
                    className={`mt-0.5 text-sm font-semibold ${
                      dividend.isTargetReached ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {dividend.isTargetReached ? '已达标（可配置）' : '待回调跟踪'}
                  </div>
                </div>
              </div>
            )}
          </section>

          {viewMode === 'interactive' ? (
            <>
              {/* 3. Interactive Parameter Tuning Bar */}
              <section className="rounded-xl border border-slate-800 bg-[#0F1521] px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-300">EXPMA 周期：</span>
                      <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-[#080B12] p-1">
                        <button
                          type="button"
                          onClick={() => setPeriodMode('long')}
                          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                            periodMode === 'long'
                              ? 'bg-slate-800 text-white'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          中长周期 7/21/55/144
                        </button>
                        <button
                          type="button"
                          onClick={() => setPeriodMode('short')}
                          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                            periodMode === 'short'
                              ? 'bg-slate-800 text-white'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          短周期 5/10/20/60
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <label className="inline-flex items-center gap-1.5 text-slate-400">
                        <span>PE上限</span>
                        <input
                          type="number"
                          min={5}
                          max={300}
                          step={5}
                          value={thresholds.peMax}
                          onChange={(e) =>
                            setThresholds((t) => ({ ...t, peMax: Math.max(1, Number(e.target.value) || 45) }))
                          }
                          className="w-16 rounded-md border border-slate-700 bg-[#080B12] px-2 py-1 font-mono tabular-nums text-slate-100 focus:border-blue-500 focus:outline-none"
                        />
                      </label>

                      <label className="inline-flex items-center gap-1.5 text-slate-400">
                        <span>换手率(%)</span>
                        <input
                          type="number"
                          min={0.1}
                          max={20}
                          step={0.5}
                          value={thresholds.turnoverMin}
                          onChange={(e) =>
                            setThresholds((t) => ({
                              ...t,
                              turnoverMin: Math.max(0.1, Number(e.target.value) || 3),
                            }))
                          }
                          className="w-14 rounded-md border border-slate-700 bg-[#080B12] px-2 py-1 font-mono tabular-nums text-slate-100 focus:border-blue-500 focus:outline-none"
                        />
                        <span>~</span>
                        <input
                          type="number"
                          min={1}
                          max={50}
                          step={0.5}
                          value={thresholds.turnoverMax}
                          onChange={(e) =>
                            setThresholds((t) => ({
                              ...t,
                              turnoverMax: Math.max(t.turnoverMin + 0.5, Number(e.target.value) || 10),
                            }))
                          }
                          className="w-14 rounded-md border border-slate-700 bg-[#080B12] px-2 py-1 font-mono tabular-nums text-slate-100 focus:border-blue-500 focus:outline-none"
                        />
                      </label>

                      <label className="inline-flex items-center gap-1.5 text-slate-400">
                        <span>量比</span>
                        <input
                          type="number"
                          min={0.5}
                          max={5}
                          step={0.1}
                          value={thresholds.volumeRatioMin}
                          onChange={(e) =>
                            setThresholds((t) => ({
                              ...t,
                              volumeRatioMin: Math.max(0.5, Number(e.target.value) || 1.5),
                            }))
                          }
                          className="w-14 rounded-md border border-slate-700 bg-[#080B12] px-2 py-1 font-mono tabular-nums text-slate-100 focus:border-blue-500 focus:outline-none"
                        />
                        <span>~</span>
                        <input
                          type="number"
                          min={1}
                          max={10}
                          step={0.1}
                          value={thresholds.volumeRatioMax}
                          onChange={(e) =>
                            setThresholds((t) => ({
                              ...t,
                              volumeRatioMax: Math.max(t.volumeRatioMin + 0.2, Number(e.target.value) || 3.0),
                            }))
                          }
                          className="w-14 rounded-md border border-slate-700 bg-[#080B12] px-2 py-1 font-mono tabular-nums text-slate-100 focus:border-blue-500 focus:outline-none"
                        />
                      </label>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setPeriodMode('long');
                      setThresholds(DEFAULT_QUANT_THRESHOLDS);
                    }}
                    className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-white whitespace-nowrap"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>恢复默认规则</span>
                  </button>
                </div>
              </section>

              {/* 4. Composite Technical Chart Panel */}
              <QuantChartsPanel
                quote={quote}
                chart60={diagnosisData.chart60}
                periodMode={periodMode}
                activeExpma={liveEvaluation.activeExpma}
                volume={diagnosisData.volume}
                volumeStateLabel={liveEvaluation.volumeStateLabel}
                volumeSynergyLabel={liveEvaluation.volumeSynergyLabel}
                kdj={diagnosisData.kdj}
                thresholds={thresholds}
                isLoggedIn={isLoggedIn}
                onRequireAuth={onRequireAuth}
              />

              {/* 5. 7-Dimension Diagnosis Grid */}
              <Diagnosis7DimGrid
                quote={quote}
                dividendInfo={diagnosisData.dividendInfo}
                volume={diagnosisData.volume}
                kdj={diagnosisData.kdj}
                evaluation={liveEvaluation}
                thresholds={thresholds}
                isLoggedIn={isLoggedIn}
                onRequireAuth={onRequireAuth}
              />

              {/* 6. On-demand AI Deep Diagnosis Panel */}
              <AiDeepDiagnosisCard
                stockName={quote.name}
                stockCode={quote.code}
                loading={aiLoading}
                error={aiError}
                result={aiResult}
                onTrigger={handleTriggerAiDiagnosis}
              />
            </>
          ) : (
            <WechatChartPreview
              stockCode={quote.code}
              stockName={quote.name}
              periodMode={periodMode}
              onChangePeriod={setPeriodMode}
              isLoggedIn={isLoggedIn}
              onRequireAuth={onRequireAuth}
            />
          )}
        </>
      )}
    </div>
  );
}
