import path from 'node:path';
import fs from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import { DEFAULT_QUANT_THRESHOLDS, evaluate7Dimensions } from '../shared/quantEngine.ts';
import type {
  DiagnosisStatus,
  ExpmaPeriodMode,
  QuantDiagnosisResponse,
} from '../shared/quantTypes.ts';

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

function polylinePoints(
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
  return values
    .map((v, i) => {
      const x = xStart + (n === 1 ? width / 2 : (i / (n - 1)) * width);
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

  const W = 1120;
  const hasDividend = Boolean(dividendInfo && dividendInfo.inPool);
  const headerH = 132;
  const dividendH = hasDividend ? 68 : 0;
  const chart1H = 260;
  const row2H = 180;
  const diagHeaderY = headerH + dividendH + chart1H + row2H + 46;
  const diagRowH = 68;
  const diagRows = 7;
  const H = diagHeaderY + 38 + diagRows * diagRowH + 86;

  const padX = 36;
  const chartX = 48;
  const chartW = W - 120;

  // Chart 1 bounds (Price + 4 EXPMA)
  const c1Y = headerH + dividendH + 34;
  const c1InnerH = 195;
  const c1PlotY = c1Y + 36;
  const closes = chart60.map((d) => d.close);
  const e1Arr = chart60.map((d) => (periodMode === 'long' ? d.expma7 : d.expma5));
  const e2Arr = chart60.map((d) => (periodMode === 'long' ? d.expma21 : d.expma10));
  const e3Arr = chart60.map((d) => (periodMode === 'long' ? d.expma55 : d.expma20));
  const e4Arr = chart60.map((d) => (periodMode === 'long' ? d.expma144 : d.expma60));

  const allPriceVals = [...closes, ...e1Arr, ...e2Arr, ...e3Arr, ...e4Arr];
  const minP = Math.min(...allPriceVals) * 0.985;
  const maxP = Math.max(...allPriceVals) * 1.015;

  // Row 2 side-by-side card geometry (Volume Left | KDJ Right)
  const row2Y = c1Y + chart1H + 14;
  const halfBoxW = (W - padX * 2 - 16) / 2;
  const leftBoxX = padX;
  const rightBoxX = padX + halfBoxW + 16;

  // Chart 2 bounds (Volume Left)
  const c2PlotX = leftBoxX + 16;
  const c2PlotW = halfBoxW - 64;
  const c2PlotY = row2Y + 38;
  const c2InnerH = 114;
  const maxVol = Math.max(...chart60.map((d) => d.volume), volume.avgVol5, 1) * 1.12;

  // Chart 3 bounds (KDJ Right)
  const c3PlotX = rightBoxX + 16;
  const c3PlotW = halfBoxW - 54;
  const c3PlotY = row2Y + 38;
  const c3InnerH = 114;
  const kArr = chart60.map((d) => d.k);
  const dArr = chart60.map((d) => d.d);
  const jArr = chart60.map((d) => d.j);
  const minKdj = Math.min(-10, ...kArr, ...dArr, ...jArr);
  const maxKdj = Math.max(110, ...kArr, ...dArr, ...jArr);

  // Price grid lines
  const priceTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const val = minP + (maxP - minP) * (1 - t);
    const y = c1PlotY + c1InnerH * t;
    return { val, y };
  });

  // Volume bars & rolling MAVOL5 curve
  const mavol5Arr = chart60.map((d) => d.mavol5);
  const barSlot = c2PlotW / Math.max(1, chart60.length);
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

  const mavol5Points = polylinePoints(mavol5Arr, c2PlotX, c2PlotW, c2PlotY, c2InnerH, 0, maxVol);

  // KDJ 80/20 reference lines
  const kdjSpan = maxKdj - minKdj || 1;
  const y80 = c3PlotY + c3InnerH - ((80 - minKdj) / kdjSpan) * c3InnerH;
  const y20 = c3PlotY + c3InnerH - ((20 - minKdj) / kdjSpan) * c3InnerH;

  // Date X labels (4 ticks under Volume & KDJ)
  const dateTickIndices = [0, 19, 39, Math.max(0, chart60.length - 1)];
  const volDateLabelsSvg = dateTickIndices
    .filter((idx, pos, arr) => idx < chart60.length && arr.indexOf(idx) === pos)
    .map((idx) => {
      const x = c2PlotX + (chart60.length === 1 ? c2PlotW / 2 : (idx / (chart60.length - 1)) * c2PlotW);
      return `<text x="${x.toFixed(1)}" y="${c2PlotY + c2InnerH + 16}" font-family="JetBrains Mono, Noto Sans CJK SC" font-size="10" fill="#94A3B8" text-anchor="middle">${escapeXml(chart60[idx].shortDate)}</text>`;
    })
    .join('');
  const kdjDateLabelsSvg = dateTickIndices
    .filter((idx, pos, arr) => idx < chart60.length && arr.indexOf(idx) === pos)
    .map((idx) => {
      const x = c3PlotX + (chart60.length === 1 ? c3PlotW / 2 : (idx / (chart60.length - 1)) * c3PlotW);
      return `<text x="${x.toFixed(1)}" y="${c3PlotY + c3InnerH + 16}" font-family="JetBrains Mono, Noto Sans CJK SC" font-size="10" fill="#94A3B8" text-anchor="middle">${escapeXml(chart60[idx].shortDate)}</text>`;
    })
    .join('');

  // High Dividend banner
  let dividendSvg = '';
  if (dividendInfo && dividendInfo.inPool) {
    const dy = headerH + 16;
    const reachColor = dividendInfo.isTargetReached ? '#6EE7B7' : '#FCD34D';
    const reachText = dividendInfo.isTargetReached
      ? '已达理想买价区间'
      : `距目标买价还需下跌 ${dividendInfo.dropNeededPercent.toFixed(2)}%`;
    dividendSvg = `
      <rect x="${padX}" y="${dy}" width="${W - padX * 2}" height="52" rx="8" fill="#0F1521" stroke="#1E293B" stroke-width="1"/>
      <text x="${padX + 18}" y="${dy + 22}" font-family="Noto Sans CJK SC" font-size="12" font-weight="700" fill="#F1F5F9">高股息联动监测</text>
      <text x="${padX + 18}" y="${dy + 40}" font-family="Noto Sans CJK SC" font-size="11" fill="#94A3B8">${escapeXml(dividendInfo.payoutNote)}</text>
      <text x="${padX + 430}" y="${dy + 22}" font-family="Noto Sans CJK SC" font-size="11" fill="#94A3B8">TTM每股派息</text>
      <text x="${padX + 430}" y="${dy + 40}" font-family="JetBrains Mono" font-size="13" font-weight="700" fill="#F8FAFC">¥${dividendInfo.ttmDividendPerShare.toFixed(2)}</text>
      <text x="${padX + 545}" y="${dy + 22}" font-family="Noto Sans CJK SC" font-size="11" fill="#94A3B8">当前/目标股息率</text>
      <text x="${padX + 545}" y="${dy + 40}" font-family="JetBrains Mono" font-size="13" font-weight="700" fill="#60A5FA">${dividendInfo.currentYield.toFixed(2)}% / ${dividendInfo.targetYield.toFixed(1)}%</text>
      <text x="${padX + 705}" y="${dy + 22}" font-family="Noto Sans CJK SC" font-size="11" fill="#94A3B8">理想目标买价</text>
      <text x="${padX + 705}" y="${dy + 40}" font-family="JetBrains Mono" font-size="13" font-weight="700" fill="#F8FAFC">¥${dividendInfo.targetBuyPrice.toFixed(2)}</text>
      <text x="${W - padX - 18}" y="${dy + 32}" font-family="Noto Sans CJK SC" font-size="12" font-weight="700" fill="${reachColor}" text-anchor="end">${escapeXml(reachText)}</text>
    `;
  }

  // 7-Dimension Single-Column Rows
  const fullRowW = W - padX * 2;
  const diagCardsSvg = evaluation.dimensions
    .map((dim, idx) => {
      const y = diagHeaderY + 34 + idx * diagRowH;
      const sc = statusDiagnosticColors(dim.status);
      const dotColor = dim.status === 'pass' ? '#F43F5E' : dim.status === 'warn' ? '#FBBF24' : '#34D399';
      return `
        <rect x="${padX}" y="${y}" width="${fullRowW}" height="58" rx="8" fill="#0F1521" stroke="#1E293B" stroke-width="1"/>
        <circle cx="${padX + 20}" cy="${y + 21}" r="4.5" fill="${dotColor}"/>
        <text x="${padX + 34}" y="${y + 25}" font-family="Noto Sans CJK SC" font-size="13" font-weight="700" fill="#F1F5F9">${idx + 1}. ${escapeXml(dim.title)}</text>
        <text x="${padX + 34}" y="${y + 45}" font-family="JetBrains Mono, Noto Sans CJK SC" font-size="12" fill="#CBD5E1">${escapeXml(dim.valueSummary)}</text>
        <rect x="${W - padX - 106}" y="${y + 16}" width="90" height="26" rx="6" fill="${sc.bg}" stroke="${sc.border}" stroke-width="1"/>
        <text x="${W - padX - 61}" y="${y + 33}" font-family="Noto Sans CJK SC" font-size="11" font-weight="700" fill="${sc.text}" text-anchor="middle">${escapeXml(dim.statusLabel)}</text>
      `;
    })
    .join('');

  // Bottom verdict strip below 7 rows
  const verdictY = diagHeaderY + 34 + 7 * diagRowH + 4;
  const summaryCardSvg = `
    <rect x="${padX}" y="${verdictY}" width="${fullRowW}" height="44" rx="8" fill="#111A2E" stroke="#3B82F6" stroke-opacity="0.35" stroke-width="1"/>
    <text x="${padX + 18}" y="${verdictY + 27}" font-family="Noto Sans CJK SC" font-size="12" font-weight="700" fill="#93C5FD">综合评分 ${evaluation.compositeScore}/100  ·  通过 ${evaluation.passCount} / 警示 ${evaluation.warnCount} / 不通过 ${evaluation.failCount}</text>
    <text x="${W - padX - 18}" y="${verdictY + 27}" font-family="Noto Sans CJK SC" font-size="12" fill="#E2E8F0" text-anchor="end">${escapeXml(evaluation.oneLineSummary.slice(0, 48))}</text>
  `;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#080B12"/>

  <!-- Top Institutional Header -->
  <rect x="0" y="0" width="${W}" height="${headerH}" fill="#0F1521"/>
  <line x1="0" y1="${headerH}" x2="${W}" y2="${headerH}" stroke="#1E293B" stroke-width="1"/>
  <text x="${padX}" y="38" font-family="Noto Sans CJK SC" font-size="12" fill="#94A3B8">个股量化分析 · 公众号同源 7 维量化诊断看板  |  ${escapeXml(quote.board)} · ${escapeXml(quote.sector)}  |  更新 ${escapeXml(quote.updatedAt)}</text>
  <text x="${padX}" y="82" font-family="Noto Sans CJK SC" font-size="30" font-weight="700" fill="#FFFFFF">${escapeXml(quote.name)}</text>
  <text x="${padX + Math.min(260, quote.name.length * 32 + 16)}" y="81" font-family="JetBrains Mono" font-size="22" font-weight="600" fill="#94A3B8">${escapeXml(quote.code)}.${escapeXml(quote.market.toUpperCase())}</text>
  <text x="${padX}" y="110" font-family="Noto Sans CJK SC" font-size="13" fill="#CBD5E1">综合研判：${escapeXml(evaluation.oneLineSummary)}</text>

  <!-- Right Header Quote & Score -->
  <text x="${W - padX - 170}" y="68" font-family="JetBrains Mono" font-size="34" font-weight="700" fill="${priceColor}" text-anchor="end">¥${quote.price.toFixed(2)}</text>
  <text x="${W - padX - 170}" y="95" font-family="JetBrains Mono" font-size="15" font-weight="600" fill="${priceColor}" text-anchor="end">${priceSign}${quote.change.toFixed(2)} (${priceSign}${quote.changePercent.toFixed(2)}%)</text>
  <rect x="${W - padX - 145}" y="30" width="145" height="76" rx="8" fill="#111A2E" stroke="#334155" stroke-width="1"/>
  <text x="${W - padX - 72}" y="53" font-family="Noto Sans CJK SC" font-size="11" fill="#94A3B8" text-anchor="middle">${escapeXml(activeExpma.trendLabel)} · 量化总分</text>
  <text x="${W - padX - 72}" y="89" font-family="JetBrains Mono" font-size="28" font-weight="700" fill="#FFFFFF" text-anchor="middle">${evaluation.compositeScore}</text>

  ${dividendSvg}

  <!-- Chart 1 Container: Price + EXPMA -->
  <rect x="${padX}" y="${c1Y}" width="${W - padX * 2}" height="${chart1H}" rx="10" fill="#0F1521" stroke="#1E293B" stroke-width="1"/>
  <text x="${chartX}" y="${c1Y + 23}" font-family="Noto Sans CJK SC" font-size="13" font-weight="700" fill="#F1F5F9">近 60 交易日收盘价与双周期 EXPMA (${p1}/${p2}/${p3}/${p4})</text>
  <text x="${W - padX - 14}" y="${c1Y + 23}" font-family="JetBrains Mono, Noto Sans CJK SC" font-size="11" fill="#CBD5E1" text-anchor="end">
    收盘:${quote.price.toFixed(2)}  E${p1}:${activeExpma.latest[0].toFixed(2)}  E${p2}:${activeExpma.latest[1].toFixed(2)}  E${p3}:${activeExpma.latest[2].toFixed(2)}  E${p4}:${activeExpma.latest[3].toFixed(2)}
  </text>
  ${priceTicks
    .map(
      (t) => `
    <line x1="${chartX}" y1="${t.y.toFixed(1)}" x2="${chartX + chartW}" y2="${t.y.toFixed(1)}" stroke="#1E293B" stroke-width="1"/>
    <text x="${chartX + chartW + 8}" y="${(t.y + 4).toFixed(1)}" font-family="JetBrains Mono" font-size="10" fill="#94A3B8">${t.val.toFixed(2)}</text>
  `,
    )
    .join('')}
  <polyline fill="none" stroke="#F87171" stroke-width="1.5" points="${polylinePoints(e4Arr, chartX, chartW, c1PlotY, c1InnerH, minP, maxP)}"/>
  <polyline fill="none" stroke="#A78BFA" stroke-width="1.6" points="${polylinePoints(e3Arr, chartX, chartW, c1PlotY, c1InnerH, minP, maxP)}"/>
  <polyline fill="none" stroke="#38BDF8" stroke-width="1.7" points="${polylinePoints(e2Arr, chartX, chartW, c1PlotY, c1InnerH, minP, maxP)}"/>
  <polyline fill="none" stroke="#FACC15" stroke-width="1.7" points="${polylinePoints(e1Arr, chartX, chartW, c1PlotY, c1InnerH, minP, maxP)}"/>
  <polyline fill="none" stroke="#F8FAFC" stroke-width="2.4" points="${polylinePoints(closes, chartX, chartW, c1PlotY, c1InnerH, minP, maxP)}"/>

  <!-- Row 2 Left: Volume + MAVOL5 -->
  <rect x="${leftBoxX}" y="${row2Y}" width="${halfBoxW}" height="${row2H}" rx="10" fill="#0F1521" stroke="#1E293B" stroke-width="1"/>
  <text x="${leftBoxX + 16}" y="${row2Y + 24}" font-family="Noto Sans CJK SC" font-size="13" font-weight="700" fill="#F1F5F9">成交量 (手) + MAVOL5</text>
  <text x="${leftBoxX + halfBoxW - 16}" y="${row2Y + 24}" font-family="JetBrains Mono, Noto Sans CJK SC" font-size="11" fill="#FBBF24" text-anchor="end">量比 ${volume.volumeRatio.toFixed(2)} · ${(volume.amountWan / 10000).toFixed(2)}亿</text>
  ${volBarsSvg}
  <polyline fill="none" stroke="#EAB308" stroke-width="1.5" stroke-dasharray="3 3" points="${mavol5Points}"/>
  <text x="${c2PlotX + c2PlotW + 6}" y="${(c2PlotY + 10).toFixed(1)}" font-family="JetBrains Mono, Noto Sans CJK SC" font-size="9" fill="#94A3B8">${(maxVol / 10000).toFixed(1)}万</text>
  <text x="${c2PlotX + c2PlotW + 6}" y="${(c2PlotY + c2InnerH).toFixed(1)}" font-family="JetBrains Mono" font-size="9" fill="#94A3B8">0</text>
  ${volDateLabelsSvg}

  <!-- Row 2 Right: KDJ(9,3,3) -->
  <rect x="${rightBoxX}" y="${row2Y}" width="${halfBoxW}" height="${row2H}" rx="10" fill="#0F1521" stroke="#1E293B" stroke-width="1"/>
  <text x="${rightBoxX + 16}" y="${row2Y + 24}" font-family="Noto Sans CJK SC" font-size="13" font-weight="700" fill="#F1F5F9">KDJ(9,3,3) 动能指标</text>
  <text x="${rightBoxX + halfBoxW - 16}" y="${row2Y + 24}" font-family="JetBrains Mono, Noto Sans CJK SC" font-size="11" fill="#38BDF8" text-anchor="end">${escapeXml(kdj.signalLabel)} · J:${kdj.j.toFixed(1)}</text>
  <line x1="${c3PlotX}" y1="${y80.toFixed(1)}" x2="${c3PlotX + c3PlotW}" y2="${y80.toFixed(1)}" stroke="#EF4444" stroke-opacity="0.55" stroke-width="1" stroke-dasharray="4 3"/>
  <line x1="${c3PlotX}" y1="${y20.toFixed(1)}" x2="${c3PlotX + c3PlotW}" y2="${y20.toFixed(1)}" stroke="#22C55E" stroke-opacity="0.55" stroke-width="1" stroke-dasharray="4 3"/>
  <text x="${c3PlotX + c3PlotW + 6}" y="${(y80 + 4).toFixed(1)}" font-family="JetBrains Mono" font-size="9" fill="#F87171">80</text>
  <text x="${c3PlotX + c3PlotW + 6}" y="${(y20 + 4).toFixed(1)}" font-family="JetBrains Mono" font-size="9" fill="#4ADE80">20</text>
  <polyline fill="none" stroke="#FACC15" stroke-width="1.6" points="${polylinePoints(kArr, c3PlotX, c3PlotW, c3PlotY, c3InnerH, minKdj, maxKdj)}"/>
  <polyline fill="none" stroke="#38BDF8" stroke-width="1.6" points="${polylinePoints(dArr, c3PlotX, c3PlotW, c3PlotY, c3InnerH, minKdj, maxKdj)}"/>
  <polyline fill="none" stroke="#F472B6" stroke-width="1.8" points="${polylinePoints(jArr, c3PlotX, c3PlotW, c3PlotY, c3InnerH, minKdj, maxKdj)}"/>
  ${kdjDateLabelsSvg}

  <!-- 7-Dim Matrix Section -->
  <text x="${padX}" y="${diagHeaderY + 18}" font-family="Noto Sans CJK SC" font-size="15" font-weight="700" fill="#F1F5F9">7 维量化诊断结果明细（EXPMA ${p1}/${p2}/${p3}/${p4} · PE ≤ 45 · 换手 3%~10% · 量比 1.5~3.0）</text>
  ${diagCardsSvg}
  ${summaryCardSvg}

  <text x="${padX}" y="${H - 16}" font-family="Noto Sans CJK SC" font-size="11" fill="#64748B">本看板由纯量化算法引擎直算生成，仅供研究参考，不构成投资建议。</text>
  <text x="${W - padX}" y="${H - 16}" font-family="Noto Sans CJK SC" font-size="11" font-weight="700" fill="#FBBF24" text-anchor="end">公众号：我爱这young</text>
</svg>`;

  const fontFiles = getBundledFontFiles();
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1120 },
    font: {
      fontFiles,
      loadSystemFonts: false,
      defaultFontFamily: 'Noto Sans CJK SC',
    },
  });

  const rendered = resvg.render();
  return rendered.asPng();
}
