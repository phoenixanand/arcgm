import { useEffect, useState } from 'react';
import { getUserStats, getUserRank } from './graphql/arcgm';
import { Link, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAccount, useConnect, useDisconnect, useWriteContract } from 'wagmi';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { readContract, waitForTransactionReceipt } from 'wagmi/actions';
import { decodeEventLog, createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';
import { useConfig } from 'wagmi';
import { Copy, ExternalLink, Flame, Trophy, UserRound, Wallet, Zap } from 'lucide-react';
import { arcMainnet } from './lib/chain';
import { CONTRACTS, GM_ABI, PROFILE_ABI, TEMPLATE_DEPLOYER_ABI } from './lib/contracts';

const truncate = (a: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—');
const explorer = (hash: string) => `https://explorer.arc.io/tx/${hash}`;
const indexerUrl = import.meta.env.VITE_INDEXER_URL as string | undefined;

// Matches the five one-time milestone tiers defined in ArcGM.sol /
// MilestoneBadges.sol (7, 30, 100, 200, 365 day streaks). Kept in one
// place so the celebration trigger and the profile badge list can never
// silently drift apart or miss a tier again.
const MILESTONE_TIERS: number[] = [7, 30, 100, 200, 365];

const presetAvatars = [
  "https://arcgm.s3.ap-south-1.amazonaws.com/avatars/avatar1.jpg",
  "https://arcgm.s3.ap-south-1.amazonaws.com/avatars/avatar2.jpg",
  "https://arcgm.s3.ap-south-1.amazonaws.com/avatars/avatar3.jpg",
  "https://arcgm.s3.ap-south-1.amazonaws.com/avatars/avatar4.jpg",
  "https://arcgm.s3.ap-south-1.amazonaws.com/avatars/avatar5.jpg",
  "https://arcgm.s3.ap-south-1.amazonaws.com/avatars/avatar6.jpg",
  "https://arcgm.s3.ap-south-1.amazonaws.com/avatars/avatar7.jpg",
  "https://arcgm.s3.ap-south-1.amazonaws.com/avatars/avatar8.jpg",
  "https://arcgm.s3.ap-south-1.amazonaws.com/avatars/avatar9.jpg"
];

function useGMStats(address?: `0x${string}`) {
  return useQuery({
    queryKey: ['gm', 'subgraph', address],
    enabled: !!address,
    queryFn: () => getUserStats(address!),
  });
}

// ---------------------------------------------------------------------------
// Wallet chain helpers.
//
// Wallet helpers read the wallet's actual chain directly and can request
// the wallet to add/switch to Arc Mainnet before any transaction is sent.
// ---------------------------------------------------------------------------

async function getConnectedProvider(connector: any) {
  if (!connector) throw new Error('No connected wallet found.');
  const provider = await connector.getProvider();
  if (!provider) throw new Error('Could not access the connected wallet provider.');
  return provider;
}

async function getWalletChainId(connector: any): Promise<number> {
  const provider = await getConnectedProvider(connector);
  const chainId = await provider.request({ method: 'eth_chainId' });
  return Number.parseInt(String(chainId), 16);
}

async function assertArcWallet(connector: any) {
  const chainId = await getWalletChainId(connector);
  if (chainId !== arcMainnet.id) {
    throw new Error('Arc Mainnet is not the active wallet network. No transaction was sent.');
  }
}

async function switchToArcMainnet(connector: any) {
  const provider = await getConnectedProvider(connector);
  const arcChainId = `0x${arcMainnet.id.toString(16)}`;

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: arcChainId }],
    });
  } catch (e: any) {
    const code = e?.code;

    // Wallets commonly use 4902 when the requested chain is not configured.
    if (code === 4902 || code === '4902') {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: arcChainId,
          chainName: arcMainnet.name,
          nativeCurrency: arcMainnet.nativeCurrency,
          rpcUrls: [arcMainnet.rpcUrls.default.http[0]],
          blockExplorerUrls: [arcMainnet.blockExplorers.default.url],
        }],
      });

      // Some wallets switch automatically after adding; others require a
      // second explicit switch request. Verify first, then switch if needed.
      if ((await getWalletChainId(connector)) !== arcMainnet.id) {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: arcChainId }],
        });
      }
    } else {
      throw e;
    }
  }

  await assertArcWallet(connector);
}

function useWalletNetwork(connector: any, isConnected: boolean) {
  const [walletChainId, setWalletChainId] = useState<number>();

  useEffect(() => {
    let cancelled = false;
    let provider: any;

    const refresh = async () => {
      if (!connector || !isConnected) {
        if (!cancelled) setWalletChainId(undefined);
        return;
      }
      try {
        provider = await connector.getProvider();
        const id = await getWalletChainId(connector);
        if (!cancelled) setWalletChainId(id);
      } catch {
        if (!cancelled) setWalletChainId(undefined);
      }
    };

    refresh();

    const onChainChanged = (hexChainId: string) => {
      setWalletChainId(Number.parseInt(String(hexChainId), 16));
    };

    const attach = async () => {
      try {
        provider = provider || (await connector?.getProvider());
        provider?.on?.('chainChanged', onChainChanged);
      } catch {}
    };
    attach();

    return () => {
      cancelled = true;
      provider?.removeListener?.('chainChanged', onChainChanged);
    };
  }, [connector, isConnected]);

  return {
    walletChainId,
    isArcWallet: walletChainId === arcMainnet.id,
  };
}

function Layout({ children }: { children: React.ReactNode }) {
  const { address, isConnected, connector } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-mark"><img src="/arcgm11.png" alt="ArcGM logo" /></span>
          <span>ArcPulse</span>
        </Link>
        <nav>
          <Link to="/leaderboard">Leaderboard</Link>
          <Link to="/directory">Arc dApps</Link>
          <Link to="/deploy">Deploy</Link>
          {address && <Link to={`/profile/${address}`}>Profile</Link>}
        </nav>
        <div className="wallet-area">
          {isConnected ? (
            <>
              <button className="wallet-chip" onClick={() => navigate(`/profile/${address}`)}>
                <Wallet size={15} />
                {truncate(address!)}
              </button>
              <button className="secondary" onClick={() => disconnect({ connector })}>
                Disconnect
              </button>
            </>
          ) : (
            <>
              {connectors
                .filter((c) => c.type === 'injected')
                .map((c) => (
                  <button key={c.uid} className="primary" onClick={() => connect({ connector: c })}>
                    {c.name}
                  </button>
                ))}
              {connectors.find((c) => c.type === 'walletConnect') && (
                <button
                  className="secondary"
                  onClick={() => {
                    const c = connectors.find((x) => x.type === 'walletConnect');
                    if (c) connect({ connector: c });
                  }}
                >
                  WalletConnect
                </button>
              )}
            </>
          )}
        </div>
      </header>
      {children}
      <footer>
        <span>arcgm · GM on Arc</span>
        <a href="https://docs.arc.io" target="_blank">
          Arc docs <ExternalLink size={13} />
        </a>
      </footer>
    </div>
  );
}

type GMStatus = 'idle' | 'switching' | 'wallet' | 'pending' | 'success' | 'error' | 'cancelled';

function Home() {
  const { address, isConnected, connector } = useAccount();
  const config = useConfig();
  const { writeContractAsync } = useWriteContract();
  const { isArcWallet } = useWalletNetwork(connector, isConnected);
  const [ref] = useSearchParams();
  const [friend, setFriend] = useState('');

  const [status, setStatus] = useState<GMStatus>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [hash, setHash] = useState('');
  const [countdownText, setCountdownText] = useState('');
  const [canGM, setCanGM] = useState(true);
  const [celebrating, setCelebrating] = useState(false);
  const [celebrationType, setCelebrationType] = useState<'normal' | 'milestone'>('normal');

  // Tracks the UTC day (Math.floor(unixSeconds / 86400)) of a GM tx that
  // was just confirmed by THIS client. The subgraph can take several
  // seconds (sometimes longer) to index the new block, so relying solely
  // on `stats.data.lastGMTimestamp` right after a successful tx would let
  // the button pop back to "enabled" until the refetch catches up. This
  // local flag closes that gap and naturally stops mattering once the UTC
  // day rolls over, since it's compared against the current day below.
  const [optimisticGMDay, setOptimisticGMDay] = useState<number | null>(null);

  // Separate status channel for the "GM a friend" action so it never
  // collides with the main GM button's status/UI.
  const [friendStatus, setFriendStatus] = useState<GMStatus>('idle');
  const [friendMessage, setFriendMessage] = useState('');

  const stats = useGMStats(address);
  const client = useQueryClient();
  const referral = ref.get('ref');

  useEffect(() => {
    const updateCooldown = () => {
      const nowSeconds = Math.floor(Date.now() / 1000);

      // ArcGM uses UTC calendar days. 00:00 UTC = 05:30 AM IST.
      const currentDay = Math.floor(nowSeconds / 86400);
      const nextReset = (currentDay + 1) * 86400;

      // Optimistic local flag wins immediately after a confirmed tx,
      // regardless of whether the subgraph has indexed it yet.
      let alreadyGMToday = optimisticGMDay === currentDay;

      if (!alreadyGMToday && stats.data) {
        // `stats.data` comes from the subgraph, whose User entity field
        // is named `lastGMTimestamp` (see schema.graphql) — it is NOT a
        // positional tuple, so it must be read by name, not by index.
        const lastGMTimestamp = Number((stats.data as any)?.lastGMTimestamp || 0);
        if (lastGMTimestamp > 0) {
          const lastGMDay = Math.floor(lastGMTimestamp / 86400);
          alreadyGMToday = lastGMDay === currentDay;
        }
      }

      setCanGM(!alreadyGMToday);

      if (alreadyGMToday) {
        const remainingSeconds = Math.max(0, nextReset - nowSeconds);
        const hours = Math.floor(remainingSeconds / 3600);
        const minutes = Math.floor((remainingSeconds % 3600) / 60);
        const seconds = remainingSeconds % 60;
        setCountdownText(
          `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
        );
      } else {
        setCountdownText('');
      }
    };

    updateCooldown();
    const timer = setInterval(updateCooldown, 1000);
    return () => clearInterval(timer);
  }, [stats.data, optimisticGMDay]);

  // ---------------------------------------------------------------------
  // Before any transaction, verify the real wallet chain. If needed, ask
  // the wallet to switch to Arc Mainnet. If Arc is not configured, ask the
  // wallet to add it first, then switch again if necessary.
  // ---------------------------------------------------------------------
  const ensureArcNetwork = async (
    setStatusFn: (s: GMStatus) => void,
    setMessageFn: (m: string) => void
  ) => {
    if (!connector) throw new Error('No connected wallet found.');

    const currentChainId = await getWalletChainId(connector);
    if (currentChainId === arcMainnet.id) {
      await assertArcWallet(connector);
      return;
    }

    setStatusFn('switching');
    setMessageFn('Switching your wallet to Arc Mainnet…');

    try {
      await switchToArcMainnet(connector);
      setMessageFn('Arc Mainnet selected. Continue in your wallet…');
    } catch (e: any) {
      const message = e?.shortMessage || e?.message || 'Could not switch to Arc Mainnet.';
      const code = e?.code;
      if (code === 4001 || code === '4001' || message.toLowerCase().includes('reject') || message.toLowerCase().includes('denied')) {
        throw Object.assign(new Error('Network switch cancelled. No transaction was sent.'), { cancelled: true });
      }
      throw new Error(message);
    }
  };

  const handleGMClick = async () => {
    if (!isConnected || !address || !connector) return;
    await say();
  };

  const say = async () => {
    if (!address || !connector) return;

    try {
      setHash('');
      setCelebrating(false);
      setStatus('idle');
      setStatusMessage('');

      await ensureArcNetwork(setStatus, setStatusMessage);

      setStatus('wallet');
      setStatusMessage('Confirm the GM transaction in your wallet…');

      const tx = await writeContractAsync({
        chainId: arcMainnet.id,
        address: CONTRACTS.gm,
        abi: GM_ABI,
        functionName: referral ? 'sayGMWithReferral' : 'sayGM',
        args: referral ? [referral as `0x${string}`] : [],
      });

      setHash(tx);
      setStatus('pending');
      setStatusMessage('Your GM is being recorded on Arc…');

      const receipt = await waitForTransactionReceipt(config, { hash: tx, confirmations: 1 });

      if (receipt.status === 'success') {
        setStatus('success');
        setStatusMessage('GM successfully recorded!');

        // Lock the button for the rest of the UTC day immediately — do
        // not wait for the subgraph to index this tx before disabling it.
        setOptimisticGMDay(Math.floor(Date.now() / 1000 / 86400));
        setCanGM(false);
        setCelebrating(true);

        await client.invalidateQueries({ queryKey: ['gm', 'subgraph', address] });

        const updatedStats = await readContract(config, {
          address: CONTRACTS.gm,
          abi: GM_ABI,
          functionName: 'users',
          args: [address],
        });

        const streak = Number((updatedStats as any)[2]);
        setCelebrationType(MILESTONE_TIERS.includes(streak) ? 'milestone' : 'normal');

        setTimeout(() => setCelebrating(false), 4000);
      } else {
        setStatus('error');
        setStatusMessage('The transaction was not confirmed successfully.');
      }
    } catch (e: any) {
      if (e?.cancelled) {
        setStatus('cancelled');
        setStatusMessage(e.message);
        return;
      }
      const message = e?.shortMessage || e?.message || 'Transaction failed';
      if (message.toLowerCase().includes('reject') || message.toLowerCase().includes('denied')) {
        setStatus('cancelled');
        setStatusMessage('Transaction cancelled. You rejected the wallet request.');
      } else {
        setStatus('error');
        setStatusMessage(message);
      }
    }
  };

  const gmFriend = async () => {
    if (!friend || !address || !connector) return;

    try {
      setFriendStatus('idle');
      setFriendMessage('');

      await ensureArcNetwork(setFriendStatus, setFriendMessage);

      setFriendStatus('wallet');
      setFriendMessage('Confirm GM-to-friend transaction…');

      const tx = await writeContractAsync({
        chainId: arcMainnet.id,
        address: CONTRACTS.gm,
        abi: GM_ABI,
        functionName: 'gmFriend',
        args: [friend as `0x${string}`],
      });

      setFriendStatus('pending');
      setFriendMessage('Sending GM to your friend…');

      const receipt = await waitForTransactionReceipt(config, { hash: tx, confirmations: 1 });

      if (receipt.status === 'success') {
        setFriendStatus('success');
        setFriendMessage('Friend GM sent ✓');
      } else {
        setFriendStatus('error');
        setFriendMessage('The transaction was not confirmed successfully.');
      }
    } catch (e: any) {
      if (e?.cancelled) {
        setFriendStatus('cancelled');
        setFriendMessage(e.message);
        return;
      }
      const message = e?.shortMessage || e?.message || 'Transaction failed';
      if (message.toLowerCase().includes('reject') || message.toLowerCase().includes('denied')) {
        setFriendStatus('cancelled');
        setFriendMessage('Transaction cancelled. You rejected the wallet request.');
      } else {
        setFriendStatus('error');
        setFriendMessage(message);
      }
    }
  };

  const celebration = celebrating ? (
    <div className={`celebration-overlay ${celebrationType === 'milestone' ? 'celebration-milestone' : ''}`}>
      <div className="confetti confetti-1">🎉</div>
      <div className="confetti confetti-2">✨</div>
      <div className="confetti confetti-3">🎊</div>
      <div className="confetti confetti-4">⭐</div>
      <div className="confetti confetti-5">🔥</div>
      <div className="confetti confetti-6">✨</div>

      <div className="celebration-card">
        <div className="celebration-icon">{celebrationType === 'milestone' ? '🏆' : '🎉'}</div>
        <h2>{celebrationType === 'milestone' ? 'MILESTONE UNLOCKED!' : 'GM SUCCESS!'}</h2>
        <p>Your GM has been recorded on Arc.</p>
        {celebrationType === 'milestone' && <strong className="milestone-text">🔥 Streak milestone reached!</strong>}
      </div>
    </div>
  ) : null;

  const gmButtonLabel = () => {
    if (!isConnected) return 'Connect wallet';
    if (status === 'switching') return 'Switch to Arc Mainnet';
    if (status === 'wallet') return 'Confirm in wallet…';
    if (status === 'pending') return 'Recording on Arc…';
    if (status === 'success') return 'GM recorded!';
    if (status === 'error') return 'Try again';
    if (!canGM) return `Resets in ${countdownText}`;
    return 'Say GM';
  };

  return (
    <>
      {celebration}

      <main className="container">
        <section className="hero">
          <div>
            <span className="eyebrow">ARC STREAK</span>
            <h1>
              Say GM
              <br />
              <em>Every Day</em>
            </h1>
            <p className="hero-copy">
              A tiny daily ritual, stored on-chain. Collect points, unlock streak badges, climb the leaderboard and
              GM your friends.
            </p>
            <div className="hero-actions">
              <Link className="text-link" to="/leaderboard">
                See leaderboard →
              </Link>
            </div>
          </div>

          <div className="gm-card">
            <div className="card-label">DAILY CHECK-IN</div>
            <button
              disabled={!isConnected || !canGM || status === 'switching' || status === 'wallet' || status === 'pending'}
              className={`gm-button ${status === 'success' ? 'gm-success' : ''} ${status === 'error' ? 'gm-error' : ''}`}
              onClick={handleGMClick}
            >
              <span>
                {status === 'switching'
                  ? '⛓️'
                  : status === 'pending'
                  ? '⏳'
                  : status === 'success'
                  ? '✓'
                  : status === 'error'
                  ? '!'
                  : 'GM'}
              </span>
              <small>{gmButtonLabel()}</small>
            </button>

            {!canGM && countdownText && (
              <div
                className="gm-reset-timer"
                aria-live="polite"
                style={{
                  marginTop: '10px',
                  textAlign: 'center',
                  fontSize: '15px',
                  color: 'var(--muted, #666)',
                  fontWeight: 500,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                Resets in {countdownText}
              </div>
            )}

            <div className="gm-meta">
              <span>+10 base / day</span>
              <span>+30 bonus every 7-day streak</span>
            </div>
          </div>
        </section>

        <section className="stats-grid">
  {[
    ['GM count', stats.data?.gmCount ?? '—'],
    ['Current streak', stats.data?.streak ?? '—'],
    ['Longest streak', stats.data?.longestStreak ?? '—'],
    ['Points', stats.data?.totalPoints ?? '—'],
  ].map(([k, v]) => (
    <div className="metric" key={k as string}>
      <span>{k}</span>
      <strong>{v as string}</strong>
    </div>
  ))}
</section>

        <section className="split">
          <div className="panel">
            <div className="panel-head">
              <span>
                <Zap size={17} /> GM a friend
              </span>
              <small>GM</small>
            </div>
            <div className="inline-form">
              <input value={friend} onChange={(e) => setFriend(e.target.value)} placeholder="0x wallet address" />
              <button className="primary" onClick={gmFriend} disabled={!friend || friendStatus === 'switching' || friendStatus === 'wallet' || friendStatus === 'pending'}>
                GM them
              </button>
            </div>
            {friendStatus !== 'idle' && friendMessage && (
              <p
                className="muted"
                style={{
                  marginTop: 8,
                  fontSize: 13,
                  color: friendStatus === 'error' || friendStatus === 'cancelled' ? '#b42318' : undefined,
                }}
              >
                {friendMessage}
              </p>
            )}
          </div>

          <div className="panel">
            <div className="panel-head">
              <span>
                <Flame size={17} /> Referral
              </span>
              <small>+50 each after first GM</small>
            </div>
            <div className="ref-box">
              {address ? `${location.origin}/?ref=${address}` : 'Connect a wallet to generate your link'}
              {address && (
                <button title="copy" onClick={() => navigator.clipboard.writeText(`${location.origin}/?ref=${address}`)}>
                  <Copy size={16} />
                </button>
              )}
            </div>
          </div>
        </section>

        {status !== 'idle' && (
          <div
            className={`tx-status ${
              status === 'success' ? 'tx-success' : status === 'error' || status === 'cancelled' ? 'tx-error' : 'tx-pending'
            }`}
          >
            <div className="tx-status-icon">
              {status === 'switching' && '⛓️'}
              {status === 'wallet' && '🔐'}
              {status === 'pending' && '⏳'}
              {status === 'success' && '✓'}
              {status === 'error' && '✕'}
              {status === 'cancelled' && '⚠'}
            </div>

            <div className="tx-status-content">
              <strong>
                {status === 'switching' && 'Waiting for network switch'}
                {status === 'wallet' && 'Waiting for wallet confirmation'}
                {status === 'pending' && 'GM transaction pending'}
                {status === 'success' && 'GM successfully recorded!'}
                {status === 'error' && 'GM transaction failed'}
                {status === 'cancelled' && 'Transaction cancelled'}
              </strong>

              <p>{statusMessage}</p>

              {hash && (
                <a href={explorer(hash)} target="_blank" rel="noreferrer">
                  View transaction on ArcScan
                  <ExternalLink size={13} />
                </a>
              )}
            </div>
          </div>
        )}
      </main>
    </>
  );
}

function Leaderboard() {
  const [params, setParams] = useSearchParams();
  const sort = (params.get('sort') || 'points') as 'points' | 'streak';
  const page = Number(params.get('page') || 1);
  const q = useQuery({
  queryKey: ['lb', sort, page],
  queryFn: async () => {
    const orderBy = sort === 'points' ? 'totalPoints' : 'streak';

    const query = `
      {
        users(
          first: 100
          orderBy: ${orderBy}
          orderDirection: desc
        ) {
          id
          totalPoints
          gmCount
          streak
          longestStreak
        }
      }
    `;

    const response = await fetch(
      import.meta.env.VITE_GRAPH_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(
        `GraphQL request failed: ${response.status}`
      );
    }

    const result = await response.json();

    if (result.errors?.length) {
      throw new Error(result.errors[0].message);
    }

    const users = result.data.users;

    const start = (page - 1) * 25;
    const end = start + 25;

    return {
      items: users.slice(start, end).map((u: any) => ({
        address: u.id,
        username: '',
        gm_count: u.gmCount,
        streak: u.streak,
        total_points: u.totalPoints,
      })),
      hasMore: end < users.length,
    };
  },
});
  return (
    <main className="container">
      <div className="page-title">
        <div>
          <span className="eyebrow"></span>
          <h2>Leaderboard</h2>
          <p>Top 100 Wallets</p>
        </div>
        <div className="tabs">
          {/* <button className={sort === 'points' ? 'active' : ''} onClick={() => setParams({ sort: 'points', page: '1' })}>
            Points
          </button> */}
          {/* <button className={sort === 'streak' ? 'active' : ''} onClick={() => setParams({ sort: 'streak', page: '1' })}>
            Streak
          </button> */}
        </div>
      </div>
      <div className="table panel">
        {q.isLoading ? (
          <p>Loading…</p>
        ) : (
          <>
            <div className="table-row table-head">
  <span>#</span>
  <span>Wallet</span>
  <span>GM</span>
  <span>Streak</span>
  <span>Points</span>
</div>

{q.data?.items?.map((u: any, i: number) => {
  const rank = (page - 1) * 25 + i + 1;

  return (
    <div
      className={`table-row ${
        rank === 1
          ? "rank-first"
          : rank === 2
          ? "rank-second"
          : rank === 3
          ? "rank-third"
          : ""
      }`}
      key={u.address}
    >
      <span className="rank">
        {rank === 1
          ? "🥇"
          : rank === 2
          ? "🥈"
          : rank === 3
          ? "🥉"
          : rank}
      </span>

      <Link to={`/profile/${u.address}`}>
        {u.username || truncate(u.address)}
      </Link>

      <span>{u.gm_count}</span>

      <span>{u.streak} 🔥</span>

      <strong>{u.total_points}</strong>
    </div>
  );
})}

          </>
        )}
        <div className="pager">
          <button disabled={page === 1} onClick={() => setParams({ sort, page: String(page - 1) })}>
            ←
          </button>
          <span>Page {page}</span>
          <button disabled={!q.data?.hasMore} onClick={() => setParams({ sort, page: String(page + 1) })}>
            →
          </button>
        </div>
      </div>
    </main>
  );
}

const DIRECTORY = [
  
  { cat: 'Bridges', name: 'ARC-Portal', desc: 'ARC main bridge integrated with layerzero, across, LIFI', url: 'https://portal.arc.io/swap', icon: 'A' },
  { cat: 'Bridges', name: 'Across', desc: 'Crosschain transfers for moving assets to Arc.', url: 'https://across.to', icon: '↗' },
  
  { cat: 'Bridges', name: 'Relay', desc: 'Crosschain transfers for moving assets from/to Arc', url: 'https://relay.link/', icon: 'R' },
  { cat: 'DeFi', name: 'Uniswap', desc: 'decentralized exchange (DEX) on the ARC, enabling permissionless token swaps via automated market makers (AMM) and liquidity pools rather than traditional order books.', url: 'https://app.uniswap.org/', icon: 'U' },
  { cat: 'DeFi', name: 'Aerodrome', desc: 'Aerodrome is a Token swaps and liquidity', url: 'https://app.aero.xyz/', icon: 'A' },
  { cat: 'DeFi', name: 'Xylonet', desc: 'XyloNet is the Stablecoin SuperExchange on Arc where swap any token, bridge USDC with Circle CCTP v2, and tip anyone on X in USDC.', url: 'https://xylonet.xyz/', icon: 'X' },
  { cat: 'Lending', name: 'Aave', desc: 'Aave is a decentralized finance protocol (DeFi) that enables the lending and borrowing of cryptocurrencies without the involvement of intermediary financial institutions.', url: 'https://app.aave.com/', icon: 'A' },
  { cat: 'Lending', name: 'Morpho', desc: 'Morpho is a Permissionless lending markets', url: 'https://morpho.org/', icon: 'M' },
  { cat: 'other', name: 'EdgeX', desc: 'EdgeX is a trading perpetual futures and spot markets while maintaining on-chain settlement and user control of assets', url: 'https://pro.edgex.exchange/', icon: 'E' },
  // {
  //   cat: 'Marketplaces',
  //   name: 'Tradable',
  //   desc: 'Tokenized private-market infrastructure expanding to Arc.',
  //   url: 'https://tradable.finance',
  //   icon: 'T',
  // },
  {
    cat: 'Marketplaces',
    name: 'OpenSea',
    desc: 'NFT Marketplace for ARC',
    url: 'https://opensea.io',
    icon: 'o',
  },
  { cat: 'Other', name: 'Maple', desc: 'Maple is the onchain asset management Through institutional-grade lending and yield strategies to the transparency and innovation of crypto', url: 'https://maple.finance/', icon: 'M' },
  { cat: 'Other', name: 'Circle', desc: 'Infrastructure behind Arc and USDC-native finance.', url: 'https://www.circle.com', icon: '◉' }
  
];

function Directory() {
  const cats = ['All', 'DeFi', 'Lending', 'Bridges', 'Gambling', 'Marketplaces', 'Launchpad', 'Agents', 'Payments' , 'Other'];
  const [cat, setCat] = useState('All');
  const rows = DIRECTORY.filter((d) => cat === 'All' || d.cat === cat);
  return (
    <main className="container">
      <div className="page-title">
        <div>
          <span className="eyebrow">DISCOVERY</span>
          <h2>Arc dApps</h2>
          <p>Explore the Live Arc ecosystem</p>
        </div>
      </div>
      <div className="chips">
        {cats.map((c) => (
          <button className={c === cat ? 'active' : ''} onClick={() => setCat(c)} key={c}>
            {c}
          </button>
        ))}
      </div>
      <div className="directory">
        {rows.map((d) => (
          <article className="dapp panel" key={d.name}>
            <div className="dapp-icon">{d.icon}</div>
            <div>
              <span className="eyebrow">{d.cat}</span>
              <h3>{d.name}</h3>
              <p>{d.desc}</p>
            </div>
            <a href={d.url} target="_blank" className="secondary" >
              Open <ExternalLink size={14} />
            </a>
          </article>
        ))}
      </div>
    </main>
  );
}

function Profile({ wallet }: { wallet: string }) {
  const address = wallet as `0x${string}`;
  const config = useConfig();
  const stats = useGMStats(address);
  const {data:rank}=useQuery({ queryKey:['user-rank',address], enabled:!!address, queryFn:()=>getUserRank(address),});
  const { data: profile } = useQuery({
    queryKey: ['profile-chain', address],
    queryFn: () => readContract(config, { address: CONTRACTS.profile, abi: PROFILE_ABI, functionName: 'profiles', args: [address] }),
  });
  const ensClient = createPublicClient({ chain: mainnet, transport: http() });
  const { data: ensName } = useQuery({ queryKey: ['ens-name', address], queryFn: () => ensClient.getEnsName({ address }) });
  const { data: ensAvatar } = useQuery({
    queryKey: ['ens-avatar', address],
    queryFn: () => ensClient.getEnsAvatar({ name: ensName! }),
    enabled: !!ensName,
  });
  const { data: idx } = useQuery({
    queryKey: ['profile-index', address],
    queryFn: () => fetch(`${indexerUrl}/profiles/${address}`).then((r) => r.json()),
    enabled: !!indexerUrl,
  });
  const { connector, address: connectedAddress } = useAccount();
  const own = connectedAddress?.toLowerCase() === address.toLowerCase();
  const [name, setName] = useState((profile as any)?.[0] || '');
  const [avatar, setAvatar] = useState((profile as any)?.[1] || '');
  const { writeContractAsync } = useWriteContract();

  useEffect(() => {
    if (profile) {
      setName((profile as any)[0] || '');
      setAvatar((profile as any)[1] || '');
    }
  }, [profile]);

  const save = async () => {
    if (!connector) return;
    await assertArcWallet(connector);
    await writeContractAsync({ chainId: arcMainnet.id, address: CONTRACTS.profile, abi: PROFILE_ABI, functionName: 'setProfile', args: [name, avatar] });
  };

  const displayName = (profile as any)?.[0] || idx?.username || ensName || truncate(address);
  const displayAvatar = avatar || ensAvatar || '';
  const badges = MILESTONE_TIERS.filter((t) => idx?.badges?.includes(t));
  

  return (
    <main className="container profile-page">
      <section className="profile-hero panel">
        <div className="avatar">{displayAvatar ? <img src={displayAvatar} alt="avatar" /> : <UserRound />}</div>
        <div>
          <span className="eyebrow">PROFILE</span>
          <h2>{displayName}</h2>
          <p className="mono">{address}</p>
        </div>
        <div className="profile-link">
          {/* <a href={`${location.origin}/profile/${address}`}>
            <Copy size={15} /> 
          </a> */}
        </div>
      </section>

      {own && (
        <section className="panel editor">
          <h3>Edit profile</h3>
          <div className="inline-form">
            <input placeholder="Username" value={name} onChange={(e) => setName(e.target.value)} />
            <button className="secondary" onClick={() => {
    const randomAvatar =
      presetAvatars[
        Math.floor(Math.random() * presetAvatars.length)
      ];

    setAvatar(randomAvatar);
  }}
>
  Avatar
</button>
            <button className="primary" onClick={save}>
              Save 
            </button>
          </div>
        </section>
      )}

      <section className="stats-grid">
  {[
    ['GM count', stats.data?.gmCount ?? '—'],
    ['Current streak', stats.data?.streak ?? '—'],
    ['Longest streak', stats.data?.longestStreak ?? '—'],
    ['Total points', stats.data?.totalPoints ?? '—'],
    ['Rank',rank ? `#${rank}` : '—'],
    ['Referrals', stats.data?.successfulReferrals ?? '—'],
  ].map(([k, v]) => (
    <div className="metric" key={k as string}>
      <span>{k}</span>
      <strong>{v as string}</strong>
    </div>
  ))}
</section>

      <section className="panel">
        <div className="panel-head">
          <span>
            <Trophy size={17} /> Milestone badges
          </span>
          <small>ERC-721 </small>
        </div>
        {badges.length ? (
          <div className="badges">
            {badges.map((b) => (
              <div className="badge" key={b}>
                <div className="badge-medal">{b}</div>
                <span>{b}-Day Streak</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">No milestone badge yet. Keep the streak alive.</p>
        )}
      </section>
    </main>
  );
}

function ContractDeploy() {
  return (
    <main className="container">
      <div className="page-title">
        <div>
          {/* <span className="eyebrow">BUILDER TOOL</span> */}
          <h2>Deploy a contract</h2>
          <p>Deploy a simple contract</p>
        </div>
      </div>
      <DeployCard />
    </main>
  );
}

function DeployCard() {
  const { address, connector } = useAccount();
  const config = useConfig();
  const { writeContractAsync } = useWriteContract();
  const [initial, setInitial] = useState('Hello Arc');
  const [gas, setGas] = useState<bigint>();
  const [gasCost, setGasCost] = useState<string>('—');
  const [result, setResult] = useState('');

  const ensureArc = async () => {
    if (!connector) throw new Error('No connected wallet found.');
    const currentChainId = await getWalletChainId(connector);

    if (currentChainId !== arcMainnet.id) {
      await switchToArcMainnet(connector);
    }

    await assertArcWallet(connector);
  };

  const estimate = async () => {
  if (!address || !connector) return;

  try {
    await ensureArc();

    const { estimateContractGas, getGasPrice } = await import(
      'wagmi/actions'
    );

    console.log('Estimating gas...');
    console.log('Wallet:', address);
    console.log('Contract:', CONTRACTS.templateDeployer);
    console.log('Initial value:', initial);

    const g = await estimateContractGas(config, {
      address: CONTRACTS.templateDeployer,
      abi: TEMPLATE_DEPLOYER_ABI,
      functionName: 'deployStorage',
      args: [initial],
      account: address,
    });

    console.log('Estimated gas:', g.toString());

    const price = await getGasPrice(config);

    console.log('Gas price:', price.toString());

    setGas(g);

    // Arc uses USDC as the gas currency.
    // USDC has 6 decimals.
    const cost = Number(g * price) / 1e6;

    setGasCost(cost.toFixed(6) + ' USDC');

  } catch (e) {
    console.error('GAS ESTIMATION ERROR:', e);

    setGas(undefined);
    setGasCost('Unable to estimate');
  }
};

  const deploy = async () => {
    if (!address || !connector) return;
    await ensureArc();
    const hash = await writeContractAsync({
      chainId: arcMainnet.id,
      address: CONTRACTS.templateDeployer,
      abi: TEMPLATE_DEPLOYER_ABI,
      functionName: 'deployStorage',
      args: [initial],
    });
    const receipt = await waitForTransactionReceipt(config, { hash, confirmations: 1 });

    // Try every log in the receipt until one successfully decodes as
    // TemplateDeployed, rather than guessing which log is "the" event
    // by its topic count (fragile if the ABI or event shape ever changes).
    let deployed = '';
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: TEMPLATE_DEPLOYER_ABI,
          eventName: 'TemplateDeployed',
          data: log.data,
          topics: log.topics,
        });
        deployed = (decoded.args as any).contractAddress || '';
        break;
      } catch {
        continue;
      }
    }

    setResult(deployed || 'Deployment confirmed — open the transaction to inspect the created address');
  };

  return (
    <section className="panel deploy-box">
      <label>
        Initial stored value
        <input value={initial} onChange={(e) => setInitial(e.target.value)} />
      </label>
      <div className="gas-box">
        <span>Estimated gas </span>
        <strong>
          {gas ? gas.toString() : '—'} · {gasCost}
        </strong>
      </div>
      <div className="hero-actions">
        <button className="secondary" onClick={estimate} disabled={!address}>
          Estimate gas
        </button>
        <button className="primary" disabled={!address} onClick={deploy}>
          Deploy from wallet
        </button>
      </div>
      {result && (
        <div className="success">
          Contract deployed at{' '}
          <a href={`https://explorer.arc.io/address/${result}`} target="_blank">
            {result} <ExternalLink size={13} />
          </a>
        </div>
      )}
    </section>
  );
}

function ProfileRoute() {
  const { wallet } = useParams();
  const [params] = useSearchParams();
  return <Profile wallet={wallet || params.get('wallet') || ''} />;
}

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/directory" element={<Directory />} />
        <Route path="/deploy" element={<ContractDeploy />} />
        <Route path="/profile/:wallet" element={<ProfileRoute />} />
      </Routes>
    </Layout>
  );
}
