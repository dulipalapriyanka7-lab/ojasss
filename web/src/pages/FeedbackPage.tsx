import {ArrowLeft, Check, ChevronRight, ImagePlus, Lock, MessageSquareMore, X} from 'lucide-react';
import {useEffect, useState} from 'react';
import {Link, useNavigate} from 'react-router-dom';
import {FB_CATS, feedback, type FbCat} from '@/api/feedback';
import {uploadObject} from '@/api/upload';
import {useAuth} from '@/hooks/useAuth';
import {compressImage} from '@/lib/media';
import {useSeo} from '@/lib/seo';
import {cn} from '@/lib/utils';
import './feedback.css';

/** Profile card shown right under "My tasks & benefits" (own profile only). */
export function FeedbackCard() {
  return <Link to="/profile/feedback" className="fb-card">
    <span className="fb-ico"><MessageSquareMore size={18} /></span>
    <span className="fb-txt"><b>Suggestion & Feedback</b><small>Share your ideas, suggestions or feedback privately with our admin team.</small></span>
    <ChevronRight size={16} className="fb-chev" />
  </Link>;
}

/** /profile/feedback — private feedback to the admin team. */
export default function FeedbackPage() {
  useSeo({title: 'Suggestion & Feedback', noindex: true});
  const {me} = useAuth(); const nav = useNavigate();
  const [cat, setCat] = useState<FbCat>('suggestion'); const [subject, setSubject] = useState(''); const [msg, setMsg] = useState('');
  const [file, setFile] = useState<File | null>(null); const [preview, setPreview] = useState(''); const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [done, setDone] = useState<string | null>(null);
  useEffect(() => { if (!file) { setPreview(''); return; } const u = URL.createObjectURL(file); setPreview(u); return () => URL.revokeObjectURL(u); }, [file]);
  const pick = (f?: File) => { setErr(''); if (!f) return; if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { setErr('Attach a JPG, PNG or WebP screenshot.'); return; } if (f.size > 10 * 1048576) { setErr('Choose an image under 10 MB.'); return; } setFile(f); };
  const submit = async () => {
    setErr('');
    if (subject.trim().length < 3) { setErr('Enter a subject (at least 3 characters).'); return; }
    if (msg.trim().length < 10) { setErr('Write at least 10 characters in your message.'); return; }
    if (!me) { nav('/login?next=/profile/feedback'); return; }
    setBusy(true);
    try {
      let path = '';
      if (file) { const img = await compressImage(file, 1600, 0.82); if (img.blob.size > 3 * 1048576) throw new Error('Screenshot is too large. Crop it and try again.'); path = await uploadObject(img.blob, img.mime, me.id, setProgress, 'receipts').promise; }
      const r = await feedback.submit({category: cat, subject: subject.trim(), message: msg.trim(), attachment: path});
      setDone(r.ref);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not submit. Please try again.'); }
    finally { setBusy(false); }
  };
  return <main className="fbp">
    <header className="fbp-top"><button type="button" className="fbp-back" aria-label="Back" onClick={() => nav(-1)}><ArrowLeft size={18} /></button><img src="/brand/mark.png" width={26} height={26} alt="" /><h1>Suggestion & Feedback</h1></header>
    {done ? <section className="fbp-done"><span><Check size={30} strokeWidth={3} /></span><h2>Feedback Submitted Successfully</h2><p>Thank you! Your feedback has been sent privately to the OJASSS admin team.</p><small>Reference {done}</small>
      <button type="button" className="fbp-go" onClick={() => nav('/profile/' + (me?.username ?? ''))}>Back to profile</button>
      <button type="button" className="fbp-link" onClick={() => { setDone(null); setSubject(''); setMsg(''); setFile(null); }}>Send another</button></section>
    : <>
      <section className="fbp-intro"><h2>Help Us Improve OJASSS</h2><p>Your ideas and feedback help us build a better experience.</p></section>
      <h3 className="fbp-h">Feedback type</h3>
      <div className="fbp-pills">{FB_CATS.map(c => <button key={c.v} type="button" aria-pressed={cat === c.v} className={cn(cat === c.v && 'is-on')} onClick={() => setCat(c.v)}>{c.l}</button>)}</div>
      <h3 className="fbp-h">Subject</h3>
      <input className="fbp-in" value={subject} onChange={e => setSubject(e.target.value.slice(0, 100))} placeholder="What is your feedback about?" maxLength={100} aria-label="Subject" />
      <h3 className="fbp-h">Message <small>{msg.length}/1000</small></h3>
      <textarea className="fbp-in fbp-ta" value={msg} onChange={e => setMsg(e.target.value.slice(0, 1000))} placeholder="Tell us your suggestion or feedback..." maxLength={1000} rows={6} aria-label="Message" />
      <h3 className="fbp-h">Screenshot <small>optional · JPG, PNG, WebP</small></h3>
      {file ? <div className="fbp-file">{preview && <img src={preview} alt="Attachment preview" />}<span>{file.name}</span>{busy && progress > 0 && <i style={{width: `${Math.round(progress * 100)}%`}} />}<button type="button" aria-label="Remove attachment" onClick={() => setFile(null)}><X size={14} /></button></div>
        : <label className="fbp-attach"><ImagePlus size={18} />Attach a screenshot<input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => pick(e.target.files?.[0])} /></label>}
      <section className="fbp-private"><Lock size={16} /><div><b>Private Feedback</b><p>Your feedback is visible only to authorized OJASSS administrators. It will not appear publicly on your profile, feed, or leaderboard.</p></div></section>
      {err && <p className="fbp-err">{err}</p>}
      <button type="button" className="fbp-go" disabled={busy} onClick={() => void submit()}>{busy ? (progress > 0 && progress < 1 ? `Uploading ${Math.round(progress * 100)}%…` : 'Submitting…') : 'Submit to Admin'}</button>
    </>}
  </main>;
}
