import { useQuery, useQueryClient } from '@tanstack/react-query';
import './my-city.css';
import { AtSign, Ban, Briefcase, Camera, Check, ChevronRight, Coins, Copy, FileText, Gift, KeyRound, LogOut, MapPin, Palette, Pencil, Phone, Share2, ShieldCheck, Sparkles, Trash2, User } from 'lucide-react';
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { blocks, deletion, users, type Me } from '@/api';
import { ApiError } from '@/api/client';
import { uploadAvatar } from '@/api/upload';
import { Page, ThemeSwitcher } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Card, ErrorState, PageLoader, Skeleton } from '@/components/ui/Feedback';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { RegionPicker } from '@/components/ui/RegionPicker';
import { Avatar } from '@/components/ui/Misc';
import { ConfirmDialog } from '@/components/ui/Overlay';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { COUNTRIES, LANGUAGES } from '@/lib/constants';
import { env } from '@/lib/env';
import { date } from '@/lib/format';
import { compressImage } from '@/lib/media';
import { platform } from '@/lib/platform';
import { useSeo } from '@/lib/seo';
import { PushSettings } from '@/components/PushSettings';
import './premium-settings.css';

function Section({ icon: Icon, title, description, children, className='' }: { icon: typeof User; title: string; description?: string; children: ReactNode; className?:string }) {
  return (
    <Card as="section" className={`settings-section-slim ${className}`}>
      <div className="settings-card-heading">
        <span className="settings-section-icon flex size-7 shrink-0 items-center justify-center rounded-lg text-fg-2"><Icon aria-hidden size={15} /></span>
        <div><h2 className="text-sm font-semibold">{title}</h2>{description && <p className="mt-0.5 text-xs text-fg-3">{description}</p>}</div>
      </div>
      {children}
    </Card>
  );
}

function ProfileField({icon:Icon,...props}:ComponentProps<typeof Field>&{icon:typeof User}){
  return <div className="settings-field-row"><Icon size={14} aria-hidden className="settings-field-icon"/><Field {...props}/></div>;
}

function ProfileForm({ me }: { me: Me }) {
  const { refreshMe } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(me.display_name);
  const [username, setUsername] = useState(me.username);
  const [bio, setBio] = useState(me.bio);
  const [phone, setPhone] = useState(me.phone ?? '');
  const [address,setAddress]=useState(me.address??'');
  const [interests, setInterests] = useState(me.interests ?? '');
  const [lang, setLang] = useState(me.preferred_language);
  const [country,setCountry]=useState(me.country??'ALL');
  const [busy, setBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const dirty = address!==(me.address??'') || name !== me.display_name || username !== me.username || bio !== me.bio || lang !== me.preferred_language || phone !== (me.phone ?? '') || interests !== (me.interests ?? '') || country!==(me.country??'ALL');

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await users.update({
        displayName: name !== me.display_name ? name : undefined,
        username: username !== me.username ? username : undefined,
        bio: bio !== me.bio ? bio : undefined,
        address:address!==(me.address??'')?address:undefined,
        phone: phone !== (me.phone ?? '') ? phone : undefined,
        interests: interests !== (me.interests ?? '') ? interests : undefined,
        language: lang !== me.preferred_language ? lang : undefined,
        country: country !== me.country ? country : undefined,
      });
      await refreshMe();
      toast.success('Profile updated');
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const changeAvatar = async (file?: File) => {
    if (!file) return;
    setAvatarBusy(true);
    try {
      const img = await compressImage(file, 512, 0.88);
      const path = await uploadAvatar(img.blob, img.mime, me.id).promise;
      await users.update({ avatarPath: path });
      await refreshMe();
      toast.success('Profile photo updated');
    } catch (err) {
      toast.error(err instanceof ApiError ? err : 'That image could not be used. Try a JPG or PNG.');
    } finally {
      setAvatarBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="settings-profile-form">
      <div className="settings-profile-heading">
        <div className="settings-avatar-ring">
          <Avatar path={me.avatar_path} name={me.display_name || me.username} size={48} />
          {avatarBusy && <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50"><Skeleton className="size-6 rounded-full" /></div>}
          <button type="button" className="settings-avatar-camera" aria-label="Change profile photo" disabled={avatarBusy} onClick={()=>fileRef.current?.click()}><Camera size={12} aria-hidden/></button>
        </div>
        <div className="settings-profile-heading-copy"><h2><User size={14} aria-hidden/>Profile</h2><p>Your public identity on OJASSS.</p>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { void changeAvatar(e.target.files?.[0]); e.target.value = ''; }} id="avatar-input" />
        <Button variant="ghost" size="sm" className="settings-change-photo" leading={<Camera aria-hidden size={13} />} loading={avatarBusy} onClick={() => fileRef.current?.click()}>Change photo</Button>
        </div>
      </div>
      <div className="settings-profile-fields">
        <ProfileField icon={User} label="Display name">{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={50} />}</ProfileField>
        <ProfileField icon={AtSign} label="Username" error={error?.code?.startsWith('USERNAME') || error?.code === 'INVALID_USERNAME' ? error.message : null}>
          {(p) => <Input {...p} value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ''))} maxLength={24} autoCapitalize="none" spellCheck={false} />}
        </ProfileField>
      <ProfileField icon={Pencil} label="Bio" hint={`${bio.length}/280`}>{(p) => <Textarea {...p} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={280} placeholder="Tell us about yourself…" className="min-h-18" />}</ProfileField>
      <ProfileField icon={Phone} label="Phone number" hint="Optional. This number will appear on your public profile.">{(p) => <Input {...p} type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={24} placeholder="+91" />}</ProfileField>
      <ProfileField icon={MapPin} label="Address" hint="Private. Only visible to you.">{p=><Input {...p} autoComplete="street-address" value={address} onChange={e=>setAddress(e.target.value)} maxLength={300}/>}</ProfileField>
      <ProfileField icon={Sparkles} label="Interests" hint="Shown on your profile. Separate your interests with commas.">{(p) => <Input {...p} value={interests} onChange={(e) => setInterests(e.target.value)} maxLength={300} placeholder="Business, news, music" />}</ProfileField>
      <div className="settings-region-fields">
      <Field label="Preferred language">{p=><RegionPicker {...p} label="Language" value={lang} onChange={setLang} options={LANGUAGES} required/>}</Field>
      <Field label="Country">{p=><RegionPicker {...p} label="Country" value={country} onChange={setCountry} options={[{value:'ALL',label:'All countries'},...COUNTRIES]} required/>}</Field>
      </div>
      {error && !error.code?.startsWith('USERNAME') && error.code !== 'INVALID_USERNAME' && <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error.message}</p>}
      <Button type="submit" className="settings-save" loading={busy} disabled={!dirty}>Save changes</Button>
      </div>
    </form>
  );
}

function BlockedList() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['blocks'], queryFn: blocks.list });
  if (q.isPending) return <Skeleton className="h-14 rounded-xl" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} compact />;
  if (q.data.length === 0) return <p className="settings-blocked-empty">No blocked accounts. People you block can’t see your posts or message you.</p>;
  return (
    <ul className="divide-y divide-line">
      {q.data.map((b) => (
        <li key={b.id} className="flex items-center gap-3 py-3">
          <Avatar path={b.avatar_path} name={b.display_name || b.username} size={40} />
          <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{b.display_name || b.username}</span><span className="block text-xs text-fg-3">@{b.username} · blocked {date(b.blocked_at)}</span></span>
          <Button variant="outline" size="sm" onClick={async () => {
            try {
              await blocks.unblock(b.id);
              toast.success(`Unblocked @${b.username}`);
              void qc.invalidateQueries({ queryKey: ['blocks'] });
            } catch (e) {
              toast.error(e);
            }
          }}>Unblock</Button>
        </li>
      ))}
    </ul>
  );
}

function LinkRow({ to, icon: Icon, children }: { to: string; icon: typeof User; children: ReactNode }) {
  return (
    <Link to={to} className="settings-link-row">
      <Icon aria-hidden size={18} className="text-fg-3" /><span className="flex-1 text-sm font-medium">{children}</span><ChevronRight aria-hidden size={18} className="text-fg-3" />
    </Link>
  );
}

export default function SettingsPage() {
  useSeo({ title: 'Settings', noindex: true });
  const { me, signOut } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied,setCopied]=useState(false);
  useEffect(()=>{document.body.classList.add('settings-premium-open');return()=>document.body.classList.remove('settings-premium-open');},[]);
  useEffect(()=>{if(!copied)return;const id=setTimeout(()=>setCopied(false),1800);return()=>clearTimeout(id);},[copied]);
  if (!me) return <PageLoader />;
  const referralLink = `${env.siteUrl}/register?ref=${me.referral_code}`;

  return (
    <Page width="md" className="settings-page-slim settings-premium">
      <header className="settings-page-heading"><div><h1>Edit profile & settings</h1><p>{me.email}</p></div><img src="/brand/settings-gears.svg" alt="" aria-hidden/></header>
      
      <div className="settings-card-stack">
        <Card as="section" className="settings-profile-card">
          <ProfileForm key={me.id} me={me} />
        </Card>

        <Section icon={MapPin} title="My City" description="Local videos, news, jobs and businesses for your city."><Link to="/my-city" className="city-chip is-on" style={{display:"inline-flex",alignItems:"center"}}>📍 {me.city??"Choose your city"} · Change</Link></Section>
        <Section icon={Palette} title="Appearance" description="Choose your app theme." className="settings-appearance">
          <ThemeSwitcher />
        </Section>

        <PushSettings />

        <Section icon={Gift} title="Invite friends" description="Share your code. Referral rewards are credited after review." className="settings-referral">
          <img src="/brand/referral-gift.svg" alt="" aria-hidden className="settings-referral-art"/>
          <div className="settings-referral-code">
            <code>{me.referral_code}</code>
            <Button variant="secondary" size="sm" leading={copied?<Check aria-hidden size={14}/>:<Copy aria-hidden size={14}/>} onClick={async () => { await navigator.clipboard.writeText(me.referral_code); setCopied(true);toast.success('Code copied'); }}>{copied?'Copied':'Copy'}</Button>
            <Button variant="secondary" size="sm" leading={<Share2 aria-hidden size={15} />} onClick={() => void platform.share({ title: 'Join me on OJASSS', text: `Use my code ${me.referral_code}`, url: referralLink })}>Share</Button>
          </div>
        </Section>

        <Section icon={Ban} title="Blocked accounts"><BlockedList /></Section>

        <Section icon={FileText} title="More" className="settings-more">
          <div className="settings-more-links">
            <LinkRow to="/business" icon={Briefcase}>Business inquiries</LinkRow>
            <LinkRow to="/forgot-password" icon={KeyRound}>Change password</LinkRow>
            <LinkRow to="/community-guidelines" icon={FileText}>Community guidelines</LinkRow>
            <LinkRow to="/privacy-policy" icon={ShieldCheck}>Privacy policy</LinkRow>
            <LinkRow to="/terms" icon={FileText}>Terms of service</LinkRow>
            <LinkRow to="/earnings-terms" icon={Coins}>Earnings terms</LinkRow>
          </div>
        <div className="settings-account-actions">
          <Button className="settings-signout" leading={<LogOut aria-hidden size={15} />} onClick={async () => { await signOut(); navigate('/'); }}>Sign out</Button>
          <Button variant="outline" className="settings-delete" leading={<Trash2 aria-hidden size={15} />} onClick={() => setDeleting(true)}>Delete account</Button>
        </div>
        </Section>
      </div>

      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Request account deletion?"
        description="Your profile, posts, comments and messages will be permanently deleted after review (within 30 days). Financial records are kept as required by law. Pending earnings are forfeited."
        confirmLabel="Request deletion"
        tone="danger"
        reasonLabel="Why are you leaving? (optional)"
        loading={busy}
        onConfirm={async (reason) => {
          setBusy(true);
          try {
            await deletion.requestSignedIn(reason || null, platform.isAndroidApp() ? 'android' : 'in_app');
            toast.success('Deletion requested. We will email you when it is complete.');
            setDeleting(false);
          } catch (e) {
            toast.error(e);
          } finally {
            setBusy(false);
          }
        }}
      />
    </Page>
  );
}
