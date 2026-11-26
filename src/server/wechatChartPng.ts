import path from 'node:path';
import fs from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import {
  DEFAULT_QUANT_THRESHOLDS,
  evaluate7Dimensions,
  formatWechatTrendConclusion,
  formatWechatVolumeStateLabel,
} from '../shared/quantEngine.ts';
import type {
  DiagnosisStatus,
  ExpmaPeriodMode,
  QuantDiagnosisResponse,
} from '../shared/quantTypes.ts';

const FONT_SANS = 'Noto Sans CJK SC, Noto Sans SC, JetBrains Mono, DejaVu Sans';
const FONT_MONO = 'JetBrains Mono, Noto Sans CJK SC, Noto Sans SC, DejaVu Sans';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getBundledFontFiles(): string[] {
  const fontDir = path.resolve(process.cwd(), 'assets/fonts');
  if (!fs.existsSync(fontDir)) return [];
  return fs
    .readdirSync(fontDir)
    .filter((f) => f.endsWith('.ttf') || f.endsWith('.otf'))
    .map((f) => path.join(fontDir, f));
}

function centeredSlotPolylinePoints(
  values: number[],
  xStart: number,
  width: number,
  yTop: number,
  height: number,
  minV: number,
  maxV: number,
): string {
  const n = values.length;
  if (n === 0) return '';
  const span = maxV - minV || 1;
  const slotW = width / n;
  return values
    .map((v, i) => {
      const x = xStart + (i + 0.5) * slotW;
      const y = yTop + height - ((v - minV) / span) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

function statusDiagnosticColors(status: DiagnosisStatus): { bg: string; border: string; text: string } {
  if (status === 'pass') {
    return { bg: '#064E3B', border: '#10B981', text: '#6EE7B7' };
  }
  if (status === 'warn') {
    return { bg: '#451A03', border: '#F59E0B', text: '#FCD34D' };
  }
  return { bg: '#450A0A', border: '#EF4444', text: '#FCA5A5' };
}

function trendBadgeColors(direction: string): { bg: string; border: string; text: string } {
  if (direction === 'bullish' || direction === 'leaning_bull') {
    return { bg: '#450A0A', border: '#EF4444', text: '#FCA5A5' };
  }
  if (direction === 'bearish' || direction === 'leaning_bear') {
    return { bg: '#064E3B', border: '#10B981', text: '#6EE7B7' };
  }
  return { bg: '#1E293B', border: '#64748B', text: '#E2E8F0' };
}

function volumeBadgeColors(volumeRatio: number): { bg: string; border: string; text: string } {
  if (volumeRatio > 3.0) {
    return { bg: '#451A03', border: '#F59E0B', text: '#FCD34D' };
  }
  if (volumeRatio >= 1.5) {
    return { bg: '#450A0A', border: '#F43F5E', text: '#FDA4AF' };
  }
  if (volumeRatio >= 0.8) {
    return { bg: '#0F172A', border: '#38BDF8', text: '#7DD3FC' };
  }
  return { bg: '#064E3B', border: '#10B981', text: '#6EE7B7' };
}

export function renderWechatStockChartPng(
  data: QuantDiagnosisResponse,
  periodMode: ExpmaPeriodMode = 'long',
): Buffer {
  const { quote, dividendInfo, chart60, volume, kdj } = data;
  const evaluation = evaluate7Dimensions({
    quote,
    expmaLong: data.expmaLong,
    expmaShort: data.expmaShort,
    activeMode: periodMode,
    volume,
    kdj,
    dividendInfo,
    thresholds: DEFAULT_QUANT_THRESHOLDS,
  });

  const activeExpma = evaluation.activeExpma;
  const [p1, p2, p3, p4] = activeExpma.periods;
  const isUpDay = quote.change >= 0;
  const priceColor = isUpDay ? '#F87171' : '#4ADE80';
  const priceSign = isUpDay ? '+' : '';

  const trendConclusion = formatWechatTrendConclusion(activeExpma.trendDirection);
  const volumeStateText = formatWechatVolumeStateLabel(volume.volumeRatio);
  const trendColors = trendBadgeColors(activeExpma.trendDirection);
  const volColors = volumeBadgeColors(volume.volumeRatio);

  // Canvas & section layout (base 1120px, rendered at 2x = 2240px)
  const W = 1120;
  const padX = 36;
  const contentW = W - padX * 2;
  const hasDividend = Boolean(dividendInfo && dividendInfo.inPool);

  const headerH = 148;
  const cardsY = headerH + 16;
  const cardsH = 74;

  const c1Y = cardsY + cardsH + 16;
  const chart1H = 290;

  const row2Y = c1Y + chart1H + 16;
  const row2H = 194;

  const diagHeaderY = row2Y + row2H + 26;
  const diagRowH = 66;
  const diagListStartY = diagHeaderY + 34;
  const verdictY = diagListStartY + 7 * diagRowH + 6;
  const verdictH = 44;

  const dividendY = verdictY + verdictH + 16;
  const dividendH = hasDividend ? 64 : 0;

  const footerY = dividendY + dividendH + (hasDividend ? 26 : 16);
  const H = footerY + 24;

  // Chart 1 geometry (60-day OHLC Candlesticks + 4 EXPMA)
  const chartX = padX + 16;
  const chartW = contentW - 84;
  const c1PlotY = c1Y + 52;
  const c1InnerH = 204;

  const highs = chart60.map((d) => d.high);
  const lows = chart60.map((d) => d.low);
  const e1Arr = chart60.map((d) => (periodMode === 'long' ? d.expma7 : d.expma5));
  const e2Arr = chart60.map((d) => (periodMode === 'long' ? d.expma21 : d.expma10));
  const e3Arr = chart60.map((d) => (periodMode === 'long' ? d.expma55 : d.expma20));
  const e4Arr = chart60.map((d) => (periodMode === 'long' ? d.expma144 : d.expma60));

  const allPriceVals = [...highs, ...lows, ...e1Arr, ...e2Arr, ...e3Arr, ...e4Arr];
  const rawMinP = Math.min(...allPriceVals);
  const rawMaxP = Math.max(...allPriceVals);
  const pricePad = Math.max((rawMaxP - rawMinP) * 0.06, rawMaxP * 0.008);
  const minP = rawMinP - pricePad;
  const maxP = rawMaxP + pricePad;
  const priceSpan = maxP - minP || 1;

  const priceTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const val = minP + priceSpan * (1 - t);
    const y = c1PlotY + c1InnerH * t;
    return { val, y };
  });

  // OHLC Candlestick SVG elements
  const nBars = Math.max(1, chart60.length);
  const candleSlotW = chartW / nBars;
  const candleBodyW = Math.max(4, Math.min(10, candleSlotW * 0.62));

  const candlesSvg = chart60
    .map((bar, i) => {
      const cx = chartX + (i + 0.5) * candleSlotW;
      const isBull = bar.close >= bar.open;
      const strokeColor = isBull ? '#EF4444' : '#10B981';
      const fillColor = isBull ? '#080B12' : '#10B981';

      const yHigh = c1PlotY + c1InnerH - ((bar.high - minP) / priceSpan) * c1InnerH;
      const yLow = c1PlotY + c1InnerH - ((bar.low - minP) / priceSpan) * c1InnerH;
      const yOpen = c1PlotY + c1InnerH - ((bar.open - minP) / priceSpan) * c1InnerH;
      const yClose = c1PlotY + c1InnerH - ((bar.close - minP) / priceSpan) * c1InnerH;

      const bodyTop = Math.min(yOpen, yClose);
      const bodyH = Math.max(1.6, Math.abs(yClose - yOpen));
      const bx = cx - candleBodyW / 2;

      return `
        <line x1="${cx.toFixed(1)}" y1="${yHigh.toFixed(1)}" x2="${cx.toFixed(1)}" y2="${yLow.toFixed(1)}" stroke="${strokeColor}" stroke-width="1.2"/>
        <rect x="${bx.toFixed(1)}" y="${bodyTop.toFixed(1)}" width="${candleBodyW.toFixed(1)}" height="${bodyH.toFixed(1)}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1.2" rx="0.6"/>
      `;
    })
    .join('');

  const dateTickIndices = [0, 19, 39, Math.max(0, chart60.length - 1)].filter(
    (idx, pos, arr) => idx < chart60.length && arr.indexOf(idx) === pos,
  );

  const klineDateLabelsSvg = dateTickIndices
    .map((idx) => {
      const x = chartX + (idx + 0.5) * candleSlotW;
      return `<text x="${x.toFixed(1)}" y="${c1PlotY + c1InnerH + 20}" font-family="${FONT_MONO}" font-size="10" fill="#94A3B8" text-anchor="middle">${escapeXml(chart60[idx].shortDate)}</text>`;
    })
    .join('');

  // 6 Core Metric Cards geometry
  const cardGap = 12;
  const cardW = (contentW - cardGap * 5) / 6;
  const metricCards = [
    {
      label: '实时现价 / 涨跌',
      value: `¥${quote.price.toFixed(2)}`,
      sub: `${priceSign}${quote.changePercent.toFixed(2)}%`,
      valueColor: priceColor,
      subColor: priceColor,
    },
    {
      label: `EXPMA(${p1}/${p2}/${p3}/${p4})`,
      value: trendConclusion,
      sub: `较E${p2} ${activeExpma.devFromSecondPct >= 0 ? '+' : ''}${activeExpma.devFromSecondPct.toFixed(2)}%`,
      valueColor: trendColors.text,
      subColor: '#94A3B8',
    },
    {
      label: '实时量比 / 5日均',
      value: volume.volumeRatio.toFixed(2),
      sub: `${volumeStateText} · ${volume.multipleToAvg5.toFixed(2)}x`,
      valueColor: volColors.text,
      subColor: '#94A3B8',
    },
    {
      label: '换手率 / 成交额',
      value: `${volume.turnoverRate.toFixed(2)}%`,
      sub: `${(volume.amountWan / 10000).toFixed(2)} 亿元`,
      valueColor: '#F8FAFC',
      subColor: '#94A3B8',
    },
    {
      label: '估值 PE / PB',
      value: quote.pe > 0 ? `PE ${quote.pe.toFixed(1)}` : 'PE 亏损',
      sub: `PB ${quote.pb.toFixed(2)} · 市值${quote.totalMarketCapYi.toFixed(0)}亿`,
      valueColor: '#60A5FA',
      subColor: '#94A3B8',
    },
    {
      label: 'KDJ(9,3,3) 动能',
      value: kdj.signalLabel,
      sub: `K ${kdj.k.toFixed(0)} / D ${kdj.d.toFixed(0)} / J ${kdj.j.toFixed(0)}`,
      valueColor: '#38BDF8',
      subColor: '#94A3B8',
    },
  ];

  const metricCardsSvg = metricCards
    .map((card, idx) => {
      const x = padX + idx * (cardW + cardGap);
      return `
        <rect x="${x.toFixed(1)}" y="${cardsY}" width="${cardW.toFixed(1)}" height="${cardsH}" rx="8" fill="#0F1521" stroke="#1E293B" stroke-width="1"/>
        <text x="${(x + 12).toFixed(1)}" y="${cardsY + 20}" font-family="${FONT_SANS}" font-size="10.5" fill="#94A3B8">${escapeXml(card.label)}</text>
        <text x="${(x + 12).toFixed(1)}" y="${cardsY + 44}" font-family="${FONT_MONO}" font-size="16" font-weight="700" fill="${card.valueColor}">${escapeXml(card.value)}</text>
        <text x="${(x + 12).toFixed(1)}" y="${cardsY + 62}" font-family="${FONT_MONO}" font-size="10" fill="${card.subColor}">${escapeXml(card.sub)}</text>
      `;
    })
    .join('');

  // Row 2 side-by-side card geometry (Volume Left | KDJ Right)
  const halfBoxW = (contentW - 16) / 2;
  const leftBoxX = padX;
  const rightBoxX = padX + halfBoxW + 16;

  // Chart 2 bounds (Volume Left)
  const c2PlotX = leftBoxX + 16;
  const c2PlotW = halfBoxW - 68;
  const c2PlotY = row2Y + 40;
  const c2InnerH = 122;
  const maxVol = Math.max(...chart60.map((d) => d.volume), volume.avgVol5, 1) * 1.12;

  const mavol5Arr = chart60.map((d) => d.mavol5);
  const barSlot = c2PlotW / nBars;
  const barW = Math.max(3, barSlot * 0.62);
  const volBarsSvg = chart60
    .map((pt, i) => {
      const h = (pt.volume / maxVol) * c2InnerH;
      const x = c2PlotX + i * barSlot + (barSlot - barW) / 2;
      const y = c2PlotY + c2InnerH - h;
      const fill = pt.isUp ? '#EF4444' : '#10B981';
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(1, h).toFixed(1)}" fill="${fill}" opacity="0.9" rx="1"/>`;
    })
    .join('');

  const mavol5Points = centeredSlotPolylinePoints(mavol5Arr, c2PlotX, c2PlotW, c2PlotY, c2InnerH, 0, maxVol);

  const volDateLabelsSvg = dateTickIndices
    .map((idx) => {
      const x = c2PlotX + (idx + 0.5) * barSlot;
      return `<text x="${x.toFixed(1)}" y="${c2PlotY + c2InnerH + 18}" font-family="${FONT_MONO}" font-size="10" fill="#94A3B8" text-anchor="middle">${escapeXml(chart60[idx].shortDate)}</text>`;
    })
    .join('');

  // Chart 3 bounds (KDJ Right)
  const c3PlotX = rightBoxX + 16;
  const c3PlotW = halfBoxW - 58;
  const c3PlotY = row2Y + 40;
  const c3InnerH = 122;
  const kArr = chart60.map((d) => d.k);
  const dArr = chart60.map((d) => d.d);
  const jArr = chart60.map((d) => d.j);
  const minKdj = Math.min(-10, ...kArr, ...dArr, ...jArr);
  const maxKdj = Math.max(110, ...kArr, ...dArr, ...jArr);
  const kdjSpan = maxKdj - minKdj || 1;
  const y80 = c3PlotY + c3InnerH - ((80 - minKdj) / kdjSpan) * c3InnerH;
  const y20 = c3PlotY + c3InnerH - ((20 - minKdj) / kdjSpan) * c3InnerH;
  const kdjSlot = c3PlotW / nBars;

  const kdjDateLabelsSvg = dateTickIndices
    .map((idx) => {
      const x = c3PlotX + (idx + 0.5) * kdjSlot;
      return `<text x="${x.toFixed(1)}" y="${c3PlotY + c3InnerH + 18}" font-family="${FONT_MONO}" font-size="10" fill="#94A3B8" text-anchor="middle">${escapeXml(chart60[idx].shortDate)}</text>`;
    })
    .join('');

  // 7-Dimension Single-Column Rows
  const diagCardsSvg = evaluation.dimensions
    .map((dim, idx) => {
      const y = diagListStartY + idx * diagRowH;
      const sc = statusDiagnosticColors(dim.status);
      const dotColor = dim.status === 'pass' ? '#F43F5E' : dim.status === 'warn' ? '#FBBF24' : '#34D399';
      return `
        <rect x="${padX}" y="${y}" width="${contentW}" height="58" rx="8" fill="#0F1521" stroke="#1E293B" stroke-width="1"/>
        <circle cx="${padX + 20}" cy="${y + 21}" r="4.5" fill="${dotColor}"/>
        <text x="${padX + 34}" y="${y + 25}" font-family="${FONT_SANS}" font-size="13" font-weight="700" fill="#F1F5F9">${idx + 1}. ${escapeXml(dim.title)}</text>
        <text x="${padX + 34}" y="${y + 45}" font-family="${FONT_MONO}" font-size="11.5" fill="#CBD5E1">${escapeXml(dim.valueSummary)}</text>
        <text x="${padX + 390}" y="${y + 45}" font-family="${FONT_SANS}" font-size="11" fill="#94A3B8">${escapeXml(dim.detail.slice(0, 48))}${dim.detail.length > 48 ? '…' : ''}</text>
        <rect x="${W - padX - 106}" y="${y + 16}" width="90" height="26" rx="6" fill="${sc.bg}" stroke="${sc.border}" stroke-width="1"/>
        <text x="${W - padX - 61}" y="${y + 33}" font-family="${FONT_SANS}" font-size="11" font-weight="700" fill="${sc.text}" text-anchor="middle">${escapeXml(dim.statusLabel)}</text>
      `;
    })
    .join('');

  const summaryCardSvg = `
    <rect x="${padX}" y="${verdictY}" width="${contentW}" height="${verdictH}" rx="8" fill="#111A2E" stroke="#3B82F6" stroke-opacity="0.35" stroke-width="1"/>
    <text x="${padX + 18}" y="${verdictY + 27}" font-family="${FONT_SANS}" font-size="12" font-weight="700" fill="#93C5FD">综合评分 ${evaluation.compositeScore}/100  ·  通过 ${evaluation.passCount} / 警示 ${evaluation.warnCount} / 不通过 ${evaluation.failCount}</text>
    <text x="${W - padX - 18}" y="${verdictY + 27}" font-family="${FONT_SANS}" font-size="12" fill="#E2E8F0" text-anchor="end">${escapeXml(evaluation.oneLineSummary.slice(0, 50))}</text>
  `;

  // High Dividend bar (below 7-dim matrix, if stock is in dividend pool)
  let dividendSvg = '';
  if (dividendInfo && dividendInfo.inPool) {
    const reachColor = dividendInfo.isTargetReached ? '#6EE7B7' : '#FCD34D';
    const reachText = dividendInfo.isTargetReached
      ? '已达标 · 进入理想买价区'
      : `需跌 ${dividendInfo.dropNeededPercent.toFixed(2)}% 至目标买价`;
    dividendSvg = `
      <rect x="${padX}" y="${dividendY}" width="${contentW}" height="${dividendH}" rx="8" fill="#0F1521" stroke="#334155" stroke-width="1"/>
      <text x="${padX + 18}" y="${dividendY + 24}" font-family="${FONT_SANS}" font-size="12.5" font-weight="700" fill="#F1F5F9">高股息目标买价测算</text>
      <text x="${padX + 18}" y="${dividendY + 46}" font-family="${FONT_SANS}" font-size="11" fill="#94A3B8">${escapeXml(dividendInfo.payoutNote)}</text>
      <text x="${padX + 430}" y="${dividendY + 24}" font-family="${FONT_SANS}" font-size="11" fill="#94A3B8">TTM 每股派息</text>
      <text x="${padX + 430}" y="${dividendY + 46}" font-family="${FONT_MONO}" font-size="13.5" font-weight="700" fill="#F8FAFC">¥${dividendInfo.ttmDividendPerShare.toFixed(2)}</text>
      <text x="${padX + 545}" y="${dividendY + 24}" font-family="${FONT_SANS}" font-size="11" fill="#94A3B8">现股息 / 目标股息</text>
      <text x="${padX + 545}" y="${dividendY + 46}" font-family="${FONT_MONO}" font-size="13.5" font-weight="700" fill="#60A5FA">${dividendInfo.currentYield.toFixed(2)}% / ${dividendInfo.targetYield.toFixed(1)}%</text>
      <text x="${padX + 705}" y="${dividendY + 24}" font-family="${FONT_SANS}" font-size="11" fill="#94A3B8">目标买价</text>
      <text x="${padX + 705}" y="${dividendY + 46}" font-family="${FONT_MONO}" font-size="13.5" font-weight="700" fill="#F8FAFC">¥${dividendInfo.targetBuyPrice.toFixed(2)}</text>
      <text x="${W - padX - 18}" y="${dividendY + 37}" font-family="${FONT_SANS}" font-size="12.5" font-weight="700" fill="${reachColor}" text-anchor="end">${escapeXml(reachText)}</text>
    `;
  }

  // Dynamic badge sizing in Header
  const codeX = padX + Math.min(260, quote.name.length * 32 + 16);
  const trendBadgeW = 104;
  const volBadgeText = `量比 ${volume.volumeRatio.toFixed(2)} · ${volumeStateText}`;
  const volBadgeW = Math.max(150, volBadgeText.length * 10 + 26);

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#080B12"/>

  <!-- Top Institutional Header -->
  <rect x="0" y="0" width="${W}" height="${headerH}" fill="#0F1521"/>
  <line x1="0" y1="${headerH}" x2="${W}" y2="${headerH}" stroke="#1E293B" stroke-width="1"/>
  <text x="${padX}" y="32" font-family="${FONT_SANS}" font-size="12" fill="#94A3B8">个股量化分析 · 组合量化诊断看板  |  ${escapeXml(quote.board)} · ${escapeXml(quote.sector)}  |  更新 ${escapeXml(quote.updatedAt)}</text>
  <text x="${padX}" y="74" font-family="${FONT_SANS}" font-size="30" font-weight="700" fill="#FFFFFF">${escapeXml(quote.name)}</text>
  <text x="${codeX}" y="73" font-family="${FONT_MONO}" font-size="22" font-weight="600" fill="#94A3B8">${escapeXml(quote.code)}.${escapeXml(quote.market.toUpperCase())}</text>

  <!-- Trend & Volume Ratio Badges -->
  <rect x="${padX}" y="90" width="${trendBadgeW}" height="26" rx="6" fill="${trendColors.bg}" stroke="${trendColors.border}" stroke-width="1"/>
  <text x="${padX + trendBadgeW / 2}" y="107" font-family="${FONT_SANS}" font-size="11.5" font-weight="700" fill="${trendColors.text}" text-anchor="middle">${escapeXml(trendConclusion)}</text>
  <rect x="${padX + trendBadgeW + 10}" y="90" width="${volBadgeW}" height="26" rx="6" fill="${volColors.bg}" stroke="${volColors.border}" stroke-width="1"/>
  <text x="${padX + trendBadgeW + 10 + volBadgeW / 2}" y="107" font-family="${FONT_MONO}" font-size="11.5" font-weight="700" fill="${volColors.text}" text-anchor="middle">${escapeXml(volBadgeText)}</text>

  <text x="${padX}" y="135" font-family="${FONT_SANS}" font-size="12" fill="#CBD5E1">量价协同：${escapeXml(evaluation.volumeSynergyLabel)}  ·  ${escapeXml(evaluation.oneLineSummary)}</text>

  <!-- Right Header Quote & Score -->
  <text x="${W - padX - 170}" y="68" font-family="${FONT_MONO}" font-size="34" font-weight="700" fill="${priceColor}" text-anchor="end">¥${quote.price.toFixed(2)}</text>
  <text x="${W - padX - 170}" y="95" font-family="${FONT_MONO}" font-size="15" font-weight="600" fill="${priceColor}" text-anchor="end">${priceSign}${quote.change.toFixed(2)} (${priceSign}${quote.changePercent.toFixed(2)}%)</text>
  <rect x="${W - padX - 145}" y="30" width="145" height="82" rx="8" fill="#111A2E" stroke="#334155" stroke-width="1"/>
  <text x="${W - padX - 72}" y="54" font-family="${FONT_SANS}" font-size="11" fill="#94A3B8" text-anchor="middle">7维量化总分</text>
  <text x="${W - padX - 72}" y="94" font-family="${FONT_MONO}" font-size="30" font-weight="700" fill="#FFFFFF" text-anchor="middle">${evaluation.compositeScore}</text>

  <!-- 6 Core Metric Cards -->
  ${metricCardsSvg}

  <!-- Chart 1 Container: 60-Day QFQ K-Line + 4 EXPMA -->
  <rect x="${padX}" y="${c1Y}" width="${contentW}" height="${chart1H}" rx="10" fill="#0F1521" stroke="#1E293B" stroke-width="1"/>
  <text x="${chartX}" y="${c1Y + 25}" font-family="${FONT_SANS}" font-size="13.5" font-weight="700" fill="#F1F5F9">近 60 交易日前复权 K 线 + EXPMA(${p1}/${p2}/${p3}/${p4}) 四线趋势图</text>
  <text x="${W - padX - 16}" y="${c1Y + 25}" font-family="${FONT_MONO}" font-size="11" fill="#CBD5E1" text-anchor="end">
    收盘:${quote.price.toFixed(2)}  E${p1}:${activeExpma.latest[0].toFixed(2)}  E${p2}:${activeExpma.latest[1].toFixed(2)}  E${p3}:${activeExpma.latest[2].toFixed(2)}  E${p4}:${activeExpma.latest[3].toFixed(2)}
  </text>
  <line x1="${chartX}" y1="${c1Y + 38}" x2="${chartX + 12}" y2="${c1Y + 38}" stroke="#FACC15" stroke-width="2"/>
  <text x="${chartX + 16}" y="${c1Y + 42}" font-family="${FONT_MONO}" font-size="10" fill="#FACC15">EXPMA${p1}</text>
  <line x1="${chartX + 86}" y1="${c1Y + 38}" x2="${chartX + 98}" y2="${c1Y + 38}" stroke="#38BDF8" stroke-width="2"/>
  <text x="${chartX + 102}" y="${c1Y + 42}" font-family="${FONT_MONO}" font-size="10" fill="#38BDF8">EXPMA${p2}</text>
  <line x1="${chartX + 178}" y1="${c1Y + 38}" x2="${chartX + 190}" y2="${c1Y + 38}" stroke="#A78BFA" stroke-width="2"/>
  <text x="${chartX + 194}" y="${c1Y + 42}" font-family="${FONT_MONO}" font-size="10" fill="#A78BFA">EXPMA${p3}</text>
  <line x1="${chartX + 270}" y1="${c1Y + 38}" x2="${chartX + 282}" y2="${c1Y + 38}" stroke="#F87171" stroke-width="2"/>
  <text x="${chartX + 286}" y="${c1Y + 42}" font-family="${FONT_MONO}" font-size="10" fill="#F87171">EXPMA${p4}</text>

  ${priceTicks
    .map(
      (t) => `
    <line x1="${chartX}" y1="${t.y.toFixed(1)}" x2="${chartX + chartW}" y2="${t.y.toFixed(1)}" stroke="#1E293B" stroke-width="1"/>
    <text x="${chartX + chartW + 8}" y="${(t.y + 4).toFixed(1)}" font-family="${FONT_MONO}" font-size="10" fill="#94A3B8">${t.val.toFixed(2)}</text>
  `,
    )
    .join('')}
  ${candlesSvg}
  <polyline fill="none" stroke="#F87171" stroke-width="1.5" points="${centeredSlotPolylinePoints(e4Arr, chartX, chartW, c1PlotY, c1InnerH, minP, maxP)}"/>
  <polyline fill="none" stroke="#A78BFA" stroke-width="1.6" points="${centeredSlotPolylinePoints(e3Arr, chartX, chartW, c1PlotY, c1InnerH, minP, maxP)}"/>
  <polyline fill="none" stroke="#38BDF8" stroke-width="1.7" points="${centeredSlotPolylinePoints(e2Arr, chartX, chartW, c1PlotY, c1InnerH, minP, maxP)}"/>
  <polyline fill="none" stroke="#FACC15" stroke-width="1.8" points="${centeredSlotPolylinePoints(e1Arr, chartX, chartW, c1PlotY, c1InnerH, minP, maxP)}"/>
  ${klineDateLabelsSvg}

  <!-- Row 2 Left: Volume + MAVOL5 -->
  <rect x="${leftBoxX}" y="${row2Y}" width="${halfBoxW}" height="${row2H}" rx="10" fill="#0F1521" stroke="#1E293B" stroke-width="1"/>
  <text x="${leftBoxX + 16}" y="${row2Y + 25}" font-family="${FONT_SANS}" font-size="13" font-weight="700" fill="#F1F5F9">成交量 (手) + MAVOL5</text>
  <text x="${leftBoxX + halfBoxW - 16}" y="${row2Y + 25}" font-family="${FONT_MONO}" font-size="11" fill="#FBBF24" text-anchor="end">量比 ${volume.volumeRatio.toFixed(2)} · ${(volume.amountWan / 10000).toFixed(2)}亿</text>
  ${volBarsSvg}
  <polyline fill="none" stroke="#EAB308" stroke-width="1.6" stroke-dasharray="3 3" points="${mavol5Points}"/>
  <text x="${c2PlotX + c2PlotW + 6}" y="${(c2PlotY + 10).toFixed(1)}" font-family="${FONT_MONO}" font-size="9.5" fill="#94A3B8">${(maxVol / 10000).toFixed(1)}万</text>
  <text x="${c2PlotX + c2PlotW + 6}" y="${(c2PlotY + c2InnerH).toFixed(1)}" font-family="${FONT_MONO}" font-size="9.5" fill="#94A3B8">0</text>
  ${volDateLabelsSvg}

  <!-- Row 2 Right: KDJ(9,3,3) -->
  <rect x="${rightBoxX}" y="${row2Y}" width="${halfBoxW}" height="${row2H}" rx="10" fill="#0F1521" stroke="#1E293B" stroke-width="1"/>
  <text x="${rightBoxX + 16}" y="${row2Y + 25}" font-family="${FONT_SANS}" font-size="13" font-weight="700" fill="#F1F5F9">KDJ(9,3,3) 动能副图</text>
  <text x="${rightBoxX + halfBoxW - 16}" y="${row2Y + 25}" font-family="${FONT_MONO}" font-size="11" fill="#38BDF8" text-anchor="end">${escapeXml(kdj.signalLabel)} · J:${kdj.j.toFixed(1)}</text>
  <line x1="${c3PlotX}" y1="${y80.toFixed(1)}" x2="${c3PlotX + c3PlotW}" y2="${y80.toFixed(1)}" stroke="#EF4444" stroke-opacity="0.55" stroke-width="1" stroke-dasharray="4 3"/>
  <line x1="${c3PlotX}" y1="${y20.toFixed(1)}" x2="${c3PlotX + c3PlotW}" y2="${y20.toFixed(1)}" stroke="#22C55E" stroke-opacity="0.55" stroke-width="1" stroke-dasharray="4 3"/>
  <text x="${c3PlotX + c3PlotW + 6}" y="${(y80 + 4).toFixed(1)}" font-family="${FONT_MONO}" font-size="9.5" fill="#F87171">80</text>
  <text x="${c3PlotX + c3PlotW + 6}" y="${(y20 + 4).toFixed(1)}" font-family="${FONT_MONO}" font-size="9.5" fill="#4ADE80">20</text>
  <polyline fill="none" stroke="#FACC15" stroke-width="1.6" points="${centeredSlotPolylinePoints(kArr, c3PlotX, c3PlotW, c3PlotY, c3InnerH, minKdj, maxKdj)}"/>
  <polyline fill="none" stroke="#38BDF8" stroke-width="1.6" points="${centeredSlotPolylinePoints(dArr, c3PlotX, c3PlotW, c3PlotY, c3InnerH, minKdj, maxKdj)}"/>
  <polyline fill="none" stroke="#F472B6" stroke-width="1.8" points="${centeredSlotPolylinePoints(jArr, c3PlotX, c3PlotW, c3PlotY, c3InnerH, minKdj, maxKdj)}"/>
  ${kdjDateLabelsSvg}

  <!-- 7-Dim Matrix Section -->
  <text x="${padX}" y="${diagHeaderY + 18}" font-family="${FONT_SANS}" font-size="15" font-weight="700" fill="#F1F5F9">7 维量化诊断引擎明细（EXPMA ${p1}/${p2}/${p3}/${p4} · PE ≤ 45 · 换手 3%~10% · 量比 1.5~3.0）</text>
  ${diagCardsSvg}
  ${summaryCardSvg}

  ${dividendSvg}

  <text x="${padX}" y="${footerY}" font-family="${FONT_SANS}" font-size="11" fill="#64748B">本看板由纯量化算法引擎直算生成，仅供研究参考，不构成投资建议。</text>
  <text x="${W - padX}" y="${footerY}" font-family="${FONT_SANS}" font-size="11" font-weight="700" fill="#FBBF24" text-anchor="end">公众号：我爱这young</text>
</svg>`;

  const fontFiles = getBundledFontFiles();
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 2240 },
    font: {
      fontFiles,
      loadSystemFonts: false,
      defaultFontFamily: 'Noto Sans CJK SC',
    },
  });

  const rendered = resvg.render();
  return rendered.asPng();
}
