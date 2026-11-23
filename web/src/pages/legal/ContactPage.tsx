import { Briefcase, LifeBuoy, Mail, Scale, ShieldAlert, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/Feedback';
import { useSeo } from '@/lib/seo';
import { LEGAL_ENTITY as E } from './content';
import { PublicLayout } from './PublicLayout';

const CHANNELS = [
  { icon: LifeBuoy, title: 'Help & support', text: 'Account, login and app questions.', email: E.support },
  { icon: ShieldAlert, title: 'Safety & child protection', text: 'Urgent safety concerns. Monitored daily.', email: E.safety },
  { icon: Scale, title: 'Grievance Officer', text: 'Complaints about content under the IT Rules, 2021. Acknowledged within 24 hours.', email: E.grievance },
  { icon: Wallet, title: 'Payouts', text: 'Questions about rewards and withdrawals.', email: E.payouts },
  { icon: Mail, title: 'Privacy', text: 'Data access, correction and deletion requests.', email: E.privacy },
];

export default function ContactPage() {
  useSeo({ title: 'Contact', description: 'How to reach the OJASSS team.', path: '/contact' });
  return (
    <PublicLayout>
      <h1 className="text-3xl font-bold sm:text-4xl">Contact us</h1>
      <p className="mt-3 max-w-2xl text-lg text-fg-2">We read every message. Choose the right team so we can help you faster.</p>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {CHANNELS.map((c) => (
          <Card key={c.title} className="p-5">
            <c.icon aria-hidden size={22} className="text-brand" />
            <h2 className="mt-3 font-semibold">{c.title}</h2>
            <p className="mt-1 text-sm text-fg-3">{c.text}</p>
            <a href={`mailto:${c.email}`} className="mt-3 inline-block font-semibold text-brand-ink hover:underline">{c.email}</a>
          </Card>
        ))}
        <Card className="p-5">
          <Briefcase aria-hidden size={22} className="text-brand" />
          <h2 className="mt-3 font-semibold">Business & partnerships</h2>
          <p className="mt-1 text-sm text-fg-3">Promotions, GST consultants and investors.</p>
          <Link to="/business" className="mt-3 inline-block font-semibold text-brand-ink hover:underline">Send a business inquiry</Link>
        </Card>
      </div>
    </PublicLayout>
  );
}
