"use client";
import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type FormEvent,
  type ReactNode,
} from "react";
import Image from "next/image";
import { roomArt } from "../shared/rooms";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Check,
  Copy,
  X,
  Plus,
  Minus,
  Users,
  ShieldCheck,
  Wallet,
  History,
  Volume2,
  VolumeX,
  LockKeyhole,
  Menu,
  Spade,
  Sparkles,
  Clock3,
  Download,
  RefreshCw,
  Eye,
  CircleHelp,
  LogOut,
  DoorOpen,
  Undo2,
  Trash2,
  UserRound,
  ChevronRight,
} from "lucide-react";
import QRCode from "qrcode";
import { Avatar, ProfilePage } from "./Profile";
import { CHIP_VALUES, chipTotal, chipsForAmount } from "../shared/chips";
import { FEE_POLICY, roundFee } from "../shared/fees";
import { money, cardLabel, suit, total, hash } from "../shared/game";
import {
  ASSETS,
  canonical,
  verifyReceipt,
  type Receipt,
  type Transfer,
} from "../shared/protocol";
import type { Account, Identity, TableView } from "./types";

type ModalName = "login" | "cashier" | "private" | "session" | null;
const Logo = ({ hero = false }: { hero?: boolean }) => (
  <Image
    src="/bonkers-blackjack-logo.png"
    alt="Bonkers Blackjack"
    width={1254}
    height={1254}
    loading="eager"
    className={hero ? "hero-logo" : "brand-logo"}
    sizes={hero ? "(max-width: 800px) 80vw, 540px" : "70px"}
  />
);
const random = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
function Card({ value, small = false }: { value: number; small?: boolean }) {
  return (
    <div
      className={`card ${small ? "small" : ""} ${value < 0 ? "back" : suit(value) === "♥" || suit(value) === "♦" ? "red" : ""}`}
      aria-label={
        value < 0 ? "Hidden card" : `${cardLabel(value)} ${suit(value)}`
      }
    >
      {value < 0 ? (
        <Spade />
      ) : (
        <>
          <span>
            {cardLabel(value)}
            <small>{suit(value)}</small>
          </span>
          <b>{suit(value)}</b>
          <span className="corner">{cardLabel(value)}</span>
        </>
      )}
    </div>
  );
}
function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const els = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input,select,a[href],[tabindex="0"]',
          ) ?? [],
        );
        const first = els[0],
          last = els.at(-1);
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", key);
      before?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <div className="modal-heading">
          <h2 id="dialog-title">{title}</h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export default function Club({cryptoTestingEnabled=false}:{cryptoTestingEnabled?:boolean}) {
  const [page, setPage] = useState("home"),
    [tableId, setTableId] = useState("bonkers-room");
  const [profileId, setProfileId] = useState("");
  const [identity, setIdentity] = useState<Identity | null>(null),
    identityRef = useRef<Identity | null>(null);
  const [account, setAccount] = useState<Account | null>(null),
    accountRef = useRef<Account | null>(null);
  const [tables, setTables] = useState<TableView[]>([]),
    [table, setTable] = useState<TableView | null>(null);
  const [modal, setModal] = useState<ModalName>(null),
    [busy, setBusy] = useState(false),
    busyRef = useRef(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [storageReady, setStorageReady] = useState<boolean | null>(null);
  const [online, setOnline] = useState(true),
    [now, setNow] = useState(0),
    [sound, setSound] = useState(false),
    [menu, setMenu] = useState(false);
  const [chipDraft, setChipDraft] = useState<number[] | null>(null);
  const chipDraftRef = useRef<number[] | null>(null);
  const chipQueue = useRef<Promise<void>>(Promise.resolve());
  const [pendingChips, setPendingChips] = useState(0);
  const pendingChipsRef = useRef(0);
  const tableRef = useRef(table);
  tableRef.current = table;
  const [receipts, setReceipts] = useState<Receipt[]>([]),
    [verification, setVerification] = useState<{
      valid: boolean;
      detail: string;
    } | null>(null);
  const [transferTab, setTransferTab] = useState<"deposit" | "withdrawal">(
      "deposit",
    ),
    [assetIndex, setAssetIndex] = useState(4),
    [amount, setAmount] = useState("100"),
    [destination, setDestination] = useState("demo:my-wallet");
  const [selectedTransfer, setSelectedTransfer] = useState<string | null>(null),
    [qr, setQr] = useState("");
  const [consent, setConsent] = useState(false),
    [privateName, setPrivateName] = useState(""),
    [sessionLimit, setSessionLimit] = useState("500");
  const updateAccount = useCallback((a: Account | null) => {
    accountRef.current = a;
    setAccount(a);
  }, []);
  const closeModal = useCallback(() => setModal(null), []);
  const go = (target: string) => {
    window.location.hash = target;
    setMenu(false);
  };
  useEffect(() => {
    const route = () => {
      const parts = window.location.hash.slice(1).split("/");
      setPage(parts[0] || "home");
      setMenu(false);
      window.scrollTo(0, 0);
      if (parts[0] === "table") setTableId(parts[1] || "bonkers-room");
      if (parts[0] === "profile") setProfileId(parts[1] || "");
    };
    route();
    window.addEventListener("hashchange", route);
    try {
      const saved = localStorage.getItem("bonkers-demo-identity");
      if (saved) {
        const id = JSON.parse(saved);
        identityRef.current = id;
        setIdentity(id);
      }
    } catch {}
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => {
      window.removeEventListener("hashchange", route);
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  const api = useCallback(async (path: string, body?: unknown) => {
    const res = await fetch("/api/v1/" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(identityRef.current
          ? { Authorization: "Bearer " + identityRef.current.token }
          : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const value = await res.json();
    if (!res.ok) throw Error(value.error ?? "Something went wrong");
    return value;
  }, []);
  useEffect(() => {
    fetch("/api/v1/config")
      .then((r) => r.json())
      .then((c) => {
        setStorageReady(c.sharedTablesReady);
        if (!c.sharedTablesReady) setOnline(false);
      })
      .catch(() => {
        setStorageReady(false);
        setOnline(false);
      });
  }, []);
  const refresh = useCallback(async () => {
    if (storageReady !== true) return;
    if (page === "table") {
      const value = await api("tables/" + tableId);
      setTable(value.table);
      if (
        value.account &&
        (!accountRef.current || value.account.nonce >= accountRef.current.nonce)
      )
        updateAccount(value.account);
    } else {
      const [list, a] = await Promise.all([
        api("tables"),
        identityRef.current ? api("account") : Promise.resolve(null),
      ]);
      setTables(list);
      if (a && (!accountRef.current || a.nonce >= accountRef.current.nonce))
        updateAccount(a);
    }
    setOnline(true);
  }, [page, tableId, api, updateAccount, storageReady]);
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        await refresh();
      } catch (e) {
        setOnline(false);
        setError(e instanceof Error ? e.message : "Unable to connect");
      }
      if (!stop) timer = setTimeout(poll, page === "table" ? 1000 : 4000);
    }
    void poll();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [refresh, page, identity]);
  useEffect(() => {
    if (identity && (page === "history" || page === "fairness"))
      api("receipts")
        .then(setReceipts)
        .catch((e) => setError(e.message));
  }, [page, identity, api]);
  const beep = () => {
    if (!sound) return;
    try {
      const ac = new AudioContext();
      const oscillator = ac.createOscillator(),
        gain = ac.createGain();
      oscillator.connect(gain);
      gain.connect(ac.destination);
      oscillator.frequency.value = 500;
      gain.gain.setValueAtTime(0.04, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.12);
      oscillator.start();
      oscillator.stop(ac.currentTime + 0.12);
      oscillator.onended = () => void ac.close();
    } catch {}
  };
  async function command(
    kind: string,
    payload: Record<string, unknown> = {},
    target = tableId,
  ) {
    const id = identityRef.current,
      a = accountRef.current;
    if (!id || !a) {
      setModal("login");
      return;
    }
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const c = {
        id: crypto.randomUUID(),
        nonce: a.nonce,
        tableId: target,
        kind,
        payload,
      };
      const key = await crypto.subtle.importKey(
        "jwk",
        id.privateKey,
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["sign"],
      );
      const signed = new Uint8Array(
        await crypto.subtle.sign(
          { name: "ECDSA", hash: "SHA-256" },
          key,
          new TextEncoder().encode(canonical(c)),
        ),
      );
      const result = await api("commands", {
        command: c,
        signature: btoa(String.fromCharCode(...signed)),
      });
      updateAccount(result.account);
      await refresh();
      beep();
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
      try {
        await refresh();
      } catch {}
      return null;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function login(e: FormEvent) {
    e.preventDefault();
    if (!consent) return;
    setBusy(true);
    setError("");
    try {
      const pair = await crypto.subtle.generateKey(
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["sign", "verify"],
      );
      const publicKey = await crypto.subtle.exportKey("jwk", pair.publicKey),
        privateKey = await crypto.subtle.exportKey("jwk", pair.privateKey);
      const value = await api("demo-login", { publicKey });
      const id = { token: value.token, privateKey, publicKey };
      identityRef.current = id;
      setIdentity(id);
      localStorage.setItem("bonkers-demo-identity", JSON.stringify(id));
      updateAccount(value.account);
      setBusy(false);
      const result = await command("authorize", { limit: 50000 });
      if (result) {
        setModal(null);
        if (page !== "table") go("lobby");
        setNotice(`You’re in as ${value.account.name}. Visit Your profile to choose your permanent name.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not join");
    } finally {
      setBusy(false);
    }
  }
  const activeTransfer = account?.transfers.find(
    (t) => t.id === selectedTransfer,
  );
  useEffect(() => {
    if (activeTransfer)
      QRCode.toDataURL(activeTransfer.address, {
        margin: 2,
        width: 180,
        color: { dark: "#171515", light: "#ffffff" },
      }).then(setQr);
  }, [activeTransfer?.id]);
  const openCashier = () => {
    if (!account) {
      setModal("login");
      return;
    }
    setSelectedTransfer(null);
    setModal("cashier");
  };
  const openTable = (id: string) => {
    setTable(null);
    go("table/" + id);
  };

  const me = account ? (table?.seats.findIndex((s) => s?.id === account.id) ?? -1) : -1;
  const stagedChips = chipDraft ?? (me >= 0 ? table?.seats[me]?.chips ?? [] : []);
  const bet = chipTotal(stagedChips);
  useEffect(() => {
    chipDraftRef.current = null;
    setChipDraft(null);
  }, [table?.id, table?.commitment, table?.round?.id]);
  function stageChips(chips: number[]) {
    const current = tableRef.current;
    if (!current || me < 0 || current.round || current.seats[me]?.bet) return;
    const amount = chipTotal(chips);
    if (!Number.isSafeInteger(amount) || amount > current.max || chips.length > 200) {
      setError(`Maximum wager is ${money(current.max)}.`); return;
    }
    if (amount && (!account || account.session.expiresAt <= now || account.session.spent + amount + roundFee(amount) > account.session.limit)) {
      setModal("session"); return;
    }
    if (amount + roundFee(amount) > (account?.balance ?? 0)) { setError("Not enough play money for these chips and the table fee."); return; }
    chipDraftRef.current = chips;
    setChipDraft(chips);
    setPendingChips(++pendingChipsRef.current);
    const payload = {bet:amount, chips, entropy:random(), commitment:current.commitment, feePolicy:FEE_POLICY, lockOnDeadline:true};
    chipQueue.current = chipQueue.current.then(async () => {
      while (busyRef.current) await new Promise(resolve => setTimeout(resolve, 25));
      const latest = tableRef.current;
      if (latest?.id === current.id && latest.commitment === current.commitment && !latest.round)
        await command("stage-bet", payload, current.id);
    }).finally(() => {
      setPendingChips(--pendingChipsRef.current);
      if (!pendingChipsRef.current) { chipDraftRef.current = null; setChipDraft(null); }
    });
  }
  function addChip(value: number) {
    const saved = tableRef.current?.seats.find(s => s?.id === account?.id)?.chips ?? [];
    stageChips([...(chipDraftRef.current ?? saved), value]);
  }
  const ownRound = table?.round?.players.find((p) => p.id === account?.id);
  const myTurn =
    !!table?.round?.current &&
    table.round.players[table.round.current[0]].id === account?.id;
  const activeHand = myTurn && table?.round?.current ? ownRound?.hands[table.round.current[1]] : undefined;
  const doubleReason = !myTurn ? "Wait for your turn."
    : table?.round?.insurancePending ? "Choose insurance first."
    : account && account.session.expiresAt <= now ? "Renew your play session."
    : activeHand?.cards.length !== 2 ? "Double is available only on the first two cards."
    : activeHand?.splitAces ? "Split aces receive one card only."
    : account && activeHand && account.balance < activeHand.bet ? "Your available balance must cover one more matching wager."
    : account && activeHand && account.session.limit - account.session.spent < activeHand.bet ? "Increase your session allowance to cover one more matching wager."
    : "Double takes exactly one card and doubles this hand’s wager.";
  const remaining = table?.deadline
    ? Math.max(0, Math.ceil((table.deadline - now) / 1000))
    : 0;
  const download = (r: Receipt) => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(r, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `bonkers-round-${r.roundId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  async function verify(r: Receipt) {
    setVerification(await verifyReceipt(r));
  }
  async function latestReceipt() {
    if (!table?.receiptIds[0]) return;
    try {
      const r = await api("receipts/" + table.receiptIds[0]);
      await verify(r);
      download(r);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const asset = ASSETS[assetIndex];
  const estimated =
    transferTab === "deposit"
      ? Math.max(0, Math.round((Number(amount) * asset.rate - asset.fee) * 100))
      : Math.max(0, Math.round((Number(amount) - asset.fee) * 100));
  const sessionActive =
    !!account &&
    account.session.expiresAt > now &&
    account.session.limit > account.session.spent;
  return (
    <div className={page === "table" ? "club room-mode" : "club"}>
      <div className="preview-bar">
        <span>
          <span className="status-dot" /> PLAY-MONEY PREVIEW
        </span>
        <span>No real deposits. No cash value. Just a good table.</span>
        <span className="adult">18+</span>
      </div>
      <header className="header">
        <a href="#home" className="brand" aria-label="Bonkers Blackjack home">
          <Logo />
          <span>
            BONKERS<small>BLACKJACK</small>
          </span>
        </a>
        <nav className={menu ? "open" : ""} aria-label="Main navigation">
          <a href="#lobby" className={page === "lobby" ? "active" : ""}>
            The tables
          </a>
          <a href="#how-to-play">How to play</a>
          <a href="#fairness">
            Fair play <ArrowUpRight size={13} />
          </a>
          {account && <a href="#account">Your account</a>}
        </nav>
        <div className="header-actions">
          {cryptoTestingEnabled && <a className="button secondary" href="/crypto-pilot">Crypto testing</a>}
          {account ? (
            <>
              <button className="balance" onClick={openCashier}>
                <span className="coin">$</span>
                <span>
                  {money(account.balance)}
                  <small>PLAY USDC</small>
                </span>
                <Plus size={16} />
              </button>
              <button
                className="icon-button profile"
                onClick={() => go("profile")}
                aria-label="Your profile"
              >
                <Avatar profile={account} />
              </button>
            </>
          ) : (
            <button
              className="button primary compact"
              onClick={() => setModal("login")}
            >
              Join the club <ArrowUpRight size={16} />
            </button>
          )}
          <button
            className="icon-button mobile-menu"
            aria-label="Toggle navigation"
            onClick={() => setMenu(!menu)}
          >
            <Menu />
          </button>
        </div>
      </header>
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button
            className="icon-button"
            aria-label="Dismiss error"
            onClick={() => setError("")}
          >
            <X size={17} />
          </button>
        </div>
      )}
      {notice && (
        <div className="toast" role="status">
          <Check size={18} />
          {notice}
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      <main>
        {page === "home" && (
          <>
            <section className="hero">
              <div className="hero-copy">
                <div className="eyebrow">
                  <span /> NOT YOUR USUAL CARD CLUB
                </div>
                <h1>
                  A little mad.
                  <br />
                  All <em>blackjack.</em>
                </h1>
                <p>
                  Pull up a chair. Bring your people.
                  <br />
                  Good cards, questionable company, and a table that’s always
                  worth coming back to.
                </p>
                <div className="hero-ctas">
                  <button
                    className="button primary"
                    onClick={() => (account ? go("lobby") : setModal("login"))}
                  >
                    Take your seat <ArrowUpRight size={20} />
                  </button>
                  <a className="text-link" href="#how-to-play">
                    New around here? <ArrowRight size={17} />
                  </a>
                </div>
                <div className="hero-notes">
                  <span>
                    <Users size={16} /> Real people. Shared tables.
                  </span>
                  <span>
                    <ShieldCheck size={16} /> Verifiable rounds.
                  </span>
                </div>
              </div>
              <div className="hero-art">
                <div className="orbit orbit-one" />
                <div className="orbit orbit-two" />
                <span className="floating-suit suit-one">♠</span>
                <span className="floating-suit suit-two">♦</span>
                <span className="art-caption">
                  A FULL HOUSE OF PERSONALITY.
                </span>
                <Logo hero />
              </div>
            </section>
            <div className="ticker">
              <span>
                BLACKJACK PAYS <b>3:2</b>
              </span>
              <i>✦</i>
              <span>
                SEVEN SEATS. <b>YOUR CREW.</b>
              </span>
              <i>✦</i>
              <span>
                DEALER STANDS ON <b>SOFT 17</b>
              </span>
              <i>✦</i>
              <span>
                EVERY ROUND. <b>REPLAYABLE.</b>
              </span>
            </div>
          </>
        )}
        {(page === "home" || page === "lobby") && (
          <section className="section lobby">
            <div className="section-heading">
              <div>
                <div className="eyebrow">FIND YOUR KIND OF TROUBLE</div>
                <h2>
                  {page === "home"
                    ? "The night starts here."
                    : "Find your table."}
                </h2>
                <p>Same classic game. Different company. All play money.</p>
              </div>
              <button
                className="button secondary"
                onClick={() =>
                  account ? setModal("private") : setModal("login")
                }
              >
                <LockKeyhole size={16} /> Create a private table
              </button>
            </div>
            <div className="table-grid">
              {(tables.length
                ? tables
                : [
                    {
                      id: "bonkers-room",
                      name: "The Bonkers Room",
                      subtitle: "Good cards. Great company.",
                      theme: "red",
                      min: 500,
                      max: 10000,
                      seats: Array(7).fill(null),
                    },
                    {
                      id: "midnight-lounge",
                      name: "Midnight Lounge",
                      subtitle: "For the beautifully nocturnal.",
                      theme: "midnight",
                      min: 2500,
                      max: 25000,
                      seats: Array(7).fill(null),
                    },
                    {
                      id: "high-society",
                      name: "Carnival Club",
                      subtitle: "A whole room of delightful chaos.",
                      theme: "gold",
                      min: 10000,
                      max: 50000,
                      seats: Array(7).fill(null),
                    },
                  ]
              ).map((t, i) => (
                <article className={"table-tile " + t.theme} key={t.id}>
                  <div className="tile-art orbital-preview">
                    <Image src={roomArt(t.id).image} alt={roomArt(t.id).description} fill sizes="(max-width: 800px) 100vw, 420px" />
                    <span className="table-tag">
                      {roomArt(t.id).label}
                    </span>
                    <div className="mini-felt">
                      <span>BONKERS</span>
                      <div className="mini-cards">
                        <Card value={[0, 12, 25][i]} small />
                        <Card value={[10, 14, 0][i]} small />
                      </div>
                      <div className="mini-chips">
                        <i />
                        <i />
                        <i />
                      </div>
                    </div>
                    <span className="seat-count">
                      <Users size={13} />
                      {t.seats.filter(Boolean).length}/7 seated
                    </span>
                  </div>
                  <div className="tile-info">
                    <h3>{t.name}</h3>
                    <p>{t.subtitle}</p>
                    <div className="tile-bottom">
                      <span>
                        {money(t.min)}–{money(t.max)}
                        <small>PLAY-MONEY LIMITS</small>
                      </span>
                      <button
                        className="round-button"
                        aria-label={"Open " + t.name}
                        onClick={() => openTable(t.id)}
                      >
                        <ArrowUpRight />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <div className="lobby-foot">
              <span>
                <span className={"status-dot " + (!online ? "offline" : "")} />
                {storageReady === false
                  ? "Shared tables opening soon"
                  : online
                    ? "Shared tables available"
                    : "Connecting to shared tables"}
              </span>
              <span>
                No bots dressed up as players. Empty seats are actually empty.
              </span>
            </div>
          </section>
        )}
        {page === "home" && (
          <section className="feature-strip">
            <div>
              <span className="feature-number">01</span>
              <h3>Your crew, your corner.</h3>
              <p>
                Make a private table. Send the link. Settle in with people who
                make losing a hand a little funnier.
              </p>
            </div>
            <div>
              <span className="feature-number">02</span>
              <h3>The cards tell the truth.</h3>
              <p>
                Download a completed round and replay its shuffle, actions, and
                payouts. Fairness you can inspect.
              </p>
            </div>
            <div>
              <span className="feature-number">03</span>
              <h3>Crypto without the circus.</h3>
              <p>
                Preview the choose, send, convert flow. Real crypto funding
                comes after the security work.
              </p>
            </div>
          </section>
        )}
        {page === "table" && (
          <section className="table-page">
            <div className="table-top">
              <button className="room-exit" disabled={busy} onClick={async () => {
                if (me >= 0 && table) {
                  if (table.seats[me]?.bet && table.round?.phase !== "settled") {
                    setNotice("You left the room. Your locked hand will automatically stand when its timer expires.");
                  } else if (!await command("leave")) return;
                }
                go("lobby");
              }}>
                <DoorOpen size={22} /> Leave room
              </button>
              <div className="table-title">
                <h2>{table?.name ?? "Taking you to the table…"}</h2>
                <span>
                  {table?.private ? "PRIVATE TABLE" : "PUBLIC TABLE"} · PLAY
                  MONEY
                </span>
              </div>
              <div className="table-tools">
                <button
                  className="icon-button"
                  aria-label={sound ? "Mute sound" : "Enable sound"}
                  onClick={() => setSound(!sound)}
                >
                  {sound ? <Volume2 /> : <VolumeX />}
                </button>
                <button
                  className="button secondary compact"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(window.location.href);
                      setNotice("Invitation link copied.");
                    } catch {
                      setNotice(window.location.href);
                    }
                  }}
                >
                  <Copy size={15} /> Invite
                </button>
              </div>
            </div>
            {table ? (
              <>
                <div className="room-viewport" aria-label="Blackjack room" style={{backgroundImage: `url(${roomArt(table.id).image})`}}>
                <div data-room={table.id} className={"game-surface " + table.theme + " orbital-room"}>
                  <Image key={table.id} src={roomArt(table.id).image} alt={roomArt(table.id).description} fill sizes="100vw" loading="eager" className="room-backdrop" />
                  <div className="felt-lines" />
                  <div className="dealer-zone">
                    <div className="dealer-badge">
                      <Spade size={22} />
                    </div>
                    <div>
                      <span className="eyebrow">YOUR DEALER</span>
                      <strong>Bonkers House</strong>
                    </div>
                    <span className="dealer-note">
                      {table.round?.phase === "settled"
                        ? "Same time, next hand?"
                        : myTurn
                          ? "Your move. Make it a good one."
                          : "The table’s yours. Settle in."}
                    </span>
                  </div>
                  <div className="dealer-cards">
                    {table.round ? (
                      table.round.dealer.map((c, i) => (
                        <Card value={c} key={i} />
                      ))
                    ) : (
                      <>
                        <Card value={-1} />
                        <Card value={-1} />
                      </>
                    )}
                    {table.round && (
                      <span className="total-badge">
                        {table.round.phase === "settled"
                          ? total(table.round.dealer).value
                          : total([table.round.dealer[0]]).value}
                      </span>
                    )}
                  </div>
                  <div className="felt-wordmark">
                    BONKERS<span>BLACKJACK PAYS 3:2</span>
                    <small>DEALER STANDS ON ALL 17s</small>
                  </div>
                  <div className="table-status" aria-live="polite">
                    {table.round?.phase === "settled" ? (
                      <span>
                        Round settled{" "}
                        {ownRound && (
                          <b>
                            {" "}
                            · {money(ownRound.payout - ownRound.committed - (table.seats[me]?.fee ?? 0))} net
                          </b>
                        )}
                      </span>
                    ) : table.round?.current ? (
                      <span>
                        <Clock3 size={14} />{" "}
                        {myTurn
                          ? "Your turn"
                          : table.round.players[table.round.current[0]].name +
                            "’s turn"}{" "}
                        <b>{remaining}s</b>
                      </span>
                    ) : table.betDeadline ? (
                      <span>
                        <Clock3 size={14} /> Bets close in{" "}
                        {Math.max(
                          0,
                          Math.ceil((table.betDeadline - now) / 1000),
                        )}
                        s
                      </span>
                    ) : (
                      <span>Take a seat. The next hand is yours.</span>
                    )}
                  </div>
                  {!table.round && <div className="betting-spots" aria-label="Table betting areas">
                    {table.seats.map((seat, index) => {
                      const chips = seat?.id === account?.id ? stagedChips : seat?.chips ?? [];
                      if (!chips.length) return null;
                      return <div className={`betting-spot betting-spot-${index} ${seat?.id === account?.id ? "my-bet" : ""} ${seat?.bet ? "locked" : "staged"}`} key={index}
                        aria-label={`${seat?.name}: ${chips.length} chips, ${money(chipTotal(chips))}, ${seat?.bet ? "locked" : "staged"}`}>
                        <div className="chip-stack">{chips.slice(-8).map((chip, layer) => <span key={`${layer}-${chip}`} className={`wager-chip denomination-${chip}`} style={{bottom:layer*4}}>{chip/100}</span>)}</div>
                        <strong>{money(chipTotal(chips))}</strong><small>{chips.length} {chips.length === 1 ? "chip" : "chips"} · {seat?.bet ? "Ready" : "Staged"}</small>
                      </div>;
                    })}
                  </div>}
                  <div className="seats">
                    {table.seats.map((s, i) => {
                      const pr = table.round?.players.find(
                        (p) => p.id === s?.id,
                      );
                      const active =
                        table.round?.current &&
                        table.round.players[table.round.current[0]].id ===
                          s?.id;
                      return (
                        <div
                          className={
                            "seat seat-" +
                            i +
                            (active ? " active" : "") +
                            (s?.id === account?.id ? " mine" : "")
                          }
                          key={i}
                        >
                          {s ? (
                            <>
                              <div className="seat-hands">
                                {pr?.hands.map((h, j) => (
                                  <div
                                    className={
                                      "player-hand " +
                                      (active && table.round?.current?.[1] === j
                                        ? "current-hand"
                                        : "")
                                    }
                                    key={j}
                                  >
                                    <div className="hand-cards">
                                      {h.cards.map((c, k) => (
                                        <Card value={c} small key={k} />
                                      ))}
                                    </div>
                                    <span
                                      className={
                                        "hand-total " +
                                        (h.status === "bust" ? "busted" : "")
                                      }
                                    >
                                      {total(h.cards).value}
                                      {h.result ? " · " + h.result : ""}
                                    </span>
                                  </div>
                                ))}
                              </div>
                              <button className="player-avatar" aria-label={`View ${s.name}'s profile`} onClick={() => go("profile/" + s.id)}>
                                <Avatar profile={s} />
                                <span
                                  className={
                                    s.connected
                                      ? "status-dot"
                                      : "status-dot offline"
                                  }
                                />
                              </button>
                              <strong>
                                {s.name}
                                {s.id === account?.id ? " (you)" : ""}
                              </strong>
                              <small>
                                {pr
                                  ? money(pr.committed) + (pr.insurance ? " · insured" : "")
                                  : s.bet
                                    ? money(s.bet)
                                    : s.stagedBet ? money(s.stagedBet) + " staged" : "Add chips to play"}
                              </small>
                            </>
                          ) : (
                            <button
                              className="empty-seat"
                              disabled={busy || me >= 0}
                              aria-label={"Take seat " + (i + 1)}
                              onClick={() =>
                                account
                                  ? void command("seat", { index: i })
                                  : setModal("login")
                              }
                            >
                              <Plus size={21} />
                              <span>Take a seat</span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {table.reaction && now - table.reaction.at < 4000 && (
                    <div className="reaction-bubble" role="status">
                      {table.reaction.name}: {table.reaction.text}
                    </div>
                  )}
                </div>
                </div>
                <div className="room-dock">
                {ownRound && <div className="your-hands" aria-label="Your hands">
                  <span className="eyebrow" aria-live="polite">{myTurn ? `YOUR TURN · ${remaining}s` : table.round?.phase === "settled" ? "ROUND COMPLETE" : "YOUR HANDS · WAITING FOR YOUR TURN"}</span>
                  {ownRound.hands.map((hand, index) => <div className={"your-hand " + (myTurn && table.round?.current?.[1] === index ? "current-hand" : "")} key={index}>
                    <div className="hand-cards">{hand.cards.map((card, i) => <Card key={i} value={card} small />)}</div>
                    <strong>{total(hand.cards).value} {hand.result ? "· " + hand.result : ""}</strong>
                    <small>{money(hand.bet)} wager</small>
                  </div>)}
                </div>}
                {table.betNotice && <div className="bet-notice" role="status">{table.betNotice}</div>}
                <div className="fee-disclosure">
                  <span>0.25% table fee · initial wager only · rounded down to the cent.</span>
                  <span>No extra fee for splits or doubles. Applies to wins, losses, and ties.</span>
                  {me >= 0 && !table.round && !table.seats[me]?.bet && Number.isSafeInteger(bet) && bet >= 0 && <strong>{money(bet)} wager + {money(roundFee(bet))} fee = {money(bet + roundFee(bet))} total</strong>}
                </div>
                <div className="table-controls">
                  <div className="control-balance">
                    <small>AVAILABLE PLAY MONEY</small>
                    <strong>
                      {money(account?.balance ?? 0)} <span>USDC</span>
                    </strong>
                    <button className="text-link" onClick={openCashier}>
                      Open cashier <Plus size={13} />
                    </button>
                  </div>
                  <div className="play-actions">
                    {account && account.session.expiresAt <= now && <button className="button secondary" onClick={() => setModal("session")}>Renew session</button>}
                    {!account ? (
                      <button
                        className="button primary"
                        onClick={() => setModal("login")}
                      >
                        Join to play <ArrowRight size={18} />
                      </button>
                    ) : me < 0 ? (
                      <p>
                        <Eye size={18} /> You’re spectating. Choose an empty
                        seat to play.
                      </p>
                    ) : table.round?.phase === "settled" ? (
                      <>
                        <button
                          className="button primary"
                          disabled={busy}
                          onClick={() => void command("next")}
                        >
                          Next round <RefreshCw size={17} />
                        </button>
                        <button
                          className="button secondary"
                          onClick={() => void latestReceipt()}
                        >
                          Verify receipt <ShieldCheck size={16} />
                        </button>
                      </>
                    ) : table.round?.insurancePending ? (
                      <>
                        <span className="insurance-prompt">Dealer shows an ace · insurance pays 2:1</span>
                        <button className="button primary" disabled={busy || !table.allowed.includes("insurance")}
                          onClick={() => void command("insurance", {roundId: table.round!.id})}>
                          Insure {money((ownRound?.hands[0].bet ?? 0) / 2)}
                        </button>
                        <button className="button secondary" disabled={busy || !table.allowed.includes("decline-insurance")}
                          onClick={() => void command("decline-insurance", {roundId: table.round!.id})}>No insurance</button>
                      </>
                    ) : table.round ? (
                      <>
                        <button
                          className="button primary"
                          disabled={busy || !table.allowed.includes("hit")}
                          onClick={() =>
                            void command("hit", { roundId: table.round!.id })
                          }
                        >
                          <Plus size={18} /> Hit
                        </button>
                        <button
                          className="button secondary"
                          disabled={busy || !table.allowed.includes("stand")}
                          onClick={() =>
                            void command("stand", { roundId: table.round!.id })
                          }
                        >
                          Stand
                        </button>
                        <button
                          className="button secondary"
                          disabled={busy || !table.allowed.includes("double")}
                          title={doubleReason}
                          onClick={() =>
                            void command("double", { roundId: table.round!.id })
                          }
                        >
                          Double down
                        </button>
                        <button
                          className="button secondary"
                          disabled={busy || !table.allowed.includes("split")}
                          onClick={() =>
                            void command("split", { roundId: table.round!.id })
                          }
                        >
                          Split
                        </button>
                        <button className="button secondary" disabled={busy || !table.allowed.includes("surrender")}
                          onClick={() => void command("surrender", {roundId: table.round!.id})}>Surrender</button>
                        {myTurn && <span className="action-help">{!table.allowed.includes("double") ? doubleReason : "Double: first two cards + matching stake and session allowance."} Split: equal ranks, up to four hands. Surrender: original two-card hand only.</span>}
                        {myTurn && account && activeHand && account.session.limit - account.session.spent < activeHand.bet && account.session.expiresAt > now && <button className="text-link" onClick={() => setModal("session")}>Increase session allowance</button>}
                      </>
                    ) : table.seats[me]?.bet ? (
                      <>
                        <span className="bet-locked">
                          <LockKeyhole size={16} />{" "}
                          {money(table.seats[me]!.bet)} wager locked · {money(table.seats[me]!.fee)} fee
                        </span>
                        <span className="ready-label">Ready · waiting for the table</span>
                      </>
                    ) : (
                      <>
                        <div className="bet-input">
                          <button
                            aria-label="Decrease bet"
                            disabled={busy}
                            onClick={() =>
                              stageChips(chipsForAmount(Math.max(0, bet - 500)))
                            }
                          >
                            <Minus size={15} />
                          </button>
                          <label>
                            <span className="sr-only">Bet in dollars</span>
                            <input
                              aria-label="Bet in dollars"
                              type="number"
                              min={0}
                              max={table.max / 100}
                              value={bet / 100}
                              onChange={(e) =>
                                stageChips(chipsForAmount(Math.min(table.max, Math.max(0, Math.floor(Number(e.target.value)) * 100))))
                              }
                            />
                          </label>
                          <button
                            aria-label="Increase bet"
                            disabled={busy}
                            onClick={() =>
                              addChip(500)
                            }
                          >
                            <Plus size={15} />
                          </button>
                        </div>
                        <div className="chip-options">
                          {CHIP_VALUES
                            .filter((n) => n <= table.max)
                            .map((n) => (
                              <button
                                className={
                                  "chip denomination-" + n
                                }
                                key={n}
                                aria-label={`Add $${n / 100} chip`}
                                onClick={() => addChip(n)}
                              >
                                {n / 100}
                              </button>
                            ))}
                        </div>
                        <button className="button primary" disabled={busy || pendingChips > 0 || bet < table.min || bet > table.max}
                          onClick={() => void command("deal")}>
                          Deal <ArrowRight size={16} />
                        </button>
                        <div className="chip-edit-actions">
                          <button className="text-link" aria-label="Undo last chip" disabled={busy || pendingChips > 0 || !stagedChips.length} onClick={() => stageChips(stagedChips.slice(0,-1))}><Undo2 size={14} /> Undo</button>
                          <button className="text-link" aria-label="Clear staged chips" disabled={busy || pendingChips > 0 || !stagedChips.length} onClick={() => stageChips([])}><Trash2 size={14} /> Clear</button>
                        </div>
                      </>
                    )}
                    {me >= 0 && !table.round && !table.seats[me]?.bet && <small className="chip-help">{pendingChips ? "Saving chips…" : `Chips stay editable until Deal or the timer ends. Min ${money(table.min)}.`}</small>}
                  </div>
                  <div className="control-options">
                    <select
                      aria-label="Send reaction"
                      value=""
                      disabled={!account || busy}
                      onChange={(e) =>
                        void command("reaction", { reaction: e.target.value })
                      }
                    >
                      <option value="" disabled>
                        Say something nice
                      </option>
                      {["Nice hand", "Good luck", "Well played", "♠"].map(
                        (s) => (
                          <option key={s}>{s}</option>
                        ),
                      )}
                    </select>
                    {me >= 0 && (
                      <button
                        className="text-link"
                        disabled={
                          busy ||
                          (!!table.seats[me]?.bet &&
                            !table.round?.phase.includes("settled"))
                        }
                        onClick={() => void command("leave")}
                      >
                        Leave seat
                      </button>
                    )}
                  </div>
                </div>
                <div className="table-bottom">
                  <span>
                    <ShieldCheck size={14} /> Shuffle committed{" "}
                    <code>{table.commitment.slice(0, 16)}…</code>
                  </span>
                  <span>
                    {table.spectators} spectators ·{" "}
                    {online ? "Connected" : "Reconnecting…"}
                  </span>
                  <a href="#how-to-play">
                    Table rules <CircleHelp size={14} />
                  </a>
                </div>
                </div>
                {verification && (
                  <div
                    className={
                      "verification " +
                      (verification.valid ? "valid" : "invalid")
                    }
                  >
                    {verification.valid ? "Verified. " : "Could not verify. "}
                    {verification.detail}
                  </div>
                )}
              </>
            ) : (
              <div className="loading-state">
                {storageReady === false ? (
                  <div className="panel">
                    <h3>This table is getting ready.</h3>
                    <p>Shared play is not open in this hosted preview yet.</p>
                    <button
                      className="button secondary"
                      onClick={() => go("how-to-play")}
                    >
                      Explore the table rules <ArrowRight size={16} />
                    </button>
                  </div>
                ) : (
                  <>
                    <RefreshCw className="spin" /> Connecting to your table…
                  </>
                )}
              </div>
            )}
          </section>
        )}
        {page === "how-to-play" && (
          <section className="section reading">
            <div className="eyebrow">CLASSIC GAME. BONKERS COMPANY.</div>
            <h1>
              Know when to
              <br />
              <em>make your move.</em>
            </h1>
            <p className="lead">
              Get closer to 21 than the dealer, without going over. Everyone at
              the table plays against the house.
            </p>
            <div className="guide-grid">
              {[
                [
                  "01",
                  "Take a seat",
                  "Choose a seat and click chips to build your wager. Undo or clear before pressing Deal; otherwise your saved stack locks when the betting timer ends.",
                ],
                [
                  "02",
                  "Play your hand",
                  "Hit for another card. Stand to keep your total. Double your initial two-card wager to receive exactly one more card.",
                ],
                [
                  "03",
                  "Split the difference",
                  "Two cards of the same rank can become two hands. Up to four hands; each needs another matching wager.",
                ],
                [
                  "04",
                  "See it through",
                  "The dealer reveals the hidden card and draws to 17. Winning hands pay 1:1; a natural blackjack pays 3:2.",
                ],
              ].map(([n, h, p]) => (
                <article className="panel" key={n}>
                  <span className="feature-number">{n}</span>
                  <h3>{h}</h3>
                  <p>{p}</p>
                </article>
              ))}
            </div>
            <div className="panel rules">
              <h3>The fine print, in plain English.</h3>
              <ul>
                <li>
                  Six decks, freshly shuffled every round. Aces count as 1 or
                  11; face cards count as 10.
                </li>
                <li>
                  Dealer checks for blackjack and stands on soft 17. Ties return
                  the wager.
                </li>
                <li>
                  Double on any initial two cards, including after a split.
                </li>
                <li>
                  Split aces get one card each and cannot be resplit. A split 21
                  pays as a normal win.
                </li>
                <li>Blackjack pays 3:2. Other wins pay 1:1. Split equal ranks up to four hands; double after splitting is allowed.</li>
                <li>Insurance is offered to every player, including blackjack hands, before the dealer checks an ace. It costs half your original wager and pays 2:1 if the dealer has blackjack. Declining costs nothing. Insured blackjack guarantees an even-money net result before the table fee.</li>
                <li>Late surrender returns half the original wager after the dealer checks for blackjack, before hitting or splitting. No surrender after a split. No side bets.</li>
                <li>0.25% table fee on the initial wager, rounded down to the nearest cent. Charged once when your wager locks, including wins, losses, and ties. No extra fee for splits or doubles. For example, a $25 wager costs $25.06 including the $0.06 fee. This is additional to the game’s house edge.</li>
                <li>
                  25 seconds per action. A missed turn or disconnect
                  automatically stands, or declines insurance during the insurance offer.
                </li>
                <li>
                  Play money has no cash value. Simulated deposits and
                  withdrawals never move crypto.
                </li>
              </ul>
            </div>
            <button className="button primary" onClick={() => go("lobby")}>
              I’m ready. Show me the tables. <ArrowRight size={18} />
            </button>
          </section>
        )}
        {page === "fairness" && (
          <section className="section reading">
            <div className="eyebrow">TRUST IS EARNED AT THE TABLE</div>
            <h1>
              Less “trust us.”
              <br />
              <em>More proof.</em>
            </h1>
            <p className="lead">
              Each round starts with a shuffle commitment and ends with a
              receipt you can inspect in your own browser.
            </p>
            <div className="guide-grid">
              {[
                [
                  "01",
                  "Commit",
                  "The server commits to a secret seed before your bet. Your signed wager includes that commitment and fresh player entropy.",
                ],
                [
                  "02",
                  "Play",
                  "A deterministic six-deck shuffle deals the cards. Your browser signs each action in order.",
                ],
                [
                  "03",
                  "Reveal",
                  "Once all decisions are final, the server reveals the seed and publishes the completed round.",
                ],
                [
                  "04",
                  "Replay",
                  "The verifier checks the commitment, signatures, dealt cards, legal actions, and exact payouts.",
                ],
              ].map(([n, h, p]) => (
                <article className="panel" key={n}>
                  <span className="feature-number">{n}</span>
                  <h3>{h}</h3>
                  <p>{p}</p>
                </article>
              ))}
            </div>
            <div className="panel">
              <h3>Put a round to the test.</h3>
              <p>
                Upload a downloaded Bonkers round receipt. Verification runs
                locally in your browser.
              </p>
              <label className="upload button secondary">
                <ShieldCheck size={18} /> Choose receipt JSON
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={async (e) => {
                    try {
                      const file = e.target.files?.[0];
                      if (file) {
                        if (file.size > 1000000)
                          throw Error("Receipt is too large");
                        await verify(JSON.parse(await file.text()));
                      }
                    } catch {
                      setVerification({
                        valid: false,
                        detail: "Not a valid receipt JSON file.",
                      });
                    }
                  }}
                />
              </label>
              {verification && (
                <div
                  className={
                    "verification " + (verification.valid ? "valid" : "invalid")
                  }
                >
                  <strong>
                    {verification.valid
                      ? "Round verified"
                      : "Verification failed"}
                  </strong>
                  <p>{verification.detail}</p>
                </div>
              )}
              {receipts.length > 0 && (
                <button
                  className="text-link"
                  onClick={() => void verify(receipts[0])}
                >
                  Verify my latest round <ArrowRight size={16} />
                </button>
              )}
            </div>
            <div className="honesty-note">
              <ShieldCheck />
              <div>
                <h3>What this preview does—and doesn’t—prove.</h3>
                <p>
                  The operator knows future cards. This prototype verifies the
                  recorded shuffle and player decisions, but doesn’t
                  independently attest server timing or when a commitment was
                  published. Balances and settlement are simulated, not on
                  chain. Contract enforcement and independent audits are
                  required before real-money play.
                </p>
              </div>
            </div>
          </section>
        )}
        {page === "history" && (
          <section className="section reading wide">
            <div className="section-heading">
              <div>
                <div className="eyebrow">NO MYSTERY MATH</div>
                <h2>Your paper trail.</h2>
              </div>
              <button className="button secondary" onClick={openCashier}>
                <Wallet size={17} /> Cashier
              </button>
            </div>
            {!account ? (
              <button
                className="button primary"
                onClick={() => setModal("login")}
              >
                Join to see your history
              </button>
            ) : (
              <>
                <h3>
                  Cashier activity <span className="tag">SIMULATED</span>
                </h3>
                <div className="history-list">
                  {account.transfers.length ? (
                    account.transfers.map((t) => (
                      <button
                        className="history-row"
                        key={t.id}
                        onClick={() => {
                          setSelectedTransfer(t.id);
                          setModal("cashier");
                        }}
                      >
                        <span className="history-icon">
                          <Wallet size={19} />
                        </span>
                        <span>
                          <strong>
                            {t.kind === "deposit" ? "Deposit" : "Withdrawal"} ·{" "}
                            {t.symbol}
                          </strong>
                          <small>
                            {new Date(t.createdAt).toLocaleString()} ·{" "}
                            {t.network}
                          </small>
                        </span>
                        <span className="history-value">
                          {money(t.credit)}
                          <small className={"status-" + t.status}>
                            {t.status}
                          </small>
                        </span>
                        <ChevronRight size={16} />
                      </button>
                    ))
                  ) : (
                    <div className="empty-state">
                      No cashier activity yet. Your starter play money is ready.
                    </div>
                  )}
                </div>
                <h3>Completed rounds</h3>
                <div className="history-list">
                  {receipts.length ? (
                    receipts.map((r) => {
                      const p = r.outcome.players.find(
                        (p) => p.id === account.id,
                      )!;
                      return (
                        <div className="history-row" key={r.roundId}>
                          <span className="history-icon">
                            <Spade size={19} />
                          </span>
                          <span>
                            <strong>Round {r.roundId.slice(0, 8)}</strong>
                            <small>
                              {r.outcome.players.length} players · {r.rules}
                            </small>
                          </span>
                          <span className="history-value">
                            {money(p.payout - p.committed - (r.fees?.[account.id]?.amount ?? 0))}
                            <small>net · {money(r.fees?.[account.id]?.amount ?? 0)} fee</small>
                          </span>
                          <button
                            className="icon-button"
                            aria-label={
                              "Download round " + r.roundId.slice(0, 8)
                            }
                            onClick={() => download(r)}
                          >
                            <Download size={18} />
                          </button>
                          <button
                            className="icon-button"
                            aria-label={"Verify round " + r.roundId.slice(0, 8)}
                            onClick={() => void verify(r)}
                          >
                            <ShieldCheck size={18} />
                          </button>
                        </div>
                      );
                    })
                  ) : (
                    <div className="empty-state">
                      Your first completed round will appear here.
                    </div>
                  )}
                </div>
                {verification && (
                  <div
                    className={
                      "verification " +
                      (verification.valid ? "valid" : "invalid")
                    }
                  >
                    {verification.detail}
                  </div>
                )}
              </>
            )}
          </section>
        )}
        {page === "profile" && <ProfilePage key={profileId || "own"} account={account} profileId={profileId} busy={busy} api={api} command={command} onJoin={() => setModal("login")} />}
        {page === "account" && (
          <section className="section reading">
            <div className="eyebrow">YOUR CORNER OF THE CLUB</div>
            <h1>
              {account ? (
                <>
                  Hey, <em>{account.name}.</em>
                </>
              ) : (
                "Make yourself at home."
              )}
            </h1>
            {account ? (
              <>
                <a className="account-profile-link panel" href="#profile"><div className="account-avatar"><Avatar profile={account}/></div><span><strong>{account.name}</strong><small>{account.nameChanged ? "View your profile · edit your image" : "Choose your one-time username · edit your image"}</small></span><ArrowRight /></a>
                <div className="account-grid">
                  <div className="panel">
                    <Wallet />
                    <small>AVAILABLE PLAY MONEY</small>
                    <strong className="big-balance">
                      {money(account.balance)}
                    </strong>
                    <span>USDC · simulated balance</span>
                    <button className="button primary" onClick={openCashier}>
                      Open cashier <Plus size={16} />
                    </button>
                  </div>
                  <div className="panel">
                    <LockKeyhole />
                    <h3>Play session</h3>
                    <p>
                      {sessionActive
                        ? `${money(account.session.limit - account.session.spent)} remaining until ${new Date(account.session.expiresAt).toLocaleTimeString()}`
                        : "No active spending permission."}
                    </p>
                    <p className="muted">
                      Only gameplay actions are authorized. A session cannot
                      change a withdrawal destination.
                    </p>
                    <button
                      className="button secondary"
                      onClick={() => setModal("session")}
                    >
                      Set spending permission
                    </button>
                    {sessionActive && (
                      <button
                        className="text-link"
                        disabled={busy}
                        onClick={() => void command("revoke")}
                      >
                        Revoke session
                      </button>
                    )}
                  </div>
                </div>
                <div className="panel">
                  <h3>This is a browser-local demo identity.</h3>
                  <p>
                    No email, passkey, embedded crypto wallet, or recovery
                    service is connected yet. Your demo signing key stays in
                    this browser. Clearing its storage removes access to this
                    account.
                  </p>
                  <button className="text-link" onClick={() => go("history")}>
                    <History size={17} /> View all activity
                  </button>
                </div>
              </>
            ) : (
              <button
                className="button primary"
                onClick={() => setModal("login")}
              >
                Join the preview
              </button>
            )}
          </section>
        )}
        {![
          "home",
          "lobby",
          "table",
          "how-to-play",
          "fairness",
          "history",
          "account",
          "profile",
        ].includes(page) && (
          <section className="section">
            <h2>This seat doesn’t exist.</h2>
            <a href="#home">Back to the club</a>
          </section>
        )}
      </main>
      <footer>
        <a href="#home" className="footer-brand">
          <Spade /> BONKERS BLACKJACK
        </a>
        <p>A little personality. A proper game.</p>
        <div>
          <a href="#how-to-play">Rules</a>
          <a href="#fairness">Fairness</a>
          <a href="#history">History</a>
          <a href="#account">Account</a>
          <a href="#profile">Your profile</a>
          <span>18+ · PLAY MONEY ONLY</span>
        </div>
        <small>
          Prototype • No real cryptocurrency is accepted or paid out.
        </small>
      </footer>
      {modal === "login" && (
        <Dialog title="You’re our kind of Bonkers." onClose={closeModal}>
          {storageReady === false ? (
            <p>
              Shared play is opening soon. In the meantime, explore the club,
              table rules, and fairness guide. No real deposits are accepted.
            </p>
          ) : (
            <p>
              Pull up a chair. We’ll give you a random fun name and $1,000 in play money. Visit your profile to choose your permanent username once.
            </p>
          )}
          <form onSubmit={login}>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                required
              />
              <span>
                I’m 18+ and authorize up to $500 of play-money wagers for one
                hour. This preview has no cash value.
              </span>
            </label>
            <button
              className="button primary full"
              disabled={busy || !consent || storageReady !== true}
            >
              {busy ? "Getting your seat ready…" : "Let’s play"}{" "}
              <ArrowRight size={18} />
            </button>
          </form>
          <div className="modal-note">
            <LockKeyhole size={16} /> Demo identity only. No real wallet or
            deposit required.
          </div>
        </Dialog>
      )}
      {modal === "private" && (
        <Dialog title="Your crew. Your table." onClose={closeModal}>
          <p>
            Make a private room and share its invitation link. Only people with
            the link can find it.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await command("create-table", { name: privateName });
              if (r?.result) {
                setModal(null);
                openTable(r.result.tableId);
              }
            }}
          >
            <label>
              Table name
              <input
                required
                minLength={3}
                maxLength={40}
                value={privateName}
                onChange={(e) => setPrivateName(e.target.value)}
                placeholder="The usual suspects"
              />
            </label>
            <button className="button primary full" disabled={busy}>
              Create private table <ArrowRight size={18} />
            </button>
          </form>
        </Dialog>
      )}
      {modal === "session" && (
        <Dialog title="Set your session limits." onClose={closeModal}>
          <p>
            Authorize a fixed amount of play-money wagers for one hour. You can
            revoke it in Account.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await command("authorize", {
                limit: Math.round(Number(sessionLimit) * 100),
              });
              if (r) setModal(null);
            }}
          >
            <label>
              Maximum play-money spend ($)
              <input
                type="number"
                required
                min="1"
                max="50000"
                value={sessionLimit}
                onChange={(e) => setSessionLimit(e.target.value)}
              />
            </label>
            <button className="button primary full" disabled={busy}>
              Authorize play session <LockKeyhole size={17} />
            </button>
          </form>
        </Dialog>
      )}
      {modal === "cashier" && (
        <Dialog title="The cashier." onClose={closeModal}>
          {cryptoTestingEnabled && <p>Real USDC testing uses a separate wallet balance. <a className="text-link" href="/crypto-pilot">Connect a wallet, test, or withdraw your funds →</a></p>}
          <div className="cashier-balance">
            <span>AVAILABLE PLAY MONEY</span>
            <strong>
              {money(account?.balance ?? 0)} <small>USDC</small>
            </strong>
          </div>
          <div className="demo-warning">
            SIMULATED CASHIER · Never send real crypto.
          </div>
          {activeTransfer ? (
            <>
              <button
                className="text-link"
                onClick={() => setSelectedTransfer(null)}
              >
                <ArrowLeft size={15} /> New transfer
              </button>
              <div className="transfer-detail">
                <span className="tag">
                  {activeTransfer.kind.toUpperCase()} · {activeTransfer.symbol}{" "}
                  / {activeTransfer.network}
                </span>
                <h3>
                  {activeTransfer.status === "completed"
                    ? "All done."
                    : activeTransfer.status === "failed"
                      ? "Route failed."
                      : activeTransfer.status === "expired"
                        ? "Quote expired."
                        : "Your transfer, step by step."}
                </h3>
                <strong className="transfer-amount">
                  {money(activeTransfer.credit)} <small>PLAY USDC</small>
                </strong>
                {activeTransfer.kind === "deposit" &&
                  activeTransfer.status === "awaiting" && (
                    <>
                      <div className="qr-wrap">
                        {qr && (
                          <Image
                            src={qr}
                            alt="Demo-only deposit identifier QR. Not a crypto address."
                            width={150}
                            height={150}
                            unoptimized
                          />
                        )}
                      </div>
                      <code className="demo-address">
                        {activeTransfer.address}
                      </code>
                      <button
                        className="text-link"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(
                              activeTransfer.address,
                            );
                            setNotice("Demo identifier copied.");
                          } catch {
                            setError("Clipboard unavailable");
                          }
                        }}
                      >
                        <Copy size={14} /> Copy demo identifier
                      </button>
                      <p className="muted">
                        Quote expires in{" "}
                        {Math.max(
                          0,
                          Math.ceil((activeTransfer.expiresAt - now) / 1000),
                        )}
                        s. This identifier cannot receive cryptocurrency.
                      </p>
                    </>
                  )}
                <div className="transfer-steps">
                  {["awaiting", "confirming", "converting", "completed"].map(
                    (s, i) => (
                      <div
                        className={
                          [
                            "awaiting",
                            "confirming",
                            "converting",
                            "completed",
                          ].indexOf(activeTransfer.status) >= i
                            ? "done"
                            : ""
                        }
                        key={s}
                      >
                        <span>
                          {[
                            "awaiting",
                            "confirming",
                            "converting",
                            "completed",
                          ].indexOf(activeTransfer.status) > i ? (
                            <Check size={12} />
                          ) : (
                            i + 1
                          )}
                        </span>
                        {["Waiting", "Detected", "Converting", "Complete"][i]}
                      </div>
                    ),
                  )}
                </div>
                {activeTransfer.message && <p>{activeTransfer.message}</p>}
                {activeTransfer.status === "awaiting" && (
                  <button
                    className="button primary full"
                    disabled={busy}
                    onClick={() =>
                      void command("simulate", { id: activeTransfer.id })
                    }
                  >
                    Simulate incoming deposit <ArrowRight size={18} />
                  </button>
                )}
                {!["completed", "failed", "expired"].includes(
                  activeTransfer.status,
                ) && (
                  <button
                    className="text-link"
                    disabled={busy}
                    onClick={() =>
                      void command("fail-transfer", { id: activeTransfer.id })
                    }
                  >
                    Test a failed transfer
                  </button>
                )}
                <p className="muted">
                  Fee: {money(activeTransfer.fee)} simulated. Failed withdrawals
                  return reserved play money. Failed deposits never credit your
                  balance.
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="tabs">
                <button
                  className={transferTab === "deposit" ? "active" : ""}
                  onClick={() => setTransferTab("deposit")}
                >
                  Deposit
                </button>
                <button
                  className={transferTab === "withdrawal" ? "active" : ""}
                  onClick={() => setTransferTab("withdrawal")}
                >
                  Withdraw
                </button>
              </div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const r = await command(transferTab, {
                    symbol: asset.symbol,
                    network: asset.network,
                    amount:
                      transferTab === "deposit"
                        ? Number(amount)
                        : Math.round(Number(amount) * 100),
                    address: destination,
                  });
                  if (r?.result) setSelectedTransfer(r.result.id);
                }}
              >
                <label>
                  Choose your crypto
                  <select
                    value={assetIndex}
                    onChange={(e) => {
                      setAssetIndex(Number(e.target.value));
                      setAmount(
                        transferTab === "withdrawal"
                          ? "100"
                          : ASSETS[Number(e.target.value)].symbol === "BTC"
                            ? "0.002"
                            : ASSETS[Number(e.target.value)].symbol === "ETH"
                              ? "0.05"
                              : ASSETS[Number(e.target.value)].symbol === "SOL"
                                ? "1"
                                : "100",
                      );
                    }}
                  >
                    {ASSETS.map((a, i) => (
                      <option value={i} key={a.symbol}>
                        {a.symbol} — {a.network}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="network-label">
                  <span className="status-dot" />
                  {asset.network} network <span>DEMO ROUTE</span>
                </div>
                <label>
                  {transferTab === "deposit"
                    ? `Amount (${asset.symbol})`
                    : "Withdraw amount (USD)"}
                  <input
                    type="number"
                    min="0.000001"
                    step="any"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </label>
                {transferTab === "withdrawal" && (
                  <label>
                    Demo destination
                    <input
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                      required
                      pattern="demo:[a-zA-Z0-9-]{3,80}"
                    />
                  </label>
                )}
                <div className="quote">
                  <div>
                    <span>Illustrative conversion rate</span>
                    <b>
                      1 {asset.symbol} = ${asset.rate.toLocaleString()}
                    </b>
                  </div>
                  <div>
                    <span>Simulated routing fee</span>
                    <b>{money(asset.fee * 100)}</b>
                  </div>
                  <div className="quote-total">
                    <span>
                      {transferTab === "deposit" ? "You receive" : "After fees"}
                    </span>
                    <strong>
                      {money(estimated)} <small>PLAY USDC</small>
                    </strong>
                  </div>
                </div>
                <p className="muted">
                  Fixed demo rates, not market prices. $10–$5,000 per transfer.
                  Deposit quotes expire after two minutes; create a new quote if
                  expired.
                </p>
                <button className="button primary full" disabled={busy}>
                  {transferTab === "deposit"
                    ? "Create demo deposit"
                    : "Simulate withdrawal"}{" "}
                  <ArrowRight size={18} />
                </button>
              </form>
            </>
          )}
        </Dialog>
      )}
    </div>
  );
}
