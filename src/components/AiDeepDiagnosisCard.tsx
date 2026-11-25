import { AlertCircle, BrainCircuit, Loader2 } from 'lucide-react';
import type { AiDiagnosisResult } from '../shared/quantTypes.ts';

interface AiDeepDiagnosisCardProps {
  stockName: string;
  stockCode: string;
  loading: boolean;
  error: string | null;
  result: AiDiagnosisResult | null;
  onTrigger: () => void;
}

export function AiDeepDiagnosisCard({
  stockName,
  stockCode,
  loading,
  error,
  result,
  onTrigger,
}: AiDeepDiagnosisCardProps) {
  if (!loading && !error && !result) {
    return (
      <section className="rounded-xl border border-slate-800 bg-[#0F1521] p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold tracking-wide text-slate-100">
              AI 深度诊股（按需触发主力盘口复盘）
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              常规量化诊断与图表直算零 Token 消耗。仅在您主动点击时，结合实时资金流与盘口特征进行主力行为与明日操盘推演。
            </p>
          </div>
          <button
            type="button"
            onClick={onTrigger}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-500 whitespace-nowrap shrink-0"
          >
            <BrainCircuit className="h-4 w-4" />
            <span>启动 {stockName} AI 深度诊股</span>
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-blue-500/30 bg-[#0F1521]">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 bg-[#111A2E] px-5 py-3.5 rounded-t-xl">
        <div className="flex items-center gap-2">
          <BrainCircuit className="h-4 w-4 text-blue-400" />
          <h3 className="text-base font-semibold tracking-wide text-slate-100">
            AI 深度诊股 · {stockName} ({stockCode}) 主力盘口与操盘研判
          </h3>
        </div>
        <button
          type="button"
          onClick={onTrigger}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/40 bg-slate-900 px-3 py-1.5 text-xs font-medium text-blue-300 transition-colors hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          <span>{loading ? '正在推演盘口筹码...' : '重新深度研判'}</span>
        </button>
      </div>

      <div className="p-5">
        {loading && (
          <div className="flex items-center gap-3 py-6 text-sm text-slate-300">
            <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
            <span>正在结合实时主力净流入、换手率、量比及 EXPMA 结构研判主力筹码意图...</span>
          </div>
        )}

        {error && !loading && (
          <div className="flex items-start gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-semibold text-red-200">AI 深度诊股未完成</div>
              <div className="mt-1">{error}</div>
            </div>
          </div>
        )}

        {result && !loading && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-slate-800 bg-[#0A0E17] p-4 md:col-span-2">
                <div className="text-xs text-slate-400">主力核心操盘行为</div>
                <div className="mt-1.5 text-lg font-bold text-white">{result.mainBehavior}</div>
              </div>
              <div className="rounded-lg border border-blue-500/30 bg-[#111A2E] p-4 text-white">
                <div className="text-xs text-blue-200">多头强度评分</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-mono text-3xl font-bold tabular-nums text-white">
                    {Math.round(result.confidenceScore)}
                  </span>
                  <span className="text-xs text-slate-400">/ 100</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-slate-800 bg-[#0A0E17] p-4">
                <div className="text-xs font-semibold text-slate-200">资金结构与单笔挂单解析</div>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{result.capitalStructure}</p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-[#0A0E17] p-4">
                <div className="text-xs font-semibold text-slate-200">短期 1-3 日走势推演</div>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{result.shortTermOutlook}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
                <div className="text-xs font-semibold text-emerald-300">短线支撑 / 止损位</div>
                <div className="mt-1.5 font-mono text-sm font-semibold tabular-nums text-slate-100">
                  {result.supportPrice}
                </div>
              </div>
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
                <div className="text-xs font-semibold text-red-300">第一压力目标位</div>
                <div className="mt-1.5 font-mono text-sm font-semibold tabular-nums text-slate-100">
                  {result.pressurePrice}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-4">
              <div className="text-xs font-semibold text-blue-300">明日及短线操盘指导</div>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-200">{result.operationTips}</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
