import { ExternalLink, Lock, ShieldCheck } from 'lucide-react';
import type { UserSession } from '../shared/wechatTypes.ts';
import { WechatPairingBox } from './WechatPairingBox.tsx';

export interface DividendPoolItem {
  code: string;
  name: string;
  sector: string;
  board: string;
  ttmDividendPerShare: number;
  targetDividendYield: number;
  payoutNote: string;
}

interface StockTableProps {
  items: DividendPoolItem[];
  isLoggedIn: boolean;
  onLoadEmbedded: (code: string) => void;
  onOpenModal: (code: string) => void;
  onLoginSuccess: (session: UserSession) => void;
  onOpenAuthModal: () => void;
}

const PREVIEW_LIMIT = 5;

export function StockTable({
  items,
  isLoggedIn,
  onLoadEmbedded,
  onOpenModal,
  onLoginSuccess,
  onOpenAuthModal,
}: StockTableProps) {
  const visibleItems = isLoggedIn ? items : items.slice(0, PREVIEW_LIMIT);
  const lockedCount = Math.max(0, items.length - PREVIEW_LIMIT);

  return (
    <section id="dividend-pool" className="scroll-mt-20 rounded-xl border border-slate-800 bg-[#0F1521]">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 px-5 py-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-base font-bold tracking-wide text-slate-100">
              高股息核心股池与到价提醒基准
            </h2>
            {isLoggedIn ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                <ShieldCheck className="h-3 w-3" />
                <span>已解锁全量 {items.length} 只标的与估值安全垫</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                <Lock className="h-3 w-3" />
                <span>当前预览 {visibleItems.length}/{items.length} 只</span>
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            点击「内嵌诊断」或「弹窗速查」可自动联动计算 TTM 股息率、理想买价（每股派息 ÷ 目标股息率）及估值安全垫
          </p>
        </div>

        {!isLoggedIn && (
          <button
            type="button"
            onClick={onOpenAuthModal}
            className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/15 px-3 py-1.5 text-xs font-semibold text-sky-300 transition-colors hover:bg-sky-500/25 whitespace-nowrap"
          >
            <Lock className="h-3.5 w-3.5" />
            <span>微信配对解锁全量标的数据</span>
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-800 bg-[#0A0E17] text-slate-400">
              <th className="px-5 py-3 font-semibold">代码</th>
              <th className="px-4 py-3 font-semibold">股票简称</th>
              <th className="px-4 py-3 font-semibold">板块 / 行业</th>
              <th className="px-4 py-3 font-semibold text-right">TTM每股派息</th>
              <th className="px-4 py-3 font-semibold text-right">目标股息率</th>
              <th className="px-4 py-3 font-semibold text-right">理想目标买价</th>
              <th className="px-4 py-3 font-semibold text-right">估值安全垫规则</th>
              <th className="px-4 py-3 font-semibold">分红特征摘要</th>
              <th className="px-5 py-3 font-semibold text-right">快捷诊断</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {visibleItems.map((item) => {
              const targetBuy = item.ttmDividendPerShare / (item.targetDividendYield / 100);
              const safetyBufferPct = ((1 - 1 / (item.targetDividendYield / 3.5)) * 100);
              return (
                <tr key={item.code} className="transition-colors hover:bg-slate-800/40">
                  <td className="px-5 py-3 font-mono font-semibold tabular-nums text-slate-300">
                    {item.code}
                  </td>
                  <td className="px-4 py-3 font-semibold text-white whitespace-nowrap">
                    {item.name}
                  </td>
                  <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                    {item.board} · {item.sector}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-200">
                    ¥{item.ttmDividendPerShare.toFixed(3)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-blue-400">
                    {item.targetDividendYield.toFixed(1)}%
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-slate-100">
                    {isLoggedIn ? (
                      `¥${targetBuy.toFixed(2)}`
                    ) : (
                      <button
                        type="button"
                        onClick={onOpenAuthModal}
                        className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] font-normal text-amber-300 hover:border-amber-500/40"
                      >
                        <Lock className="h-2.5 w-2.5" />
                        <span>配对解锁</span>
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-300">
                    {isLoggedIn ? (
                      <span className="text-emerald-400">
                        安全垫 +{Math.max(8, safetyBufferPct).toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-slate-500">***</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-400 max-w-xs truncate">{item.payoutNote}</td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onLoadEmbedded(item.code)}
                        className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800"
                      >
                        内嵌诊断
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenModal(item.code)}
                        className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-500"
                      >
                        <span>弹窗速查</span>
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Bottom Unlock Guide Wall when not logged in */}
      {!isLoggedIn && (
        <div className="border-t border-slate-800 bg-[#0A0F1A] p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-amber-400" />
              <h3 className="text-sm font-bold text-white">
                剩余 {lockedCount} 只高股息标的、估值安全垫与高清导图权限待解锁
              </h3>
            </div>
            <span className="text-xs text-slate-400">
              免密免注册 · 关注公众号并回复 6 位配对码即可自动解锁
            </span>
          </div>

          <WechatPairingBox
            active={!isLoggedIn}
            compact
            onLoginSuccess={onLoginSuccess}
          />
        </div>
      )}
    </section>
  );
}
