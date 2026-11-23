import {Page} from '@/components/layout/AppShell';
import {MemberTasks} from './MemberProgram';
import {Sparkles} from 'lucide-react';
export default function MyTasksPage(){return <Page width="sm"><header className="mb-5 flex items-center gap-3"><Sparkles size={22} className="text-fuchsia-400"/><div><h1 className="text-lg font-bold">Your daily tasks</h1><p className="text-xs text-fg-3">Invites, videos and rewards assigned to you.</p></div></header><div className="member-task-screen"><MemberTasks/></div></Page>;}
