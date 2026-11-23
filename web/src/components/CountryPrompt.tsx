import { useState } from 'react';
import { users } from '@/api';
import { useAuth } from '@/hooks/useAuth';
import { COUNTRIES } from '@/lib/constants';
import { Dialog } from './ui/Overlay';
import { RegionPicker } from './ui/RegionPicker';
import { Button } from './ui/Button';

export function CountryPrompt() {
  const {me,refreshMe}=useAuth();
  const [country,setCountry]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const save=async(value:string)=>{setBusy(true);setError('');try{await users.update({country:value});await refreshMe();}catch(e){setError(e instanceof Error?e.message:'Could not save country.');}finally{setBusy(false);}};
  return <Dialog open={!!me&&!me.country} onClose={()=>{}} title="Choose your country" description="See videos from your country, or browse all countries. You can change this on Home anytime." size="sm">
    <div className="space-y-4"><RegionPicker label="Country" options={COUNTRIES} value={country} onChange={setCountry} required/>
      <Button block loading={busy} disabled={!country} onClick={()=>void save(country)}>Continue</Button>
      <Button block variant="secondary" disabled={busy} onClick={()=>void save('ALL')}>Show all countries</Button>
      {error&&<p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  </Dialog>;
}
