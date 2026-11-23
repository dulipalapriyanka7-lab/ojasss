export function orderedItems<T extends {value:string}>(items: readonly T[], order?: readonly string[]): T[] {
 const positions=new Map((order??[]).map((v,i)=>[v,i]));
 return [...items].sort((a,b)=>(positions.get(a.value)??1000+items.indexOf(a))-(positions.get(b.value)??1000+items.indexOf(b)));
}
export const ACTIONS=[{value:'hearts',label:'Fires'},{value:'speak',label:'Speak · Free'},{value:'viral',label:'Viral · Power'},{value:'comments',label:'Comments'},{value:'save',label:'Save'},{value:'share',label:'Share'},{value:'more',label:'More options'}];
