import {useState} from 'react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Dialog} from '@/components/ui/Overlay';
beforeEach(()=>vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener:()=>{},removeEventListener:()=>{}})));afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe('modal back behavior',()=>{
 it('keeps the conversation above the keyboard and releases viewport listeners on close',async()=>{
  const viewport=Object.assign(new EventTarget(),{height:800,width:390,offsetTop:0,offsetLeft:0});
  const remove=vi.spyOn(viewport,'removeEventListener');
  vi.stubGlobal('visualViewport',viewport);
  const {unmount}=render(<Dialog open onClose={()=>{}} title="Keyboard conversation" className="h-[680px]"><textarea aria-label="Your voice"/></Dialog>);
  const dialog=screen.getByRole('dialog',{name:'Keyboard conversation'});
  fireEvent.focus(screen.getByRole('textbox'));
  viewport.height=340;viewport.offsetTop=12;
  act(()=>{viewport.dispatchEvent(new Event('resize'));});
  await waitFor(()=>expect(dialog).toHaveStyle({maxHeight:'332px'}));
  expect(dialog.parentElement).toHaveStyle({height:'340px',top:'12px'});
  viewport.height=800;viewport.offsetTop=0;act(()=>{viewport.dispatchEvent(new Event('resize'));});
  await waitFor(()=>expect(dialog.parentElement).toHaveStyle({height:'800px',top:'0px'}));
  unmount();expect(remove).toHaveBeenCalledWith('resize',expect.any(Function));expect(remove).toHaveBeenCalledWith('scroll',expect.any(Function));
 });
 it('closes only the most recent sheet and preserves its parent conversation',async()=>{function Test(){const [parent,setParent]=useState(true),[child,setChild]=useState(false);return <Dialog open={parent} onClose={()=>setParent(false)} title="Speak conversation"><button onClick={()=>setChild(true)}>Options</button><Dialog open={child} onClose={()=>setChild(false)} title="Voice actions">Actions here</Dialog></Dialog>;}render(<Test/>);await userEvent.click(screen.getByRole('button',{name:'Options'}));expect(screen.getByRole('dialog',{name:'Voice actions'})).toBeVisible();fireEvent.keyDown(document,{key:'Escape'});await waitFor(()=>expect(screen.queryByRole('dialog',{name:'Voice actions'})).not.toBeInTheDocument());expect(screen.getByRole('dialog',{name:'Speak conversation'})).toBeVisible();fireEvent.keyDown(document,{key:'Escape'});await waitFor(()=>expect(screen.queryByRole('dialog',{name:'Speak conversation'})).not.toBeInTheDocument());});
});
