import { useEffect, useState } from 'react';
import { Lock, QrCode, ShieldCheck, X } from 'lucide-react';
import type { UserSession } from '../shared/wechatTypes.ts';
import { WechatPairingBox } from './WechatPairingBox.tsx';

interface AuthModalProps {
  open: boolean;
  reasonMessage?: string | null;
  onClose: () => void;
  onLoginSuccess: (session: UserSession) => void;
}

export function AuthModal({
  open,
  reasonMessage,
  onClose,
  onLoginSuccess,
}: AuthModalProps) {
  const [activeTab, setActiveTab] = useState<'wechat' | 'benefits'>('wechat');

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="关注微信公众号登录"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[680px] rounded-2xl border border-slate-800 bg-[#0F1521] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/15 text-sky-400">
              <QrCode className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">账号免密登录与权限解锁</h3>
              <p className="text-xs text-slate-400">
                绑定公众号即可瞬间解锁全量标的、估值安全垫与高清看板导出权限
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭登录弹窗"
            className="rounded-lg border border-slate-700 p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Context reason banner if triggered from gated feature */}
        {reasonMessage && (
          <div className="mx-5 mt-4 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-xs text-amber-200">
            <Lock className="h-3.5 w-3.5 shrink-0 text-amber-400" />
            <span>{reasonMessage}</span>
          </div>
        )}

        {/* Tab Bar */}
        <div className="flex items-center border-b border-slate-800 px-5 pt-3">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setActiveTab('wechat')}
              className={`border-b-2 pb-2.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'wechat'
                  ? 'border-blue-500 text-white'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              微信/公众号配对
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('benefits')}
              className={`border-b-2 pb-2.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'benefits'
                  ? 'border-blue-500 text-white'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              解锁权益说明
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5">
          {activeTab === 'wechat' ? (
            <WechatPairingBox
              active={open && activeTab === 'wechat'}
              onLoginSuccess={(session) => {
                onLoginSuccess(session);
                onClose();
              }}
            />
          ) : (
            <div className="space-y-3 text-xs leading-relaxed text-slate-300">
              <div className="rounded-xl border border-slate-800 bg-[#080B12] p-4 space-y-2.5">
                <div className="flex items-center gap-2 font-semibold text-white">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  <span>微信配对成功后即时解锁以下全站权益：</span>
                </div>
                <ul className="space-y-1.5 pl-6 list-disc text-slate-400">
                  <li>解除未关注访客永久仅限查询 3 个标的数量限制（不按日重置），解锁全市场无限次查股</li>
                  <li>查看高股息核心股池全部标的明细与理想目标买价、估值安全垫测算空间</li>
                  <li>解锁组合技术图（EXPMA + 成交量 + KDJ）、7 维诊断卡及公众号同款 2 倍超清看板 PNG 导出</li>
                  <li>与公众号双向打通，后续在微信聊天窗发送股票名称/简称/拼音/代码即可秒出诊断图</li>
                </ul>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setActiveTab('wechat')}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500"
                >
                  立即前往扫码配对
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
