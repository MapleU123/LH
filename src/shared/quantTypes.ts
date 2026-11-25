export type MarketExchange = 'sh' | 'sz' | 'bj';

export type BoardType = '沪A主板' | '科创板' | '深A主板' | '创业板' | '北交所';

export type ExpmaPeriodMode = 'long' | 'short';

export type TrendDirection = 'bullish' | 'leaning_bull' | 'neutral' | 'leaning_bear' | 'bearish';

export type DiagnosisStatus = 'pass' | 'warn' | 'fail';

export interface StockSearchItem {
  code: string;
  name: string;
  market: MarketExchange;
  board: BoardType;
  sector: string;
  pinyin: string;
  isHighDividend: boolean;
}

export interface RawKlineBar {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number; // 手
}

export interface LiveStockQuote {
  code: string;
  name: string;
  market: MarketExchange;
  board: BoardType;
  sector: string;
  price: number;
  prevClose: number;
  open: number;
  high: number;
  low: number;
  change: number;
  changePercent: number;
  volume: number; // 手
  amountWan: number; // 成交额(万元)
  turnoverRate: number; // 换手率(%)
  volumeRatio: number; // 实时量比
  pe: number; // 市盈率
  pb: number; // 市净率
  totalMarketCapYi: number; // 总市值(亿元)
  circMarketCapYi: number; // 流通市值(亿元)
  outerVolume: number; // 外盘(手)
  innerVolume: number; // 内盘(手)
  updatedAt: string;
}

export interface HighDividendInfo {
  inPool: boolean;
  ttmDividendPerShare: number;
  currentYield: number; // %
  targetYield: number; // %
  targetBuyPrice: number;
  dropNeededPercent: number; // %
  isTargetReached: boolean;
  payoutNote: string;
}

export interface ExpmaSetValues {
  mode: ExpmaPeriodMode;
  periods: [number, number, number, number];
  latest: [number, number, number, number];
  trendLabel: string; // 多头排列 / 偏多 / 空头排列 / 偏空 / 震荡
  trendDirection: TrendDirection;
  devFromFastPct: number; // 相对第一条均线偏离度(%)
  devFromSecondPct: number; // 相对第二条均线偏离度(%)
}

export interface VolumeMetrics {
  currentVolume: number; // 手
  amountWan: number; // 万元
  turnoverRate: number; // %
  volumeRatio: number;
  avgVol5: number; // 手
  avgVol20: number; // 手
  multipleToAvg5: number;
  volumeStateLabel: string; // 温和放量 / 显著放量异动 / 平稳正常 / 缩量观望
  volumeSynergyLabel: string; // 量价齐升 / 缩量回调等
}

export interface KdjLatest {
  k: number;
  d: number;
  j: number;
  signalLabel: string;
  crossType: 'golden' | 'dead' | 'none';
}

export interface ChartPoint60 {
  date: string;
  shortDate: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  mavol5: number;
  isUp: boolean;
  expma7: number;
  expma21: number;
  expma55: number;
  expma144: number;
  expma5: number;
  expma10: number;
  expma20: number;
  expma60: number;
  k: number;
  d: number;
  j: number;
}

export interface QuantRuleThresholds {
  peMax: number;
  turnoverMin: number;
  turnoverMax: number;
  volumeRatioMin: number;
  volumeRatioMax: number;
}

export interface DiagnosisDimension {
  key:
    | 'expma_trend'
    | 'pullback_confirm'
    | 'valuation_pe_pb'
    | 'fundamental_dividend'
    | 'kdj_signal'
    | 'turnover_activity'
    | 'volume_ratio';
  title: string;
  status: DiagnosisStatus;
  statusLabel: string;
  score: number;
  valueSummary: string;
  detail: string;
}

export interface QuantDiagnosisEvaluation {
  activeExpma: ExpmaSetValues;
  volumeStateLabel: string;
  volumeSynergyLabel: string;
  dimensions: DiagnosisDimension[];
  compositeScore: number;
  passCount: number;
  warnCount: number;
  failCount: number;
  oneLineSummary: string;
  orderBookSnippet: string;
}

export interface QuantDiagnosisResponse {
  quote: LiveStockQuote;
  dividendInfo: HighDividendInfo | null;
  expmaLong: ExpmaSetValues;
  expmaShort: ExpmaSetValues;
  volume: VolumeMetrics;
  kdj: KdjLatest;
  chart60: ChartPoint60[];
  evaluation: QuantDiagnosisEvaluation;
  estimatedMainNetInflowYi: number;
  estimatedSuperLargeInflowYi: number;
  dataSource: 'tencent-live' | 'fallback-snapshot';
}

export interface AiDiagnosisRequest {
  stockCode: string;
  stockName: string;
  sectorName: string;
  price: number;
  changePercent: number;
  mainNetInflow: number;
  superLargeInflow: number;
  orderBookSnippet: string;
}

export interface AiDiagnosisResult {
  mainBehavior: string;
  confidenceScore: number;
  capitalStructure: string;
  shortTermOutlook: string;
  supportPrice: string;
  pressurePrice: string;
  operationTips: string;
}
