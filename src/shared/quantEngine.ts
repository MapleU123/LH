import type {
  ChartPoint60,
  DiagnosisDimension,
  ExpmaPeriodMode,
  ExpmaSetValues,
  HighDividendInfo,
  KdjLatest,
  LiveStockQuote,
  QuantDiagnosisEvaluation,
  QuantRuleThresholds,
  RawKlineBar,
  TrendDirection,
  VolumeMetrics,
} from './quantTypes.ts';

export const DEFAULT_QUANT_THRESHOLDS: QuantRuleThresholds = {
  peMax: 45,
  turnoverMin: 3,
  turnoverMax: 10,
  volumeRatioMin: 1.5,
  volumeRatioMax: 3.0,
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Standard A-share EXPMA recursive sequence:
 * EXPMA_0 = close_0
 * EXPMA_t = (2 / (N + 1)) * close_t + (1 - 2 / (N + 1)) * EXPMA_{t-1}
 */
export function computeExpmaSeries(closes: number[], period: number): number[] {
  if (closes.length === 0) return [];
  const k = 2 / (period + 1);
  const res = new Array<number>(closes.length);
  res[0] = closes[0];
  for (let i = 1; i < closes.length; i++) {
    res[i] = k * closes[i] + (1 - k) * res[i - 1];
  }
  return res.map(round2);
}

/**
 * Standard KDJ(9, 3, 3) calculation
 */
export function computeKdjSeries(bars: RawKlineBar[]): {
  kSeries: number[];
  dSeries: number[];
  jSeries: number[];
} {
  const n = bars.length;
  const kSeries = new Array<number>(n);
  const dSeries = new Array<number>(n);
  const jSeries = new Array<number>(n);

  let prevK = 50;
  let prevD = 50;

  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i - 8);
    let low9 = Infinity;
    let high9 = -Infinity;
    for (let j = start; j <= i; j++) {
      if (bars[j].low < low9) low9 = bars[j].low;
      if (bars[j].high > high9) high9 = bars[j].high;
    }
    const rsv = high9 === low9 ? 50 : ((bars[i].close - low9) / (high9 - low9)) * 100;
    const k = (2 / 3) * prevK + (1 / 3) * rsv;
    const d = (2 / 3) * prevD + (1 / 3) * k;
    const j = 3 * k - 2 * d;

    kSeries[i] = round2(k);
    dSeries[i] = round2(d);
    jSeries[i] = round2(j);

    prevK = k;
    prevD = d;
  }

  return { kSeries, dSeries, jSeries };
}

export function classifyExpmaTrend(
  mode: ExpmaPeriodMode,
  periods: [number, number, number, number],
  latest: [number, number, number, number],
  price: number,
): ExpmaSetValues {
  const [e1, e2, e3, e4] = latest;
  const devFromFastPct = e1 > 0 ? round2(((price - e1) / e1) * 100) : 0;
  const devFromSecondPct = e2 > 0 ? round2(((price - e2) / e2) * 100) : 0;

  let trendLabel = '震荡';
  let trendDirection: TrendDirection = 'neutral';

  if (e1 > e2 && e2 > e3 && e3 > e4 && price >= e2 * 0.99) {
    trendLabel = '多头排列';
    trendDirection = 'bullish';
  } else if (e1 < e2 && e2 < e3 && e3 < e4 && price <= e2 * 1.01) {
    trendLabel = '空头排列';
    trendDirection = 'bearish';
  } else if ((e1 > e2 && price > e3) || (price > e1 && price > e2 && e2 > e4)) {
    trendLabel = '偏多';
    trendDirection = 'leaning_bull';
  } else if ((e1 < e2 && price < e3) || (price < e1 && price < e2 && e2 < e4)) {
    trendLabel = '偏空';
    trendDirection = 'leaning_bear';
  }

  return {
    mode,
    periods,
    latest: [round2(e1), round2(e2), round2(e3), round2(e4)],
    trendLabel,
    trendDirection,
    devFromFastPct,
    devFromSecondPct,
  };
}

export function analyzeKdj(kSeries: number[], dSeries: number[], jSeries: number[]): KdjLatest {
  const len = kSeries.length;
  if (len === 0) {
    return { k: 50, d: 50, j: 50, signalLabel: '数据不足', crossType: 'none' };
  }
  const k = kSeries[len - 1];
  const d = dSeries[len - 1];
  const j = jSeries[len - 1];

  let crossType: 'golden' | 'dead' | 'none' = 'none';
  if (len >= 2) {
    const prevK = kSeries[len - 2];
    const prevD = dSeries[len - 2];
    if (prevK <= prevD && k > d) {
      crossType = 'golden';
    } else if (prevK >= prevD && k < d) {
      crossType = 'dead';
    }
  }

  let signalLabel = '中性震荡';
  if (crossType === 'golden') {
    signalLabel = j < 35 ? '低位金叉共振' : 'KDJ 金叉上行';
  } else if (crossType === 'dead') {
    signalLabel = j > 75 ? '高位死叉承压' : 'KDJ 死叉回落';
  } else if (j >= 95 || (k >= 80 && d >= 80)) {
    signalLabel = 'J 值超买警示';
  } else if (j <= 5 || (k <= 20 && d <= 20)) {
    signalLabel = '超卖区待反弹';
  } else if (k > d && j > k) {
    signalLabel = '动能偏强延伸';
  } else if (k < d && j < k) {
    signalLabel = '动能偏弱整理';
  }

  return {
    k: round2(k),
    d: round2(d),
    j: round2(j),
    signalLabel,
    crossType,
  };
}

export function formatWechatTrendConclusion(direction: TrendDirection): string {
  switch (direction) {
    case 'bullish':
      return '多头趋势';
    case 'leaning_bull':
      return '偏多趋势';
    case 'bearish':
      return '空头趋势';
    case 'leaning_bear':
      return '偏空趋势';
    case 'neutral':
    default:
      return '震荡整理';
  }
}

export function formatWechatVolumeStateLabel(volumeRatio: number): string {
  if (volumeRatio > 3.0) {
    return '显著放量异动(>3.0)';
  }
  if (volumeRatio >= 1.5) {
    return '温和放量';
  }
  if (volumeRatio >= 0.8) {
    return '量能平稳正常';
  }
  return '缩量观望(<0.8)';
}

export function analyzeVolumeState(
  volumeRatio: number,
  changePercent: number,
  thresholds: QuantRuleThresholds = DEFAULT_QUANT_THRESHOLDS,
): { volumeStateLabel: string; volumeSynergyLabel: string } {
  let volumeStateLabel = '平稳正常';
  if (volumeRatio > thresholds.volumeRatioMax) {
    volumeStateLabel = '显著放量异动';
  } else if (volumeRatio >= thresholds.volumeRatioMin) {
    volumeStateLabel = '温和放量';
  } else if (volumeRatio < 0.8) {
    volumeStateLabel = '缩量观望';
  }

  let volumeSynergyLabel = '量价平稳过渡';
  if (changePercent >= 0.4) {
    if (volumeRatio >= thresholds.volumeRatioMin) {
      volumeSynergyLabel = volumeRatio > thresholds.volumeRatioMax ? '放量急升（注意筹码分歧）' : '量价齐升（资金承接有力）';
    } else if (volumeRatio < 0.8) {
      volumeSynergyLabel = '缩量上行（注意后续补量）';
    } else {
      volumeSynergyLabel = '温和推升（量能配合平稳）';
    }
  } else if (changePercent <= -0.4) {
    if (volumeRatio >= thresholds.volumeRatioMin) {
      volumeSynergyLabel = '放量下挫（谨防资金派发）';
    } else if (volumeRatio < 0.8) {
      volumeSynergyLabel = '缩量回踩（抛压逐步减轻）';
    } else {
      volumeSynergyLabel = '常规回调（静待止跌信号）';
    }
  } else {
    if (volumeRatio >= thresholds.volumeRatioMin) {
      volumeSynergyLabel = '放量滞涨换手';
    } else if (volumeRatio < 0.8) {
      volumeSynergyLabel = '缩量窄幅蓄势';
    } else {
      volumeSynergyLabel = '平量横盘震荡';
    }
  }

  return { volumeStateLabel, volumeSynergyLabel };
}

export function evaluate7Dimensions(params: {
  quote: LiveStockQuote;
  expmaLong: ExpmaSetValues;
  expmaShort: ExpmaSetValues;
  activeMode: ExpmaPeriodMode;
  volume: VolumeMetrics;
  kdj: KdjLatest;
  dividendInfo: HighDividendInfo | null;
  thresholds: QuantRuleThresholds;
}): QuantDiagnosisEvaluation {
  const { quote, expmaLong, expmaShort, activeMode, volume, kdj, dividendInfo, thresholds } = params;
  const activeExpma = activeMode === 'long' ? expmaLong : expmaShort;
  const [p1, p2, p3, p4] = activeExpma.periods;
  const [e1, e2, e3, e4] = activeExpma.latest;
  const { volumeStateLabel, volumeSynergyLabel } = analyzeVolumeState(
    volume.volumeRatio,
    quote.changePercent,
    thresholds,
  );

  // 1) EXPMA 多空趋势
  let dim1: DiagnosisDimension;
  if (activeExpma.trendDirection === 'bullish') {
    dim1 = {
      key: 'expma_trend',
      title: 'EXPMA 多空趋势',
      status: 'pass',
      statusLabel: '通过',
      score: 95,
      valueSummary: `${activeExpma.trendLabel} (${p1}/${p2}/${p3}/${p4})`,
      detail: `现价 ${quote.price.toFixed(2)} 站稳多头均线簇上方，EXPMA${p1}(${e1.toFixed(2)}) > EXPMA${p2}(${e2.toFixed(2)}) > EXPMA${p3}(${e3.toFixed(2)}) > EXPMA${p4}(${e4.toFixed(2)})。`,
    };
  } else if (activeExpma.trendDirection === 'leaning_bull') {
    dim1 = {
      key: 'expma_trend',
      title: 'EXPMA 多空趋势',
      status: 'pass',
      statusLabel: '通过',
      score: 80,
      valueSummary: `${activeExpma.trendLabel} (${p1}/${p2}/${p3}/${p4})`,
      detail: `短中期均线偏多运行，现价位于 EXPMA${p2}(${e2.toFixed(2)}) 与 EXPMA${p3}(${e3.toFixed(2)}) 支撑结构之上。`,
    };
  } else if (activeExpma.trendDirection === 'neutral') {
    dim1 = {
      key: 'expma_trend',
      title: 'EXPMA 多空趋势',
      status: 'warn',
      statusLabel: '警示',
      score: 58,
      valueSummary: `${activeExpma.trendLabel} (${p1}/${p2}/${p3}/${p4})`,
      detail: `均线系统交织缠绕，EXPMA${p1}(${e1.toFixed(2)}) 与 EXPMA${p2}(${e2.toFixed(2)}) 尚未形成单边发散方向。`,
    };
  } else {
    dim1 = {
      key: 'expma_trend',
      title: 'EXPMA 多空趋势',
      status: 'fail',
      statusLabel: '不通过',
      score: activeExpma.trendDirection === 'bearish' ? 25 : 40,
      valueSummary: `${activeExpma.trendLabel} (${p1}/${p2}/${p3}/${p4})`,
      detail: `均线呈${activeExpma.trendLabel}格局，现价承压于 EXPMA${p2}(${e2.toFixed(2)}) 下方，右侧反转信号尚未确认。`,
    };
  }

  // 2) 均线回踩确认（相对 EXPMA21/EXPMA20 与 EXPMA7/EXPMA5 偏离度）
  const devFast = activeExpma.devFromFastPct;
  const devSecond = activeExpma.devFromSecondPct;
  let dim2: DiagnosisDimension;
  if (devSecond >= -2.0 && devSecond <= 5.5 && devFast >= -2.0) {
    dim2 = {
      key: 'pullback_confirm',
      title: '均线回踩确认',
      status: 'pass',
      statusLabel: '通过',
      score: 90,
      valueSummary: `EXPMA${p2} ${devSecond >= 0 ? '+' : ''}${devSecond.toFixed(2)}% · EXPMA${p1} ${devFast >= 0 ? '+' : ''}${devFast.toFixed(2)}%`,
      detail: `股价贴近 EXPMA${p2}(${e2.toFixed(2)}) 合理买点区间，回踩支撑有效且未明显超买偏离。`,
    };
  } else if (devSecond > 5.5 && devSecond <= 12) {
    dim2 = {
      key: 'pullback_confirm',
      title: '均线回踩确认',
      status: 'warn',
      statusLabel: '警示',
      score: 62,
      valueSummary: `偏离 EXPMA${p2} +${devSecond.toFixed(2)}%`,
      detail: `短线相对 EXPMA${p2} 正乖离偏大，追高性价比下降，宜等回踩 EXPMA${p1}(${e1.toFixed(2)}) 附近低吸。`,
    };
  } else if (devSecond < -2.0 && devSecond >= -5.5) {
    dim2 = {
      key: 'pullback_confirm',
      title: '均线回踩确认',
      status: 'warn',
      statusLabel: '警示',
      score: 55,
      valueSummary: `低于 EXPMA${p2} ${devSecond.toFixed(2)}%`,
      detail: `股价小幅跌破 EXPMA${p2}(${e2.toFixed(2)})，需观察能否在 3 个交易日内放量收复。`,
    };
  } else {
    dim2 = {
      key: 'pullback_confirm',
      title: '均线回踩确认',
      status: 'fail',
      statusLabel: '不通过',
      score: 30,
      valueSummary: `偏离 EXPMA${p2} ${devSecond >= 0 ? '+' : ''}${devSecond.toFixed(2)}%`,
      detail:
        devSecond > 12
          ? `相对 EXPMA${p2} 乖离率超过 12%，存在技术性均值回归与获利回吐压力。`
          : `显著跌破 EXPMA${p2} 生命线，破位幅度 ${Math.abs(devSecond).toFixed(2)}%，暂不具备左侧接飞刀条件。`,
    };
  }

  // 3) PE/PB 估值区间
  let dim3: DiagnosisDimension;
  if (quote.pe <= 0) {
    dim3 = {
      key: 'valuation_pe_pb',
      title: 'PE/PB 估值区间',
      status: 'fail',
      statusLabel: '不通过',
      score: 25,
      valueSummary: `PE 亏损 · PB ${quote.pb.toFixed(2)}`,
      detail: `当前动态市盈率为负或暂无盈利支撑，市净率 ${quote.pb.toFixed(2)} 倍，估值安全垫偏弱。`,
    };
  } else if (quote.pe <= thresholds.peMax * 0.65 && quote.pb <= 4.5) {
    dim3 = {
      key: 'valuation_pe_pb',
      title: 'PE/PB 估值区间',
      status: 'pass',
      statusLabel: '通过',
      score: 92,
      valueSummary: `PE ${quote.pe.toFixed(2)} · PB ${quote.pb.toFixed(2)}`,
      detail: `PE 显著低于上限阈值 ${thresholds.peMax}，PB ${quote.pb.toFixed(2)} 倍处于稳健估值带，具备较高安全边际。`,
    };
  } else if (quote.pe <= thresholds.peMax) {
    dim3 = {
      key: 'valuation_pe_pb',
      title: 'PE/PB 估值区间',
      status: quote.pb > 6 ? 'warn' : 'pass',
      statusLabel: quote.pb > 6 ? '警示' : '通过',
      score: quote.pb > 6 ? 68 : 82,
      valueSummary: `PE ${quote.pe.toFixed(2)} · PB ${quote.pb.toFixed(2)}`,
      detail:
        quote.pb > 6
          ? `PE 位于上限 ${thresholds.peMax} 以内，但 PB(${quote.pb.toFixed(2)}) 溢价较高。`
          : `PE(${quote.pe.toFixed(2)}) 与 PB(${quote.pb.toFixed(2)}) 均处于规则上限 ${thresholds.peMax} 内，估值合理。`,
    };
  } else if (quote.pe <= thresholds.peMax * 1.45) {
    dim3 = {
      key: 'valuation_pe_pb',
      title: 'PE/PB 估值区间',
      status: 'warn',
      statusLabel: '警示',
      score: 52,
      valueSummary: `PE ${quote.pe.toFixed(2)} (> ${thresholds.peMax})`,
      detail: `当前 PE 超出设定上限 ${thresholds.peMax}，估值处于偏高水平，需高景气业绩兑现消化。`,
    };
  } else {
    dim3 = {
      key: 'valuation_pe_pb',
      title: 'PE/PB 估值区间',
      status: 'fail',
      statusLabel: '不通过',
      score: 28,
      valueSummary: `PE ${quote.pe.toFixed(2)} (高估)`,
      detail: `市盈率大幅高于规则上限 ${thresholds.peMax}，估值透支明显，回调容错空间较窄。`,
    };
  }

  // 4) 基本面与分红体检
  let dim4: DiagnosisDimension;
  if (dividendInfo && dividendInfo.inPool) {
    if (dividendInfo.isTargetReached || dividendInfo.currentYield >= 4.0) {
      dim4 = {
        key: 'fundamental_dividend',
        title: '基本面与分红体检',
        status: 'pass',
        statusLabel: '通过',
        score: 94,
        valueSummary: `股息率 ${dividendInfo.currentYield.toFixed(2)}% · 每股派 ${dividendInfo.ttmDividendPerShare.toFixed(2)}元`,
        detail: dividendInfo.isTargetReached
          ? `已进入高股息理想买价区(≤¥${dividendInfo.targetBuyPrice.toFixed(2)})，当前股息率达 ${dividendInfo.currentYield.toFixed(2)}%，现金流与分红回报厚实。`
          : `位列高股息核心池，TTM 股息率 ${dividendInfo.currentYield.toFixed(2)}%，距目标买价 ¥${dividendInfo.targetBuyPrice.toFixed(2)} 仅差 ${dividendInfo.dropNeededPercent.toFixed(2)}%。`,
      };
    } else {
      dim4 = {
        key: 'fundamental_dividend',
        title: '基本面与分红体检',
        status: 'warn',
        statusLabel: '警示',
        score: 70,
        valueSummary: `股息率 ${dividendInfo.currentYield.toFixed(2)}% (目标 ${dividendInfo.targetYield.toFixed(1)}%)`,
        detail: `属于高股息监测标的，当前股息率略低于理想目标 ${dividendInfo.targetYield.toFixed(1)}%，还需回调 ${dividendInfo.dropNeededPercent.toFixed(2)}% 至 ¥${dividendInfo.targetBuyPrice.toFixed(2)} 性价比更优。`,
      };
    }
  } else if (quote.pe > 0 && quote.totalMarketCapYi >= 300) {
    dim4 = {
      key: 'fundamental_dividend',
      title: '基本面与分红体检',
      status: 'pass',
      statusLabel: '通过',
      score: 78,
      valueSummary: `总市值 ${quote.totalMarketCapYi.toFixed(0)}亿 · 盈利稳定`,
      detail: `属于行业中大盘盈利标的（PE ${quote.pe.toFixed(2)}），基本面稳定性良好，未命中高股息预设池则侧重成长/景气跟踪。`,
    };
  } else if (quote.pe > 0) {
    dim4 = {
      key: 'fundamental_dividend',
      title: '基本面与分红体检',
      status: 'warn',
      statusLabel: '警示',
      score: 62,
      valueSummary: `总市值 ${quote.totalMarketCapYi.toFixed(0)}亿 · 盈利`,
      detail: `具备正盈利基础，但未纳入高股息核心池且市值体量偏中小盘，需关注季报现金流与分红连续性。`,
    };
  } else {
    dim4 = {
      key: 'fundamental_dividend',
      title: '基本面与分红体检',
      status: 'fail',
      statusLabel: '不通过',
      score: 30,
      valueSummary: `盈利承压 · 无高股息支撑`,
      detail: `当前动态盈利能力偏弱且缺乏高股息安全垫保护，基本面风险系数较高。`,
    };
  }

  // 5) KDJ(9,3,3) 信号
  let dim5: DiagnosisDimension;
  if (kdj.crossType === 'golden' || (kdj.k > kdj.d && kdj.j >= 15 && kdj.j <= 88)) {
    dim5 = {
      key: 'kdj_signal',
      title: 'KDJ(9,3,3) 信号',
      status: 'pass',
      statusLabel: '通过',
      score: kdj.crossType === 'golden' ? 92 : 82,
      valueSummary: `${kdj.signalLabel} (K ${kdj.k.toFixed(1)} / D ${kdj.d.toFixed(1)} / J ${kdj.j.toFixed(1)})`,
      detail:
        kdj.crossType === 'golden'
          ? `K 线上穿 D 线形成金叉，短线多头动能拐点明确，J 值 ${kdj.j.toFixed(1)} 仍具上行空间。`
          : `KDJ 维持多头排列向上发散，短线动能健康，尚未触及极端超买区。`,
    };
  } else if (kdj.j > 95 || (kdj.k > 80 && kdj.d > 80) || kdj.j < 12) {
    dim5 = {
      key: 'kdj_signal',
      title: 'KDJ(9,3,3) 信号',
      status: 'warn',
      statusLabel: '警示',
      score: 58,
      valueSummary: `${kdj.signalLabel} (J ${kdj.j.toFixed(1)})`,
      detail:
        kdj.j > 88
          ? `J 值达 ${kdj.j.toFixed(1)} 进入超买钝化警示带，谨防短线冲高回落。`
          : `J 值下探至 ${kdj.j.toFixed(1)} 超卖区间，存在技术性反抽需求，等待金叉确认更稳妥。`,
    };
  } else {
    dim5 = {
      key: 'kdj_signal',
      title: 'KDJ(9,3,3) 信号',
      status: 'fail',
      statusLabel: '不通过',
      score: kdj.crossType === 'dead' ? 32 : 45,
      valueSummary: `${kdj.signalLabel} (K ${kdj.k.toFixed(1)} / D ${kdj.d.toFixed(1)} / J ${kdj.j.toFixed(1)})`,
      detail:
        kdj.crossType === 'dead'
          ? `K 线下穿 D 线触发死叉，短线动能转弱，需防范惯性下探。`
          : `K 线位于 D 线下方弱势发散，短线动量偏空，宜待指标企稳拐头。`,
    };
  }

  // 6) 成交活跃度（换手率）
  const tr = volume.turnoverRate;
  let dim6: DiagnosisDimension;
  if (tr >= thresholds.turnoverMin && tr <= thresholds.turnoverMax) {
    dim6 = {
      key: 'turnover_activity',
      title: '成交活跃度（换手率）',
      status: 'pass',
      statusLabel: '通过',
      score: 90,
      valueSummary: `换手 ${tr.toFixed(2)}% (区间 ${thresholds.turnoverMin}%~${thresholds.turnoverMax}%)`,
      detail: `日换手率 ${tr.toFixed(2)}% 精准落入活跃配置带，筹码流动性充沛且未出现情绪过热。`,
    };
  } else if (tr >= thresholds.turnoverMin * 0.45 && tr < thresholds.turnoverMin) {
    const isMegaCap = quote.totalMarketCapYi >= 2500;
    dim6 = {
      key: 'turnover_activity',
      title: '成交活跃度（换手率）',
      status: isMegaCap ? 'pass' : 'warn',
      statusLabel: isMegaCap ? '通过' : '警示',
      score: isMegaCap ? 80 : 62,
      valueSummary: `换手 ${tr.toFixed(2)}% (温和锁仓)`,
      detail: isMegaCap
        ? `权重蓝筹大盘股筹码锁定度高，换手 ${tr.toFixed(2)}% 属机构长线锁仓常态，成交额 ${volume.amountWan.toFixed(0)} 万元流动性充足。`
        : `换手率低于设定下限 ${thresholds.turnoverMin}%，短线交投活跃度偏温和，弹性略受限。`,
    };
  } else if (tr > thresholds.turnoverMax && tr <= thresholds.turnoverMax * 1.5) {
    dim6 = {
      key: 'turnover_activity',
      title: '成交活跃度（换手率）',
      status: 'warn',
      statusLabel: '警示',
      score: 56,
      valueSummary: `换手 ${tr.toFixed(2)}% (偏高换手)`,
      detail: `换手率高于上限 ${thresholds.turnoverMax}%，盘面多空分歧加剧，日内波动幅度可能放大。`,
    };
  } else {
    dim6 = {
      key: 'turnover_activity',
      title: '成交活跃度（换手率）',
      status: quote.totalMarketCapYi >= 3000 && tr >= 0.1 ? 'warn' : 'fail',
      statusLabel: quote.totalMarketCapYi >= 3000 && tr >= 0.1 ? '警示' : '不通过',
      score: quote.totalMarketCapYi >= 3000 && tr >= 0.1 ? 65 : 35,
      valueSummary: `换手 ${tr.toFixed(2)}% (${tr < thresholds.turnoverMin ? '低换手' : '过热换手'})`,
      detail:
        tr < thresholds.turnoverMin
          ? `换手率仅 ${tr.toFixed(2)}%，显著低于规则下限 ${thresholds.turnoverMin}%，场内资金参与度偏淡。`
          : `换手率高达 ${tr.toFixed(2)}%，超出上限 1.5 倍，短线筹码剧烈松动，谨防情绪见顶。`,
    };
  }

  // 7) 盘口量比状态
  const vr = volume.volumeRatio;
  let dim7: DiagnosisDimension;
  if (vr >= thresholds.volumeRatioMin && vr <= thresholds.volumeRatioMax) {
    dim7 = {
      key: 'volume_ratio',
      title: '盘口量比状态',
      status: 'pass',
      statusLabel: '通过',
      score: 92,
      valueSummary: `量比 ${vr.toFixed(2)} · ${volumeStateLabel}`,
      detail: `实时量比落入 ${thresholds.volumeRatioMin}~${thresholds.volumeRatioMax} 理想温和放量区，较5日均量 ${volume.multipleToAvg5.toFixed(2)} 倍，${volumeSynergyLabel}。`,
    };
  } else if (vr >= 0.8 && vr < thresholds.volumeRatioMin) {
    dim7 = {
      key: 'volume_ratio',
      title: '盘口量比状态',
      status: 'warn',
      statusLabel: '警示',
      score: 68,
      valueSummary: `量比 ${vr.toFixed(2)} · ${volumeStateLabel}`,
      detail: `量能处于 0.8~${thresholds.volumeRatioMin} 平稳常态，${volumeSynergyLabel}，后续突破需观察能否温和补量。`,
    };
  } else if (vr > thresholds.volumeRatioMax && vr <= thresholds.volumeRatioMax * 1.6) {
    dim7 = {
      key: 'volume_ratio',
      title: '盘口量比状态',
      status: 'warn',
      statusLabel: '警示',
      score: 58,
      valueSummary: `量比 ${vr.toFixed(2)} · ${volumeStateLabel}`,
      detail: `量比突破 ${thresholds.volumeRatioMax} 呈现放量异动，${volumeSynergyLabel}，需确认主力是扫货抢筹还是放量兑现。`,
    };
  } else {
    dim7 = {
      key: 'volume_ratio',
      title: '盘口量比状态',
      status: 'fail',
      statusLabel: '不通过',
      score: 38,
      valueSummary: `量比 ${vr.toFixed(2)} · ${volumeStateLabel}`,
      detail:
        vr < 0.8
          ? `量比低于 0.8 处于缩量观望区，买盘主动性偏弱，趋势延续仍需放量催化。`
          : `量比高达 ${vr.toFixed(2)} 属于极端巨量异动，日内筹码剧烈博弈，波动风险陡增。`,
    };
  }

  const dimensions = [dim1, dim2, dim3, dim4, dim5, dim6, dim7];
  const weights = [0.2, 0.16, 0.15, 0.15, 0.12, 0.1, 0.12];
  const weightedSum = dimensions.reduce((acc, d, idx) => acc + d.score * weights[idx], 0);
  const compositeScore = Math.max(0, Math.min(100, Math.round(weightedSum)));

  const passCount = dimensions.filter((d) => d.status === 'pass').length;
  const warnCount = dimensions.filter((d) => d.status === 'warn').length;
  const failCount = dimensions.filter((d) => d.status === 'fail').length;

  let oneLineSummary = '';
  if (compositeScore >= 80) {
    oneLineSummary = `${activeExpma.trendLabel}共振 · 7维达标 ${passCount} 项，${volumeSynergyLabel}，具备较强量化配置胜率。`;
  } else if (compositeScore >= 65) {
    oneLineSummary = `${activeExpma.trendLabel}结构 · 7维达标 ${passCount} 项、警示 ${warnCount} 项，${volumeSynergyLabel}，宜结合关键均线择时。`;
  } else if (compositeScore >= 50) {
    oneLineSummary = `震荡分化格局 · 综合评分 ${compositeScore} 分，${kdj.signalLabel}，建议等待量能与均线共振确认。`;
  } else {
    oneLineSummary = `偏空承压阶段 · 7维不通过 ${failCount} 项，${volumeSynergyLabel}，严控仓位静待右侧企稳。`;
  }

  const orderBookSnippet = `${activeExpma.trendLabel}，量比 ${vr.toFixed(2)}，${volumeSynergyLabel}，换手率 ${tr.toFixed(2)}%`;

  return {
    activeExpma,
    volumeStateLabel,
    volumeSynergyLabel,
    dimensions,
    compositeScore,
    passCount,
    warnCount,
    failCount,
    oneLineSummary,
    orderBookSnippet,
  };
}

export function buildQuantMetricsFromBars(params: {
  quote: LiveStockQuote;
  bars: RawKlineBar[];
  dividendInfo: HighDividendInfo | null;
  thresholds?: QuantRuleThresholds;
}): {
  expmaLong: ExpmaSetValues;
  expmaShort: ExpmaSetValues;
  volume: VolumeMetrics;
  kdj: KdjLatest;
  chart60: ChartPoint60[];
  evaluation: QuantDiagnosisEvaluation;
} {
  const { quote, bars, dividendInfo, thresholds = DEFAULT_QUANT_THRESHOLDS } = params;
  const closes = bars.map((b) => b.close);

  const e7 = computeExpmaSeries(closes, 7);
  const e21 = computeExpmaSeries(closes, 21);
  const e55 = computeExpmaSeries(closes, 55);
  const e144 = computeExpmaSeries(closes, 144);

  const e5 = computeExpmaSeries(closes, 5);
  const e10 = computeExpmaSeries(closes, 10);
  const e20 = computeExpmaSeries(closes, 20);
  const e60 = computeExpmaSeries(closes, 60);

  const { kSeries, dSeries, jSeries } = computeKdjSeries(bars);

  const lastIdx = bars.length - 1;
  const expmaLong = classifyExpmaTrend(
    'long',
    [7, 21, 55, 144],
    [e7[lastIdx], e21[lastIdx], e55[lastIdx], e144[lastIdx]],
    quote.price,
  );
  const expmaShort = classifyExpmaTrend(
    'short',
    [5, 10, 20, 60],
    [e5[lastIdx], e10[lastIdx], e20[lastIdx], e60[lastIdx]],
    quote.price,
  );

  const kdj = analyzeKdj(kSeries, dSeries, jSeries);

  const slice5 = bars.slice(Math.max(0, bars.length - 6), Math.max(1, bars.length - 1));
  const slice20 = bars.slice(Math.max(0, bars.length - 21), Math.max(1, bars.length - 1));
  const avgVol5 = slice5.length > 0 ? Math.round(slice5.reduce((s, b) => s + b.volume, 0) / slice5.length) : quote.volume;
  const avgVol20 = slice20.length > 0 ? Math.round(slice20.reduce((s, b) => s + b.volume, 0) / slice20.length) : quote.volume;

  const currentVolume = quote.volume > 0 ? quote.volume : bars[lastIdx]?.volume ?? 0;
  const multipleToAvg5 = avgVol5 > 0 ? round2(currentVolume / avgVol5) : 1;
  const effectiveVolumeRatio = quote.volumeRatio > 0 ? round2(quote.volumeRatio) : multipleToAvg5;

  const { volumeStateLabel, volumeSynergyLabel } = analyzeVolumeState(
    effectiveVolumeRatio,
    quote.changePercent,
    thresholds,
  );

  const volume: VolumeMetrics = {
    currentVolume,
    amountWan: round1(quote.amountWan),
    turnoverRate: round2(quote.turnoverRate),
    volumeRatio: effectiveVolumeRatio,
    avgVol5,
    avgVol20,
    multipleToAvg5,
    volumeStateLabel,
    volumeSynergyLabel,
  };

  const sliceStart = Math.max(0, bars.length - 60);
  const chart60: ChartPoint60[] = [];
  for (let i = sliceStart; i < bars.length; i++) {
    const b = bars[i];
    const prevClose = i > 0 ? bars[i - 1].close : b.open;
    const maStart = Math.max(0, i - 4);
    let volSum = 0;
    for (let m = maStart; m <= i; m++) {
      volSum += bars[m].volume;
    }
    const mavol5 = Math.round(volSum / (i - maStart + 1));
    chart60.push({
      date: b.date,
      shortDate: b.date.slice(5),
      open: round2(b.open),
      close: round2(b.close),
      high: round2(b.high),
      low: round2(b.low),
      volume: Math.round(b.volume),
      mavol5,
      isUp: b.close >= prevClose,
      expma7: e7[i],
      expma21: e21[i],
      expma55: e55[i],
      expma144: e144[i],
      expma5: e5[i],
      expma10: e10[i],
      expma20: e20[i],
      expma60: e60[i],
      k: kSeries[i],
      d: dSeries[i],
      j: jSeries[i],
    });
  }

  const evaluation = evaluate7Dimensions({
    quote,
    expmaLong,
    expmaShort,
    activeMode: 'long',
    volume,
    kdj,
    dividendInfo,
    thresholds,
  });

  return {
    expmaLong,
    expmaShort,
    volume,
    kdj,
    chart60,
    evaluation,
  };
}
