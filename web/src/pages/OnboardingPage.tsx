import {normalizeReferral,savedReferral,clearReferral} from '@/lib/referral';
import { AtSign, Gift } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { users, type Me } from '@/api';
import { ApiError } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { PageLoader } from '@/components/ui/Feedback';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { useAuth } from '@/hooks/useAuth';
import { useSeo } from '@/lib/seo';
import { safeInternalPath } from '@/lib/utils';
import { AuthLayout } from './auth/AuthLayout';
import { RegionPicker } from '@/components/ui/RegionPicker';
import { COUNTRIES } from '@/lib/constants';

export default function OnboardingPage() {
  useSeo({ title: 'Set up your profile', noindex: true });
  const { me } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = safeInternalPath(params.get('next'));

  useEffect(() => {
    if (me?.onboarded) navigate(next, { replace: true });
  }, [me, navigate, next]);

  if (!me) return <PageLoader />;
  return <OnboardingForm me={me} next={next} referralFromLink={params.get('ref') ?? ''} />;
}

function OnboardingForm({ me, next, referralFromLink }: { me: Me; next: string; referralFromLink: string }) {
  const { refreshMe } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(me.display_name);
  const [username, setUsername] = useState(me.username);
  const [referral, setReferral] = useState(normalizeReferral(referralFromLink)||savedReferral());
  const [country,setCountry]=useState(me.country??'');
  const [phone,setPhone]=useState(me.phone??''),[address,setAddress]=useState(me.address??''),[bio,setBio]=useState(me.bio??'');
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const validUsername = /^[a-z0-9_]{3,24}$/.test(username);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await users.completeOnboarding(username, name.trim(), referral.trim() || undefined,country,{phone,address,bio});
      clearReferral();
      await refreshMe();
      navigate(next, { replace: true });
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Set up your profile" subtitle="This is how people will find and recognise you on OJASSS.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Display name">{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={50} autoComplete="name" required />}</Field>
        <Field
          label="Username"
          hint="3–24 characters: lowercase letters, numbers and _"
          error={username && !validUsername ? 'Use 3–24 lowercase letters, numbers or _' : error?.code?.startsWith('USERNAME') ? error.message : null}
        >
          {(p) => <Input {...p} leading={<AtSign size={18} />} value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ''))} maxLength={24} autoCapitalize="none" autoCorrect="off" spellCheck={false} required />}
        </Field>
        <Field label="Country" required>{p=><RegionPicker {...p} label="Country" value={country} onChange={setCountry} options={[{value:'ALL',label:'All countries'},...COUNTRIES]} required/>}</Field>
        <Field label="Mobile number" hint="Shown on your profile.">{p=><Input {...p} type="tel" autoComplete="tel" value={phone} onChange={e=>setPhone(e.target.value)} maxLength={24}/>}</Field>
        <Field label="Address" hint="Private. Only you can view this address.">{p=><Input {...p} autoComplete="street-address" value={address} onChange={e=>setAddress(e.target.value)} maxLength={300}/>}</Field>
        <Field label="Bio" hint="A little about you.">{p=><Textarea {...p} value={bio} onChange={e=>setBio(e.target.value)} maxLength={280} rows={2}/>}</Field>
        {!me.referred && (
          <Field label="Referral code (optional)" hint="Got an invite from a friend? Enter their code.">
            {(p) => <Input {...p} leading={<Gift size={18} />} value={referral} onChange={(e) => setReferral(e.target.value.toUpperCase())} maxLength={12} autoCapitalize="characters" />}
          </Field>
        )}
        {error && !error.code?.startsWith('USERNAME') && <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error.message}</p>}
        <Button type="submit" block size="lg" loading={busy} disabled={!name.trim() || !validUsername || !country}>Continue</Button>
      </form>
    </AuthLayout>
  );
}
