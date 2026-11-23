import {useState} from 'react';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
vi.mock('@/lib/media',()=>({compressImage:vi.fn()}));
vi.mock('@/components/ui/Toast',()=>({useToast:()=>({error:vi.fn()})}));
import {compressImage} from '@/lib/media';
import {ThumbnailPicker} from './ThumbnailPicker';
beforeEach(()=>{Object.defineProperty(URL,'createObjectURL',{configurable:true,value:vi.fn(()=> 'blob:cover')});Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:vi.fn()});});afterEach(()=>{cleanup();vi.clearAllMocks();});
it('shows an automatic frame, previews a custom cover, and restores the default',async()=>{const original=new Blob(['frame'],{type:'image/jpeg'}),custom=new Blob(['custom'],{type:'image/webp'}),busy=vi.fn();vi.mocked(compressImage).mockResolvedValue({blob:custom,mime:'image/webp',width:100,height:100});function Case(){const[value,setValue]=useState<Blob|null>(original);return <ThumbnailPicker value={value} original={original} onChange={setValue} onBusyChange={busy}/>;}render(<Case/>);expect(screen.getByAltText('Automatic video thumbnail')).toBeVisible();fireEvent.change(screen.getByLabelText('Upload video thumbnail'),{target:{files:[new File(['image'],'cover.jpg',{type:'image/jpeg'})]}});await screen.findByAltText('Custom video thumbnail');await waitFor(()=>expect(busy).toHaveBeenLastCalledWith(false));fireEvent.click(screen.getByRole('button',{name:'Use video frame'}));expect(screen.getByAltText('Automatic video thumbnail')).toBeVisible();expect(URL.revokeObjectURL).toHaveBeenCalled();});
