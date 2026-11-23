import { Bell } from 'lucide-react';
import { useState } from 'react';
import { platform } from '@/lib/platform';
import { Button } from './ui/Button';
import { Card } from './ui/Feedback';

export function PushSettings() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const permission=!platform.isAndroidApp()&&'Notification' in window?Notification.permission:null;
  const enable = async () => {
    setBusy(true); setMessage(''); setError(false);
    try {
      if (platform.isAndroidApp()) platform.requestPushToken();
      else { const { enableWebPush } = await import('@/lib/webPush'); await enableWebPush(); }
      setMessage(platform.isAndroidApp() ? 'Allow notifications in the Android prompt, if shown.' : 'Notifications are enabled for this browser.');
    } catch (e) { setError(true); setMessage(e instanceof Error ? e.message : 'Could not enable notifications.'); }
    finally { setBusy(false); }
  };
  return <Card as="section" className="settings-push-card">
    <div className="settings-card-heading"><span className="settings-section-icon"><Bell aria-hidden size={15}/></span><div><h2>Push notifications</h2><p>Receive messages, follows, comments, rewards, withdrawal updates and platform announcements.</p></div></div>
    <Button className="settings-push-enable" loading={busy} onClick={() => void enable()}>Enable notifications</Button>
    {permission==='denied'&&!message&&<p className="settings-permission-note">Allow notifications in your browser’s site settings to receive updates.</p>}
    {message && <p role={error ? 'alert' : 'status'} className={`mt-3 text-sm ${error ? 'text-danger' : 'text-success'}`}>{message}</p>}
  </Card>;
}
