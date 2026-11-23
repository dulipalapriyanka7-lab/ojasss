import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Crown,
  Copy,
  ExternalLink,
  Flame,
  MapPin,
  Lock,
  TrendingUp,
} from "lucide-react";
import { oneChance, type OneChancePackage } from "@/api/oneChance";
import { uploadObject } from "@/api/upload";
import { Page } from "@/components/layout/AppShell";
import { Card, ErrorState, Skeleton } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/hooks/useAuth";
import { usePublicSettings } from "@/hooks/usePostActions";
import { compressImage } from "@/lib/media";
import { platform } from "@/lib/platform";
import { dateTime, rupees } from "@/lib/format";
import './one-chance-promotion.css';

const placementMeta = {
  featured: { icon: Crown, label: "Fast entry" },
  boost: { icon: TrendingUp, label: "Rapid Reach" },
  top: { icon: MapPin, label: "Reserved position" },
};
export function PackageCard({
  item,
  selected,
  onSelect,
  disabled,
  occupied,
}: {
  item: OneChancePackage;
  selected: boolean;
  onSelect: (id: string) => void;
  disabled: boolean;
  occupied: boolean;
}) {
  const meta = placementMeta[item.placement];
  const Icon = meta.icon;
  return (
    <button
      type="button"
      disabled={disabled || occupied}
      onClick={() => onSelect(item.id)}
      aria-pressed={selected}
      className={`promotion-package group relative rounded-xl border p-3 text-left transition-colors duration-200 motion-reduce:transition-none disabled:cursor-not-allowed ${occupied ? "border-white/10 bg-black/15 opacity-55" : "disabled:opacity-60 " + (selected ? "border-fuchsia-400/60 bg-gradient-to-br from-fuchsia-500/10 via-violet-500/10 to-amber-400/5" : "border-line bg-surface hover:border-fuchsia-400/60")}`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-fuchsia-500/80 to-amber-400/80 text-white">
          {occupied ? (
            <Lock aria-hidden size={18} />
          ) : (
            <Icon aria-hidden size={19} />
          )}
        </span>
        <span className="text-sm font-bold">{rupees(item.price_paise)}</span>
      </div>
      <h2 className="text-sm font-semibold">{item.name}</h2>
      <p className="mt-1 text-xs text-fg-3">
        {occupied
          ? "This plan is temporarily unavailable."
          : item.description}
      </p>
      <span className="mt-2 block text-xs font-medium text-fuchsia-400">{occupied ? 'Unavailable' : selected ? 'Selected · verified fast entry' : 'Verified fast entry'}</span>
    </button>
  );
}

function VoteHours() {
  return <>{Number((usePublicSettings().data as Record<string, unknown> | undefined)?.['one_chance.vote_window_hours']) || 12}</>;
}

export default function OneChancePage() {
  const [params] = useSearchParams();
  const postId = params.get('post') || undefined;
  return <OneChanceCheckout key={postId ?? 'general'} postId={postId} />;
}

function OneChanceCheckout({postId}: {postId?: string}) {
  const { me } = useAuth(),
    qc = useQueryClient(),
    toast = useToast();
  const query = useQuery({
    queryKey: ["one-chance", me?.id, postId],
    queryFn: () => oneChance.status(postId),
    enabled: !!me,
    refetchInterval: ({ state }) => state.data?.requests.some(request => request.status === 'pending_review') ? 15000 : false,
  });
  const [selected] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [utr, setUtr] = useState(""),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0);
  const data = query.data;
  const order = data?.requests.find(
    (r) => r.status === "awaiting_payment" || r.status === "pending_review",
  );
  const available =
    data?.packages.filter(
      (item) => !data.occupied_positions.includes(item.position),
    ) ?? [];
  const activePackage = data?.packages.find(
    (p) => p.id === (selected || available[0]?.id),
  );
  const refresh = () => qc.invalidateQueries({ queryKey: ["one-chance"] });
  const openUpi = (current: NonNullable<typeof order>) => {
    const url =
      "upi://pay?" +
      new URLSearchParams({
        pa: current.upi_id,
        pn: "OJASSS",
        am: (current.amount_paise / 100).toFixed(2),
        cu: "INR",
        tn: current.package_name ?? "One Chance",
        tr: current.id,
      }).toString();
    if (platform.isAndroidApp()) {
      platform.openExternal(url);
      return;
    }
    if (/Android|iPhone|iPad/i.test(navigator.userAgent)) {
      window.location.href = url;
      return;
    }
    void navigator.clipboard?.writeText(current.upi_id);
    toast.success(
      "UPI ID copied. Complete payment in your UPI app, then upload the screenshot.",
    );
  };
  const cancelUnpaid = async () => {
    if (!order || order.status !== 'awaiting_payment') return;
    setBusy(true);
    try {
      await oneChance.cancel(order.id);
      toast.success('Payment request cancelled. No position was reserved.');
      await refresh();
    } catch (error) {
      toast.error(error);
    } finally {
      setBusy(false);
    }
  };
  const start = async () => {
    if (!activePackage) return;
    setBusy(true);
    try {
      await oneChance.request(activePackage.id, postId);
      await refresh();
    } catch (error) {
      toast.error(error);
    } finally {
      setBusy(false);
    }
  };
  const payCoins = async () => {
    if (!order) return;
    setBusy(true);
    try { await oneChance.payCoins(order.id); toast.success("Paid with game coins. Sent for review."); await refresh(); }
    catch (error) { toast.error(error); } finally { setBusy(false); }
  };
  const submit = async () => {
    if (!file || !order || !me) return;
    setBusy(true);
    try {
      if (file.size > 10 * 1024 * 1024)
        throw new Error("Choose an image under 10 MB.");
      if (!/^[a-zA-Z0-9-]{8,40}$/.test(utr.trim()))
        throw new Error("Enter the UPI transaction reference (UTR).");
      const image = await compressImage(file);
      const path = await uploadObject(
        image.blob,
        image.mime,
        me.id,
        setProgress,
        "receipts",
      ).promise;
      await oneChance.submit(order.id, path, utr.trim());
      toast.success("Payment screenshot submitted for review.");
      setFile(null);
      await refresh();
    } catch (error) {
      toast.error(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Page className="one-chance-promotion">
      <header className="mb-4 flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500 via-violet-500 to-amber-400 text-white">
          <Crown aria-hidden size={19} />
        </span>
        <div>
          <h1 className="text-lg font-semibold">One Chance voting</h1>
          <p className="text-xs text-fg-3">
            Votes are locked for 48 hours after your video goes Viral. Then pay ₹10 to open voting for <VoteHours /> hours. After that, votes lock for 48 hours again and you can pay again. Votes you already received are kept.
          </p>
        </div>
      </header>
      <Card className="promotion-intro mb-3 border-fuchsia-400/25 bg-gradient-to-br from-fuchsia-500/10 via-transparent to-amber-400/10 p-3">
        <div className="flex gap-3">
          <Flame
            aria-hidden
            className="mt-0.5 shrink-0 text-orange-400"
            size={20}
          />
          <div>
            <h2 className="text-sm font-semibold">Viral is always free</h2>
            <p className="mt-1 text-xs leading-relaxed text-fg-2">{postId
              ? <>After payment verification, voting opens for <VoteHours /> hours. Pay again after it locks to reopen it.</>
              : <>
              Videos from enabled categories enter One Chance when they go Viral.
              While votes are locked, open the vote control on your video to unlock them.
              </>}
            </p>
            <Link
              to="/?category=one_chance"
              className="inline-flex min-h-11 items-center text-xs font-semibold text-fuchsia-400"
            >
              View One Chance →
            </Link>
          </div>
        </div>
      </Card>
      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : !data ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : (
        <>
          {data.membership && (
            <Card className="mb-5 border-violet-400/30 bg-violet-500/10 p-4">
              <p className="font-semibold text-violet-300">
                Viral Fast Entry active
              </p>
              <p className="mt-1 text-sm text-fg-2">
                Your Viral videos can enter One Chance until {dateTime(data.membership.ends_at)}. Votes remain organic.
              </p>
            </Card>
          )}
          {postId && !data.eligible && order?.status !== 'pending_review' && data.voting_until && Date.parse(data.voting_until) > Date.now() ? (
            <Card className="p-4 text-sm">
              <p className="font-semibold">Voting is open until {dateTime(data.voting_until)}</p>
              <Link className="mt-2 inline-block text-brand-ink" to={`/post/${postId}`}>View video</Link>
            </Card>
          ) : !data.eligible && order?.status !== 'pending_review' ? (
            <Card className="p-5 text-sm text-fg-2">
              {postId ? 'Votes are already open for this video, or it is not in One Chance.' : 'Open the vote control on a locked video to unlock votes.'}
            </Card>
          ) : !order ? (
            <section className="overflow-hidden rounded-2xl border border-fuchsia-400/30 bg-gradient-to-br from-fuchsia-600/20 via-violet-600/10 to-amber-500/15 p-5 shadow-lg">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-fuchsia-300">Voting unlock</p>
                  <h2 className="mt-1 text-lg font-bold">Open votes on your video</h2>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-extrabold leading-none">{rupees(activePackage?.price_paise ?? 1000)}</p>
                  <p className="mt-1 text-[11px] text-fg-3">one-time · UPI</p>
                </div>
              </div>
              <ul className="mt-4 space-y-2 text-sm text-fg-2">
                <li className="flex gap-2"><span className="text-emerald-400">✓</span>Voting opens for <b className="text-fg"><VoteHours /> hours</b> after the admin verifies payment</li>
                <li className="flex gap-2"><span className="text-emerald-400">✓</span>If paid during the 48-hour lock, voting opens when the lock ends</li>
                <li className="flex gap-2"><span className="text-emerald-400">✓</span>All votes you already received are kept</li>
              </ul>
              <Button className="mt-5 w-full" size="lg" onClick={() => void start()} loading={busy} disabled={!activePackage}>
                Pay {rupees(activePackage?.price_paise ?? 1000)} to unlock votes
              </Button>
              <p className="mt-2 text-center text-[11px] text-fg-3">Next: pay by UPI, then upload the screenshot and UTR.</p>
            </section>
          ) : order.status === "pending_review" ? (
            <div role="status">
              <Card className="p-5">
                <h2 className="font-semibold">Payment under review</h2>
                <p className="mt-1 text-sm text-fg-3">
                  The admin verifies the UPI transaction before votes open.
                  Reference: {order.utr}
                </p>
              </Card>
            </div>
          ) : (
            <Card className="space-y-4 p-5">
              <div>
                <h2 className="font-semibold">
                  Unlock votes · Pay {rupees(order.amount_paise)}
                </h2>
                <p className="mt-1 text-sm text-fg-3">
                  Voting opens for <VoteHours /> hours as soon as the payment is verified.
                  Confirm the recipient in your UPI app before paying.
                </p>
              </div>
              {(data.coins ?? 0) >= Math.floor(order.amount_paise / 100) && (
                <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-3">
                  <p className="text-sm font-semibold text-amber-200">You have {(data.coins ?? 0).toLocaleString("en-IN")} game coins</p>
                  <p className="mt-0.5 text-xs text-fg-3">1 coin = ₹1. No UPI or screenshot needed.</p>
                  <Button className="mt-2 w-full" loading={busy} onClick={() => void payCoins()}>Pay {Math.floor(order.amount_paise / 100)} coins</Button>
                </div>
              )}
              <div className="flex min-w-0 items-center gap-2 rounded-xl border border-line bg-surface-2 p-3">
                <code className="min-w-0 flex-1 break-all text-sm">
                  {order.upi_id}
                </code>
                <Button
                  variant="ghost"
                  aria-label="Copy UPI ID"
                  onClick={async () => {
                    await navigator.clipboard.writeText(order.upi_id);
                    toast.success("UPI ID copied");
                  }}
                >
                  <Copy size={16} />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  leading={<ExternalLink size={16} />}
                  onClick={() => openUpi(order)}
                >
                  Open UPI app
                </Button>
                <Button variant="ghost" loading={busy} onClick={() => void cancelUnpaid()}>
                  Cancel unpaid request
                </Button>
              </div>
              <Field label="UPI transaction reference / UTR" required>
                {(p) => (
                  <Input
                    {...p}
                    maxLength={40}
                    value={utr}
                    onChange={(e) => setUtr(e.target.value)}
                  />
                )}
              </Field>
              <Field
                label="Payment screenshot"
                required
                hint="JPG, PNG or WebP. Visible only to you and administrators."
              >
                {(p) => (
                  <Input
                    {...p}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                )}
              </Field>
              <Button
                onClick={() => void submit()}
                loading={busy}
                disabled={!file || !utr.trim()}
              >
                Submit for verification
              </Button>
              {busy && progress > 0 && (
                <p role="status" className="text-xs text-fg-3">
                  Uploading {Math.round(progress * 100)}%
                </p>
              )}
            </Card>
          )}
          {data.requests.length > 0 && (
            <Card className="mt-5 space-y-3 p-5">
              <h2 className="font-semibold">Promotion history</h2>
              {data.requests.map((r) => (
                <div
                  key={r.id}
                  className="rounded-xl border border-line p-3 text-sm"
                >
                  <p className="font-medium">
                    {r.package_name ?? "Starter Spotlight"} ·{" "}
                    {rupees(r.amount_paise)}
                  </p>
                  <p className="text-xs text-fg-3">
                    {r.status.replaceAll("_", " ")} · {dateTime(r.created_at)}
                  </p>
                  {r.reason && <p className="mt-1 text-fg-2">{r.reason}</p>}
                </div>
              ))}
            </Card>
          )}
        </>
      )}
    </Page>
  );
}
