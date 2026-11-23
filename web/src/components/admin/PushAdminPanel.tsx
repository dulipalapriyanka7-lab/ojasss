import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { invoke } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Feedback';
import { Field, Input, Textarea } from '@/components/ui/Field';

type Status = { configured: boolean; project_id: string | null; web_configured: boolean; android_devices: number; web_devices: number; pending: number; failed: number; cron_command: string; last_worker: { last_run_at: string } | null };
export function PushAdminPanel() {
  const status = useQuery({ queryKey: ['admin', 'push-status'], queryFn: () => invoke<Status>('push-status', {}), refetchInterval: 30000 });
  const [web, setWeb] = useState('');
  const [vapid, setVapid] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMessage(''); setError(false);
    try {
      const firebaseConfig: unknown = JSON.parse(web);
      if (file && file.size > 32768) throw new Error('Select the Firebase service-account JSON file.');
      const serviceAccount: unknown = file ? JSON.parse(await file.text()) : undefined;
      await invoke('configure-push', { firebaseConfig, vapidKey: vapid, ...(serviceAccount ? { serviceAccount } : {}) });
      setFile(null); setWeb(''); setVapid(''); setMessage('Firebase configuration saved.'); await status.refetch();
    } catch (e) { setError(true); setMessage(e instanceof Error ? e.message : 'Could not save Firebase configuration.'); }
    finally { setBusy(false); }
  };
  return <Card as="section" className="mb-5 p-5">
    <h2 className="font-semibold">Firebase push notifications</h2>
    {status.data && <>
      <p className="mt-2 text-sm text-fg-2">{status.data.configured ? `Connected to ${status.data.project_id ?? 'Firebase'}` : 'Awaiting Firebase configuration'} · {status.data.android_devices} Android devices · {status.data.web_devices} browsers</p>
      <p className="mt-1 text-sm text-fg-3">{status.data.pending} queued · {status.data.failed} failed · Worker: {status.data.last_worker?.last_run_at ?? 'awaiting first run'}</p>
      <details className="mt-3 text-sm"><summary className="cursor-pointer font-medium">Notification worker schedule</summary><p className="mt-2 text-fg-2">Add this command in Hostinger Cron Jobs, once per minute:</p><code className="mt-2 block overflow-x-auto rounded-lg bg-surface-2 p-3">{status.data.cron_command}</code></details>
      <Button className="mt-4" variant="secondary" onClick={() => { void invoke<{ message: string }>('test-push', {}).then((r) => { setError(false); setMessage(r.message); return status.refetch(); }).catch((e: unknown) => { setError(true); setMessage(e instanceof Error ? e.message : 'Test failed.'); }); }}>Send test to my devices</Button>
    </>}
    {status.error && <p role="alert" className="mt-2 text-sm text-danger">Could not load notification status.</p>}
    <details className="mt-4"><summary className="cursor-pointer text-sm font-medium">Configure Firebase</summary>
      <form onSubmit={save} className="mt-4 space-y-4">
        <Field label="Firebase web configuration JSON">{(p) => <Textarea {...p} rows={5} value={web} onChange={(e) => setWeb(e.target.value)} required placeholder={'{"apiKey":"…","projectId":"…","appId":"…","messagingSenderId":"…"}'} />}</Field>
        <Field label="Public VAPID key">{(p) => <Input {...p} value={vapid} onChange={(e) => setVapid(e.target.value)} required />}</Field>
        <Field label="Firebase service account JSON" hint="Stored privately on the server, outside the website folder.">{(p) => <input {...p} type="file" accept="application/json,.json" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full rounded-xl border border-line p-3 text-sm" />}</Field>
        <Button type="submit" loading={busy}>Save Firebase configuration</Button>
      </form>
    </details>
    {message && <p role={error ? 'alert' : 'status'} className={`mt-4 text-sm ${error ? 'text-danger' : 'text-success'}`}>{message}</p>}
  </Card>;
}
