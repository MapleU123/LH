import { useCallback, useEffect, useState } from 'react';
import { LogOut, Maximize2, QrCode, UserCheck } from 'lucide-react';
import { AuthModal } from './components/AuthModal.tsx';
import { StockQuickLookup } from './components/StockQuickLookup.tsx';
import { StockTable, type DividendPoolItem } from './components/StockTable.tsx';
import type { GuestQuotaInfo, UserSession } from './shared/wechatTypes.ts';
import {
  fetchServerGuestQuota,
  loadLocalGuestQuota,
} from './utils/guestQuotaClient.ts';
import { fetchCurrentSession, logoutSession } from './utils/wechatPairingService.ts';

interface LookupTarget {
  code: string;
  isPreview: boolean;
  nonce: number;
}

export default function App() {
  const [embeddedTarget, setEmbeddedTarget] = useState<LookupTarget>({
    code: '601088',
    isPreview: true,
    nonce: 0,
  });
  const [modalTarget, setModalTarget] = useState<LookupTarget | null>(null);
  const [dividendPool, setDividendPool] = useState<DividendPoolItem[]>([]);

  const [session, setSession] = useState<UserSession | null>(null);
  const [guestQuota, setGuestQuota] = useState<GuestQuotaInfo>(() => loadLocalGuestQuota(false));
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authReason, setAuthReason] = useState<string | null>(null);

  const isLoggedIn = Boolean(session?.isLoggedIn);

  useEffect(() => {
    fetchCurrentSession()
      .then((s) => {
        if (s) setSession(s);
        return fetchServerGuestQuota(Boolean(s?.isLoggedIn));
      })
      .then((q) => {
        setGuestQuota(q);
      })
      .catch(() => {
        // Ignore auth check errors on boot
      });

    fetch('/api/dividend-pool')
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then((data: { items?: DividendPoolItem[] }) => {
        if (Array.isArray(data.items)) {
          setDividendPool(data.items);
        }
      })
      .catch(() => {
        // Ignore network errors for secondary pool table
      });
  }, []);

  useEffect(() => {
    if (!modalTarget) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setModalTarget(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [modalTarget]);

  const handleLoadEmbedded = (code: string) => {
    setEmbeddedTarget({ code, isPreview: false, nonce: Date.now() });
    document.getElementById('lookup')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleOpenModalFromTable = (code: string) => {
    setModalTarget({ code, isPreview: false, nonce: Date.now() });
  };

  const handleRequireAuth = useCallback((reason?: string) => {
    setAuthReason(reason || null);
    setAuthModalOpen(true);
  }, []);

  const handleLoginSuccess = useCallback((nextSession: UserSession) => {
    setSession(nextSession);
    setAuthReason(null);
    void fetchServerGuestQuota(true).then(setGuestQuota);
  }, []);

  const handleLogout = async () => {
    try {
      await logoutSession(session?.token);
    } finally {
      setSession(null);
      void fetchServerGuestQuota(false).then(setGuestQuota);
    }
  };

  return (
    <div className="min-h-screen bg-[#080B12] text-slate-100">
      {/* Strict 3-Zone Top Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-[#080B12]/95 backdrop-blur-xs">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <a
            href="#lookup"
            className="text-base font-bold tracking-wide text-white whitespace-nowrap shrink-0"
          >
            个股量化分析
          </a>

          <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-slate-400">
            <a
              href="#lookup"
              className="transition-colors hover:text-white hover:underline underline-offset-4 whitespace-nowrap shrink-0"
            >
              个股速查
            </a>
            <a
              href="#dividend-pool"
              className="transition-colors hover:text-white hover:underline underline-offset-4 whitespace-nowrap shrink-0"
            >
              高股息股池
            </a>
            <a
              href="#rules"
              className="transition-colors hover:text-white hover:underline underline-offset-4 whitespace-nowrap shrink-0"
            >
              7维量化规则
            </a>
            <a
              href="#wechat-sync"
              className="transition-colors hover:text-white hover:underline underline-offset-4 whitespace-nowrap shrink-0"
            >
              公众号同源
            </a>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            {isLoggedIn && session ? (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs">
                <UserCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                <span className="max-w-[110px] truncate font-semibold text-emerald-200">
                  {session.wechatNickname || session.name}
                </span>
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  title="退出登录"
                  className="ml-1 inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[11px] text-slate-300 hover:text-white"
                >
                  <LogOut className="h-3 w-3" />
                  <span>退出</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => handleRequireAuth()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/15 px-3 py-2 text-xs font-semibold text-sky-300 transition-colors hover:bg-sky-500/25 whitespace-nowrap shrink-0"
              >
                <QrCode className="h-3.5 w-3.5" />
                <span>关注微信公众号登录</span>
              </button>
            )}

            <button
              type="button"
              onClick={() =>
                setModalTarget({
                  code: embeddedTarget.code,
                  isPreview: embeddedTarget.code === '601088' && embeddedTarget.isPreview,
                  nonce: Date.now(),
                })
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-500 whitespace-nowrap shrink-0"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              <span>弹窗速查模式</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1280px] space-y-10 px-4 py-6 sm:px-6">
        {/* Embedded Stock Quick Lookup Workspace */}
        <section id="lookup" className="scroll-mt-20">
          <StockQuickLookup
            mode="embedded"
            initialQuery={embeddedTarget.code}
            initialIsPreview={embeddedTarget.isPreview}
            queryNonce={embeddedTarget.nonce}
            isLoggedIn={isLoggedIn}
            guestQuota={guestQuota}
            onGuestQuotaChange={setGuestQuota}
            onRequireAuth={handleRequireAuth}
          />
        </section>

        {/* High-Dividend Watchlist Pool Table + Bottom Unlock Guide Wall */}
        <StockTable
          items={dividendPool}
          isLoggedIn={isLoggedIn}
          onLoadEmbedded={handleLoadEmbedded}
          onOpenModal={handleOpenModalFromTable}
          onLoginSuccess={handleLoginSuccess}
          onOpenAuthModal={() => handleRequireAuth('扫码并发送 6 位配对码即可解锁无限查股、全量高股息标的与估值安全垫')}
        />

        {/* Rules & WeChat Sync Explanation */}
        <section id="rules" className="scroll-mt-20 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-[#0F1521] p-5">
            <h3 className="text-base font-bold tracking-wide text-slate-100">
              双周期 EXPMA 与 7 维纯算法直算规则
            </h3>
            <ul className="mt-3 space-y-2 text-xs leading-relaxed text-slate-400">
              <li>
                <span className="font-semibold text-slate-200">1. 双周期均线簇：</span>
                中长周期采用 <span className="font-mono text-slate-300">EXPMA 7/21/55/144</span> 研判波段结构，短周期切换{' '}
                <span className="font-mono text-slate-300">EXPMA 5/10/20/60</span> 跟踪短线强弱，零 LLM 依赖纯算法递推计算。
              </li>
              <li>
                <span className="font-semibold text-slate-200">2. 量价与 KDJ 共振：</span>
                实时拉取 250 日前复权日线计算 <span className="font-mono text-slate-300">KDJ(9,3,3)</span>，结合 5 日/20 日均量与实时量比判定温和放量及显著放量异动（&gt;3.0）。
              </li>
              <li>
                <span className="font-semibold text-slate-200">3. 实时调参联动：</span>
                顶部规则栏调整 PE 上限、换手率区间或量比区间后，前端即刻重算 7 维通过/警示/不通过状态与综合评分。
              </li>
            </ul>
          </div>

          <div id="wechat-sync" className="scroll-mt-20 rounded-xl border border-slate-800 bg-[#0F1521] p-5">
            <h3 className="text-base font-bold tracking-wide text-slate-100">
              微信公众号双向配对与同源出图体系
            </h3>
            <ul className="mt-3 space-y-2 text-xs leading-relaxed text-slate-400">
              <li>
                <span className="font-semibold text-slate-200">1. 6 位配对码免密解锁：</span>
                未关注公众号访客永久累计仅限查询 3 个个股（不随日期重置）；关注公众号并发送 6 位配对码登录后立即解锁无限查询与高清导图权限。
              </li>
              <li>
                <span className="font-semibold text-slate-200">2. 服务端同源看板 PNG：</span>
                点击顶部「公众号自动回复图」即可预览并下载由服务端 <span className="font-mono text-slate-300">@resvg/resvg-js</span> 与内置中文字体直出渲染的 2 倍超清看板，与微信自动回复完全同源。
              </li>
              <li>
                <span className="font-semibold text-slate-200">3. 独立按需 AI 深度诊股：</span>
                普通查股、切换周期与调整规则阈值零 Token 消耗；仅在主动点击「AI 深度诊股」时调用大模型输出主力行为与明日操盘结构化建议。
              </li>
            </ul>
          </div>
        </section>
      </main>

      <footer className="mt-8 border-t border-slate-800 bg-[#080B12] py-6">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-4 px-4 text-xs text-slate-500 sm:px-6">
          <span>个股量化分析 · A股双周期 EXPMA 与 7 维量化诊断引擎</span>
          <span>行情数据仅作量化研究参考，不构成任何证券投资建议</span>
        </div>
      </footer>

      {/* Modal Mount Mode */}
      {modalTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="个股速查弹窗"
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 p-3 sm:p-6 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalTarget(null);
          }}
        >
          <div className="my-2 w-full max-w-[1200px] rounded-2xl border border-slate-800 bg-[#080B12] p-4 sm:p-6 shadow-2xl">
            <StockQuickLookup
              mode="modal"
              initialQuery={modalTarget.code}
              initialIsPreview={modalTarget.isPreview}
              queryNonce={modalTarget.nonce}
              onCloseModal={() => setModalTarget(null)}
              isLoggedIn={isLoggedIn}
              guestQuota={guestQuota}
              onGuestQuotaChange={setGuestQuota}
              onRequireAuth={handleRequireAuth}
            />
          </div>
        </div>
      )}

      {/* Auth Pairing Modal */}
      <AuthModal
        open={authModalOpen}
        reasonMessage={authReason}
        onClose={() => {
          setAuthModalOpen(false);
          setAuthReason(null);
        }}
        onLoginSuccess={handleLoginSuccess}
      />
    </div>
  );
}

