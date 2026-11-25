import { buildQuantMetricsFromBars } from '../shared/quantEngine.ts';
import type {
  LiveStockQuote,
  MarketExchange,
  QuantDiagnosisResponse,
  RawKlineBar,
  StockSearchItem,
} from '../shared/quantTypes.ts';
import {
  computeHighDividendInfo,
  DICTIONARY_BY_CODE,
  DIVIDEND_MAP,
  inferBoardAndExchange,
  isAShareStockCode,
  LOCAL_STOCK_DICTIONARY,
  toSearchItem,
} from './stockDictionary.ts';

interface CacheEntry {
  data: QuantDiagnosisResponse;
  expiresAt: number;
}

const diagnosisCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15_000;

function isExcludedSecurityName(name: string): boolean {
  return /ETF|LOF|指数|转债|国债|债券|基金|REITs/i.test(name);
}

/**
 * Search A-share stocks via local dictionary + Tencent Smartbox (filtering out ETF/LOF/bond/index).
 */
export async function searchAShareStocks(rawQuery: string): Promise<StockSearchItem[]> {
  const q = rawQuery.trim();
  if (!q) {
    // Return top 8 high-dividend / featured A-shares by default
    return LOCAL_STOCK_DICTIONARY.slice(0, 8)
      .map(toSearchItem)
      .filter((x): x is StockSearchItem => x !== null);
  }

  const qLower = q.toLowerCase();
  const seen = new Set<string>();
  const results: StockSearchItem[] = [];

  // 1. Local dictionary matches first (preserves rich sector metadata)
  const localMatches = LOCAL_STOCK_DICTIONARY.filter(
    (s) =>
      s.code.includes(qLower) ||
      s.name.toLowerCase().includes(qLower) ||
      s.pinyin.toLowerCase().includes(qLower),
  );

  localMatches.sort((a, b) => {
    const aExact = a.code === qLower || a.name.toLowerCase() === qLower || a.pinyin === qLower ? 0 : 1;
    const bExact = b.code === qLower || b.name.toLowerCase() === qLower || b.pinyin === qLower ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;
    const aStarts = a.code.startsWith(qLower) || a.pinyin.startsWith(qLower) ? 0 : 1;
    const bStarts = b.code.startsWith(qLower) || b.pinyin.startsWith(qLower) ? 0 : 1;
    return aStarts - bStarts;
  });

  for (const item of localMatches) {
    if (results.length >= 8) break;
    const mapped = toSearchItem(item);
    if (mapped && !seen.has(mapped.code)) {
      seen.add(mapped.code);
      results.push(mapped);
    }
  }

  // 2. Query Tencent Smartbox live A-share suggest endpoint to cover full market
  if (results.length < 8) {
    try {
      const url = `https://smartbox.gtimg.cn/s3/?v=2&q=${encodeURIComponent(q)}&t=gp`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (resp.ok) {
        const text = await resp.text();
        const match = text.match(/v_hint="([^"]*)"/);
        if (match && match[1]) {
          const rows = match[1].split('^');
          for (const row of rows) {
            if (results.length >= 8) break;
            const parts = row.split('~');
            if (parts.length < 5) continue;
            const [mkt, code, unicodeName, pinyin, secType] = parts;
            // Keep only A-share equities (exclude ETF/LOF/bond/index/HK/US)
            if (mkt !== 'sh' && mkt !== 'sz' && mkt !== 'bj') continue;
            if (!secType.startsWith('GP')) continue;
            if (!isAShareStockCode(code)) continue;
            const decodedName = decodeUnicodeEscapes(unicodeName).replace(/\s+/g, '');
            if (!decodedName || isExcludedSecurityName(decodedName)) continue;
            if (seen.has(code)) continue;

            const dictEntry = DICTIONARY_BY_CODE.get(code);
            const boardInfo = inferBoardAndExchange(code);
            if (!boardInfo) continue;

            seen.add(code);
            results.push({
              code,
              name: dictEntry?.name ?? decodedName,
              market: boardInfo.market,
              board: boardInfo.board,
              sector: dictEntry?.sector ?? inferSectorFallback(boardInfo.board),
              pinyin: dictEntry?.pinyin ?? (pinyin || '').toLowerCase(),
              isHighDividend: DIVIDEND_MAP.has(code),
            });
          }
        }
      }
    } catch {
      // Fall back silently to local dictionary results if upstream times out
    }
  }

  return results.slice(0, 8);
}

function decodeUnicodeEscapes(str: string): string {
  return str.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function inferSectorFallback(board: string): string {
  if (board === '科创板') return '硬科技成长';
  if (board === '创业板') return '新兴产业';
  if (board === '北交所') return '专精特新';
  return 'A股核心标的';
}

async function resolveTargetStock(rawQuery: string): Promise<{
  code: string;
  market: MarketExchange;
  name?: string;
  sector?: string;
}> {
  const q = rawQuery.trim();
  const cleanCodeMatch = q.match(/\b(\d{6})\b/);
  if (cleanCodeMatch) {
    const code = cleanCodeMatch[1];
    const boardInfo = inferBoardAndExchange(code);
    if (boardInfo) {
      const dict = DICTIONARY_BY_CODE.get(code);
      return {
        code,
        market: boardInfo.market,
        name: dict?.name,
        sector: dict?.sector,
      };
    }
  }

  const candidates = await searchAShareStocks(q);
  if (candidates.length > 0) {
    const top = candidates[0];
    return {
      code: top.code,
      market: top.market,
      name: top.name,
      sector: top.sector,
    };
  }

  throw new Error(`未找到匹配的 A 股标的：“${q}”，请输入 6 位有效 A 股代码、股票简称或拼音首字母。`);
}

async function fetchTencentQuote(market: MarketExchange, code: string): Promise<LiveStockQuote | null> {
  const symbol = `${market}${code}`;
  const url = `https://qt.gtimg.cn/q=${symbol}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(4500) });
  if (!resp.ok) return null;

  const buffer = await resp.arrayBuffer();
  const decoded = new TextDecoder('gbk').decode(buffer);
  const match = decoded.match(/="([^"]+)"/);
  if (!match || !match[1]) return null;

  const f = match[1].split('~');
  if (f.length < 48) return null;

  const name = (f[1] || '').trim();
  const parsedCode = (f[2] || code).trim();
  const price = parseFloat(f[3]) || 0;
  const prevClose = parseFloat(f[4]) || price;
  const open = parseFloat(f[5]) || price;
  const volume = parseFloat(f[6]) || 0; // 手
  const outerVolume = parseFloat(f[7]) || 0;
  const innerVolume = parseFloat(f[8]) || 0;
  const change = parseFloat(f[31]) || Math.round((price - prevClose) * 100) / 100;
  const changePercent =
    parseFloat(f[32]) || (prevClose > 0 ? Math.round(((price - prevClose) / prevClose) * 10000) / 100 : 0);
  const high = parseFloat(f[33]) || price;
  const low = parseFloat(f[34]) || price;
  const amountWan = parseFloat(f[37]) || 0;
  const turnoverRate = parseFloat(f[38]) || 0;
  const pe = parseFloat(f[39]) || 0;
  const circMarketCapYi = parseFloat(f[44]) || 0;
  const totalMarketCapYi = parseFloat(f[45]) || circMarketCapYi;
  const pb = parseFloat(f[46]) || 0;
  const volumeRatio = parseFloat(f[49]) || 0;

  const boardInfo = inferBoardAndExchange(parsedCode) ?? { market, board: '沪A主板' as const };
  const dict = DICTIONARY_BY_CODE.get(parsedCode);

  const rawTime = f[30] || '';
  const formattedTime =
    rawTime.length === 14
      ? `${rawTime.slice(0, 4)}-${rawTime.slice(4, 6)}-${rawTime.slice(6, 8)} ${rawTime.slice(8, 10)}:${rawTime.slice(10, 12)}`
      : new Date().toISOString().slice(0, 16).replace('T', ' ');

  return {
    code: parsedCode,
    name: dict?.name ?? name,
    market: boardInfo.market,
    board: boardInfo.board,
    sector: dict?.sector ?? inferSectorFallback(boardInfo.board),
    price,
    prevClose,
    open,
    high,
    low,
    change,
    changePercent,
    volume,
    amountWan,
    turnoverRate,
    volumeRatio,
    pe,
    pb,
    totalMarketCapYi,
    circMarketCapYi,
    outerVolume,
    innerVolume,
    updatedAt: formattedTime,
  };
}

async function fetchTencentQfqKlines(market: MarketExchange, code: string): Promise<RawKlineBar[]> {
  const symbol = `${market}${code}`;
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},day,,,250,qfq`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!resp.ok) return [];

  const json = (await resp.json()) as {
    code?: number;
    data?: Record<string, { qfqday?: unknown[][]; day?: unknown[][] }>;
  };

  const stockData = json?.data?.[symbol];
  const rawRows = stockData?.qfqday ?? stockData?.day ?? [];
  if (!Array.isArray(rawRows)) return [];

  const bars: RawKlineBar[] = [];
  for (const row of rawRows) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const date = String(row[0]);
    const open = parseFloat(String(row[1]));
    const close = parseFloat(String(row[2]));
    const high = parseFloat(String(row[3]));
    const low = parseFloat(String(row[4]));
    const volume = parseFloat(String(row[5]));
    if (!date || !Number.isFinite(close) || close <= 0) continue;
    bars.push({ date, open, close, high, low, volume: Number.isFinite(volume) ? volume : 0 });
  }
  return bars;
}

function generateDeterministicFallbackBars(basePrice: number, days = 250): RawKlineBar[] {
  const bars: RawKlineBar[] = [];
  let price = Math.max(2, basePrice * 0.88);
  const now = new Date();
  for (let i = days; i >= 1; i--) {
    const d = new Date(now.getTime() - i * 86_400_000);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const drift = (basePrice - price) * 0.025 + Math.sin(i * 0.23) * (basePrice * 0.008);
    const open = Math.round(price * 100) / 100;
    const close = Math.round(Math.max(1, open + drift) * 100) / 100;
    const high = Math.round(Math.max(open, close) * 1.012 * 100) / 100;
    const low = Math.round(Math.min(open, close) * 0.988 * 100) / 100;
    bars.push({
      date: d.toISOString().slice(0, 10),
      open,
      close,
      high,
      low,
      volume: Math.round(180_000 + Math.abs(Math.cos(i * 0.41)) * 120_000),
    });
    price = close;
  }
  return bars;
}

export async function getQuantDiagnosis(rawQuery: string): Promise<QuantDiagnosisResponse> {
  const target = await resolveTargetStock(rawQuery);
  const cached = diagnosisCache.get(target.code);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const [liveQuote, fetchedBars] = await Promise.all([
    fetchTencentQuote(target.market, target.code).catch(() => null),
    fetchTencentQfqKlines(target.market, target.code).catch(() => []),
  ]);

  let dataSource: 'tencent-live' | 'fallback-snapshot' = 'tencent-live';
  let quote: LiveStockQuote;

  if (liveQuote && liveQuote.price > 0) {
    quote = liveQuote;
  } else {
    dataSource = 'fallback-snapshot';
    const boardInfo = inferBoardAndExchange(target.code) ?? {
      market: target.market,
      board: '沪A主板' as const,
    };
    const fallbackPrice = fetchedBars.length > 0 ? fetchedBars[fetchedBars.length - 1].close : 35.0;
    const prevClose =
      fetchedBars.length > 1 ? fetchedBars[fetchedBars.length - 2].close : fallbackPrice;
    quote = {
      code: target.code,
      name: target.name ?? target.code,
      market: boardInfo.market,
      board: boardInfo.board,
      sector: target.sector ?? inferSectorFallback(boardInfo.board),
      price: fallbackPrice,
      prevClose,
      open: fallbackPrice,
      high: fallbackPrice,
      low: fallbackPrice,
      change: Math.round((fallbackPrice - prevClose) * 100) / 100,
      changePercent:
        prevClose > 0 ? Math.round(((fallbackPrice - prevClose) / prevClose) * 10000) / 100 : 0,
      volume: fetchedBars[fetchedBars.length - 1]?.volume ?? 200_000,
      amountWan: 85_000,
      turnoverRate: 1.25,
      volumeRatio: 1.15,
      pe: 18.5,
      pb: 1.85,
      totalMarketCapYi: 1500,
      circMarketCapYi: 1200,
      outerVolume: 105_000,
      innerVolume: 95_000,
      updatedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
    };
  }

  let bars: RawKlineBar[] = [...fetchedBars];
  if (bars.length < 30) {
    dataSource = 'fallback-snapshot';
    bars = generateDeterministicFallbackBars(quote.price, 250);
  } else {
    // Sync last bar with real-time quote for intraday accuracy
    const quoteDate = quote.updatedAt.slice(0, 10);
    const lastBar = bars[bars.length - 1];
    if (lastBar && lastBar.date === quoteDate) {
      bars[bars.length - 1] = {
        ...lastBar,
        open: quote.open > 0 ? quote.open : lastBar.open,
        close: quote.price,
        high: quote.high > 0 ? Math.max(lastBar.high, quote.high) : lastBar.high,
        low: quote.low > 0 ? Math.min(lastBar.low, quote.low) : lastBar.low,
        volume: quote.volume > 0 ? quote.volume : lastBar.volume,
      };
    } else if (quoteDate > (lastBar?.date ?? '') && quote.price > 0 && quote.volume > 0) {
      bars.push({
        date: quoteDate,
        open: quote.open > 0 ? quote.open : quote.price,
        close: quote.price,
        high: quote.high > 0 ? quote.high : quote.price,
        low: quote.low > 0 ? quote.low : quote.price,
        volume: quote.volume,
      });
    }
  }

  const dividendInfo = computeHighDividendInfo(quote.code, quote.price);
  const metrics = buildQuantMetricsFromBars({
    quote,
    bars,
    dividendInfo,
  });

  // Estimate main net inflow & super large inflow from live active buy/sell order book ticks
  const totalBookVol = quote.outerVolume + quote.innerVolume;
  const imbalanceRatio = totalBookVol > 0 ? (quote.outerVolume - quote.innerVolume) / totalBookVol : 0;
  const amountYi = quote.amountWan / 10_000;
  const estimatedMainNetInflowYi = Math.round(imbalanceRatio * amountYi * 0.85 * 100) / 100;
  const estimatedSuperLargeInflowYi = Math.round(estimatedMainNetInflowYi * 0.62 * 100) / 100;

  const response: QuantDiagnosisResponse = {
    quote,
    dividendInfo,
    expmaLong: metrics.expmaLong,
    expmaShort: metrics.expmaShort,
    volume: metrics.volume,
    kdj: metrics.kdj,
    chart60: metrics.chart60,
    evaluation: metrics.evaluation,
    estimatedMainNetInflowYi,
    estimatedSuperLargeInflowYi,
    dataSource,
  };

  diagnosisCache.set(target.code, {
    data: response,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return response;
}
