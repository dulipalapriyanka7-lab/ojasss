import {Armchair, ChevronDown, Sofa} from 'lucide-react';
import {memo, useState} from 'react';
import type {SeatStates, Show} from '@/api/shows';
import {cn} from '@/lib/utils';
import './seat-map.css';

/** Badge for seats sold on other platforms (text marks, not brand logos). */
const SRC_MARK: Record<string, string> = {bookmyshow: 'B', district: 'D', other: '•', admin: '★'};

/** Theatre seat map: sections with price, row letters, aisle gaps, screen at the bottom.
 *  variant="cards" (Premiere page) shows each section as a collapsible slim card. */
export const SeatMap = memo(function SeatMap({show, seats, selected, onToggle, admin = false, variant = 'plain'}: {
  show: Show; seats: SeatStates; selected: Set<string>; onToggle: (id: string) => void; admin?: boolean; variant?: 'plain' | 'cards';
}) {
  const cards = variant === 'cards';
  const [shut, setShut] = useState<Set<string>>(new Set());
  const flip = (k: string) => setShut(p => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const grid = (sec: Show['sections'][number]) => sec.rows.map(row => <div key={row.r} className="sm-row">
    <b className="sm-letter">{row.r}</b>
    {row.blocks.map(([a, b], bi) => <div key={bi} className="sm-block">
      {Array.from({length: b - a + 1}, (_, i) => a + i).map(n => {
        const id = `${sec.key}:${row.r}:${n}`;
        const st = seats[id];
        const src = st?.startsWith('b:') ? st.slice(2) : null;
        const on = selected.has(id);
        const unavailable = !admin && !!st;
        return <button type="button" key={n} disabled={unavailable}
          aria-label={`Row ${row.r} seat ${n}${src ? ' sold on ' + src : st ? ' ' + st : ''}`} aria-pressed={on}
          className={cn('sm-seat', on && 'is-on', st === 'sold' && 'is-sold', st === 'held' && 'is-held', st === 'mine' && 'is-mine', src && 'is-src is-' + src)}
          onClick={() => onToggle(id)}>
          {on ? <><img src="/brand/mark.png" alt="" /><i className="sm-spark" aria-hidden />{cards && <i className="sm-bubbles" aria-hidden><b /><b /><b /><b /><b /></i>}</> : src ? <em>{SRC_MARK[src]}</em> : <span>{n}</span>}
        </button>;
      })}
    </div>)}
  </div>);
  if (cards) return <div className="sm-wrap sm-cards">
    {show.sections.map(sec => {
      const open = !shut.has(sec.key);
      const Icon = sec.key === 'recliner' ? Sofa : Armchair;
      return <section key={sec.key} className={cn('smc', !open && 'is-shut')}>
        <button type="button" className="smc-head" aria-expanded={open} onClick={() => flip(sec.key)}>
          <Icon size={16} className="smc-ico" /><b>₹{sec.price}</b><span>{sec.name}</span><ChevronDown size={16} className="smc-chev" />
        </button>
        {open && <div className="smc-scroll"><div className="smc-grid">{grid(sec)}</div></div>}
      </section>;
    })}
    <div className="smc-screen" aria-hidden><i /><span>Screen this way</span></div>
    <div className="smc-legend">
      <span><i className="sm-seat" />Available</span>
      <span><i className="sm-seat is-on"><img src="/brand/mark.png" alt="" /></i>Selected</span>
      <span><i className="sm-seat is-sold" />Booked</span>
      <span><i className="sm-seat is-held" />On hold</span>
      <span><i className="sm-seat is-src is-bookmyshow"><em>B</em></i>BookMyShow</span>
      <span><i className="sm-seat is-src is-district"><em>D</em></i>District</span>
    </div>
  </div>;
  return <div className="sm-wrap">
    <div className="sm-scroll">
      <div className="sm-map">
        {show.sections.map(sec => <section key={sec.key} className={'sm-sec sm-' + sec.key}>
          <h3><span>₹{sec.price}</span>{sec.name}</h3>
          {grid(sec)}
        </section>)}
        <div className="sm-screen" aria-hidden><i /><span>All eyes this way please!</span></div>
      </div>
    </div>
    <div className="sm-legend">
      <span><i className="sm-seat" /> Available</span>
      <span><i className="sm-seat is-on"><img src="/brand/mark.png" alt="" /></i> Selected</span>
      <span><i className="sm-seat is-sold" /> Sold</span>
      <span><i className="sm-seat is-src is-bookmyshow"><em>B</em></i> BookMyShow</span>
      <span><i className="sm-seat is-src is-district"><em>D</em></i> District</span>
      <span><i className="sm-seat is-src is-other"><em>•</em></i> Other</span>
    </div>
  </div>;
});
