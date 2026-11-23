import {useNavigate} from 'react-router-dom';
import {CategoryWelcome} from '@/components/feed/CategoryWelcome';
import {useAuth} from '@/hooks/useAuth';
import {useSeo} from '@/lib/seo';
export default function CategorySelectionPage(){
 const navigate=useNavigate();
 const {me}=useAuth();
 useSeo({title:'Choose your categories',noindex:true});
 return <CategoryWelcome fullPage edit onClose={()=>navigate('/',{replace:true})}
  openCategory={category=>{
   if(me){try{sessionStorage.setItem('ojasss-category-session:'+me.id,'chosen');}catch{/* Storage may be unavailable. */}}
   navigate(`/?category=${category}`,{replace:true});
  }}/>;
}
