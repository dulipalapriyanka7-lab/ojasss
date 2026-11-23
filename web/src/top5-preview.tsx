// Local verification entry; not imported by the production application.
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {Top5Board,TopUsersBar} from './pages/LeaderboardTop5';
import './styles/index.css';
const mk=(u:string,v:number,w:number,vc:number,s:number)=>({user_id:u,username:u,display_name:u,avatar_path:null,votes:v,views:w,viral:vc,seconds:s,video_count:vc,rank:1,target:0,qualified:true,post_id:''});
const g=[[mk('doondi',22,438,65,24480)],[mk('bhavani',9,218,31,8040)],[mk('ramya_sweet_girl',3,86,20,5640)],[mk('saichran',2,43,12,2100)],[mk('user_gowtham',1,17,8,0)]];
createRoot(document.getElementById('root')!).render(<BrowserRouter><div style={{maxWidth:430,margin:'0 auto',padding:16,background:'#0b0a12',minHeight:'100vh'}}><Top5Board groups={g} targets={[20,10,5,2,1]} unit="qualified videos" onTabs={<nav className="t5-tabs"><button className="is-active">Leaderboard</button><button>Remaining Positions</button><a>All Posts</a><a>Add Video</a></nav>}/><TopUsersBar entries={[g[0][0],g[2][0]]} total={2} onMore={()=>{}}/></div></BrowserRouter>);
