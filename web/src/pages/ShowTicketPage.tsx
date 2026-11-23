import {useQuery} from '@tanstack/react-query';
import {ArrowLeft, Calendar, Check, Clock3, Copy, MapPin} from 'lucide-react';
import QRCode from 'qrcode';
import {useEffect, useState} from 'react';
import {useNavigate, useParams} from 'react-router-dom';
import {seatLabel, shows} from '@/api/shows';
import {useSeo} from '@/lib/seo';
import './show-ticket.css';

const rupee = (n: number) => '₹' + n.toLocaleString('en-IN');
const PENDING: Record<string, string> = {pending: 'Payment being verified', held: 'Payment not completed', rejected: 'Booking not confirmed', expired: 'Seat hold expired', cancelled: 'Cancelled'};

/** Digital movie ticket for a confirmed premiere booking. The QR carries the server-signed ticket token. */
export default function ShowTicketPage() {
  useSeo({title: 'Movie ticket', noindex: true});
  const {id = ''} = useParams(); const nav = useNavigate();
  const q = useQuery({queryKey: ['show-ticket', id], queryFn: () => shows.ticket(id), refetchInterval: d => (d.state.data?.order.status === 'pending' ? 15000 : false)});
  const [qr, setQr] = useState(''); const [copied, setCopied] = useState(false);
  useEffect(() => { const tok = q.data?.qr; if (!tok) { setQr(''); return; } void QRCode.toDataURL(tok, {errorCorrectionLevel: 'M', margin: 2, width: 360, color: {dark: '#101827', light: '#FFFFFF'}}).then(setQr); }, [q.data?.qr]);
  const d = q.data; const show = d?.show; const o = d?.order;
  const when = show ? new Date(show.starts_at) : null;
  return <main className="st">
    <header className="st-top">
      <button type="button" className="st-back" aria-label="Back" onClick={() => nav('/premiere')}><ArrowLeft size={18} /></button>
      <img src="/brand/mark.png" width={28} height={28} alt="" /><b>OJASSS</b>
      <span>MOVIE TICKET</span>
    </header>
    <i className="st-line" aria-hidden />
    {q.isLoading && <p className="st-msg">Loading ticket…</p>}
    {q.isError && <p className="st-msg">This ticket could not be found.</p>}
    {d && show && o && when && <article className="st-ticket">
      <div className="st-movie">
        <img className="st-poster" src={show.poster} alt={`${show.title} poster`} />
        <div className="st-info">
          <em>PREMIERE SHOW</em>
          <h1>{show.title}</h1>
          <p className="st-lang">{show.language} • {show.format}</p>
          <p><Calendar size={14} />{when.toLocaleDateString('en-IN', {weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'})}</p>
          <p><Clock3 size={14} />{when.toLocaleTimeString('en-IN', {hour: 'numeric', minute: '2-digit'})}</p>
          <p><MapPin size={14} />{show.theatre}, {show.city}</p>
        </div>
      </div>
      <div className="st-strip">
        <div><small>SCREEN</small><b>Main</b></div>
        <div><small>SEATS</small><b>{o.seats.map(seatLabel).join(', ')}</b></div>
        <div><small>TICKETS</small><b>{o.seats.length}</b></div>
        <div><small>TOTAL</small><b>{rupee(o.amount)}</b></div>
      </div>
      <div className="st-perf" aria-hidden><i /><span /><i /></div>
      <div className="st-bottom">
        {d.qr ? <div className="st-qr">{qr ? <img src={qr} alt="Ticket QR code" /> : <span />}</div>
          : <div className="st-qr is-pending"><Clock3 size={26} /><small>{PENDING[o.status] ?? o.status}</small></div>}
        <div className="st-ref">
          <small>BOOKING ID</small>
          <b>{d.booking_ref}<button type="button" aria-label="Copy booking ID" onClick={() => { void navigator.clipboard?.writeText(d.booking_ref); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? <Check size={14} /> : <Copy size={14} />}</button></b>
          <p className={'st-status is-' + o.status}>{o.status === 'confirmed' ? (d.checked_in ? 'Checked in' : 'Confirmed · show this QR at entry') : PENDING[o.status] ?? o.status}</p>
        </div>
      </div>
    </article>}
  </main>;
}
