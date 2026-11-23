import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Briefcase, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { inquiries } from '@/api';
import { ApiError } from '@/api/client';
import { Page, PageHeader } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Card, StatusBadge } from '@/components/ui/Feedback';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { useAuth } from '@/hooks/useAuth';
import { INQUIRY_TYPES } from '@/lib/constants';
import { date } from '@/lib/format';
import { useSeo } from '@/lib/seo';
import { cn } from '@/lib/utils';

export default function BusinessPage() {
  useSeo({ title: 'Business inquiries', description: 'Partner with OJASSS: business promotion, GST consultants and investors.', path: '/business' });
  const { me } = useAuth();
  const qc = useQueryClient();
  const mine = useQuery({ queryKey: ['inquiries'], queryFn: inquiries.mine });
  const [type, setType] = useState<string>('business_promotion');
  const [businessName, setBusinessName] = useState('');
  const [contactName, setContactName] = useState(me?.display_name ?? '');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState(me?.email ?? '');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const phoneOk = /^\+?[0-9 ]{8,16}$/.test(phone.trim());
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const valid = businessName.trim().length >= 2 && contactName.trim().length >= 2 && phoneOk && emailOk && message.trim().length >= 10;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await inquiries.submit({ type, businessName, contactName, phone, email, message });
      setSent(true);
      void qc.invalidateQueries({ queryKey: ['inquiries'] });
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page width="md">
      <PageHeader title="Business inquiries" description="Promote your business, offer GST services, or talk to us about investment. Our partnerships team replies within 2 working days." />
      {sent ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <CheckCircle2 aria-hidden size={40} className="text-success" />
          <h2 className="text-xl font-semibold">Thanks — we've received your inquiry</h2>
          <p className="text-sm text-fg-3">We'll contact you at {email}.</p>
          <Button variant="secondary" onClick={() => { setSent(false); setMessage(''); }}>Send another</Button>
        </Card>
      ) : (
        <Card className="p-5 sm:p-6">
          <form onSubmit={submit} className="space-y-4" noValidate>
            <fieldset>
              <legend className="mb-2 text-sm font-medium">I'm interested in</legend>
              <div className="grid grid-cols-2 gap-2">
                {INQUIRY_TYPES.map((t) => (
                  <label key={t.value} className={cn('flex h-12 cursor-pointer items-center justify-center rounded-xl border text-sm font-semibold transition-colors', type === t.value ? 'border-brand bg-brand-soft text-brand-ink' : 'border-line hover:bg-surface-2')}>
                    <input type="radio" name="type" value={t.value} checked={type === t.value} onChange={() => setType(t.value)} className="sr-only" />
                    {t.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Business name" required>{(p) => <Input {...p} value={businessName} onChange={(e) => setBusinessName(e.target.value)} maxLength={120} autoComplete="organization" />}</Field>
              <Field label="Contact person" required>{(p) => <Input {...p} value={contactName} onChange={(e) => setContactName(e.target.value)} maxLength={80} autoComplete="name" />}</Field>
              <Field label="Phone" required error={phone && !phoneOk ? 'Enter a valid phone number.' : null}>{(p) => <Input {...p} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" placeholder="+91" />}</Field>
              <Field label="Email" required error={email && !emailOk ? 'Enter a valid email.' : null}>{(p) => <Input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />}</Field>
            </div>
            <Field label="Message" required hint="Tell us about your business and what you're looking for.">{(p) => <Textarea {...p} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={3000} />}</Field>
            {error && <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}
            <Button type="submit" loading={busy} disabled={!valid} leading={<Briefcase aria-hidden size={18} />}>Send inquiry</Button>
          </form>
        </Card>
      )}
      {(mine.data?.length ?? 0) > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 font-semibold">Your inquiries</h2>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {mine.data!.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 p-4">
                <span><span className="block text-sm font-semibold">{i.business_name}</span><span className="text-xs text-fg-3">{INQUIRY_TYPES.find((t) => t.value === i.type)?.label} · {date(i.created_at)}</span></span>
                <StatusBadge status={i.status} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </Page>
  );
}
