import React, {createContext,useContext,useEffect,useState} from 'react';
import {NavLink,Navigate,Outlet,useLocation,useNavigate} from 'react-router-dom';
import {Menu,LogOut,X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {api,errMsg} from '@/lib/api';
import {Notice} from './SharedUI';
const Ctx=createContext(null);
export const useAdmin=()=>useContext(Ctx);
export const ROLE_HOME={admin:'/admin',telecaller:'/admin/queries',billing_executive:'/admin/rates'};
const nav=[['','Overview',['admin']],['users','Customers',['admin']],['staff','Staff directory',['admin']],['queries','Pending Queries',['admin','telecaller','billing_executive']],['leads','Lead CRM',['admin','telecaller']],['winback','Win-back & Churn',['admin','telecaller']],['rates','Rates & Slabs',['admin','billing_executive']],['products','Collections',['admin']],['catalog-author','Catalog authoring',['admin']],['pdf-import','Reviewed PDF import',['admin']],['batches','Batches',['admin']],['banners','Banners',['admin']],['rewards','Rewards & Billing',['admin','billing_executive']],['content','App content',['admin']],['media','Media usage',['admin']],['settings','Settings & Privacy',['admin']]];
export const roleCanOpen=(role,path)=>role==='admin'||nav.some(([p,,roles])=>roles.includes(role)&&path===`/admin/${p}`);
export default function AdminLayout(){
  const [me,setMe]=useState(null),[error,setError]=useState(''),[open,setOpen]=useState(false);const navigate=useNavigate(),location=useLocation();
  const refreshMe=async()=>{try{const r=await api.get('/admin/auth/me');setMe(r.data);setError('');return r.data;}catch(e){if([401,403].includes(e.response?.status)){setMe(null);navigate('/admin/login',{replace:true});}else setError(errMsg(e));}};
  useEffect(()=>{refreshMe();setOpen(false);},[location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{const end=()=>{setMe(null);navigate('/admin/login',{replace:true});};window.addEventListener('yash-session-ended',end);return()=>window.removeEventListener('yash-session-ended',end);},[navigate]);
  const logout=async()=>{try{await api.post('/admin/auth/logout');navigate('/admin/login',{replace:true});}catch(e){setError('Local sign-out requested; canonical revocation was not confirmed. '+errMsg(e));setMe(null);}};
  if(!me)return <main className="p-8"><Notice>{error}</Notice><p data-testid="session-loading">{error?'Canonical session unavailable.':'Checking your canonical session…'}</p><Button data-testid="session-return-login" onClick={()=>navigate('/admin/login')}>Staff login</Button></main>;
  if(location.pathname==='/admin'&&me.role!=='admin')return <Navigate replace to={ROLE_HOME[me.role]}/>;
  return <Ctx.Provider value={{me,refreshMe}}><div className="admin-scope console-shell">
    {open&&<button className="nav-scrim" aria-label="Close navigation" onClick={()=>setOpen(false)} data-testid="nav-scrim"/>}
    <aside className={`console-sidebar ${open?'is-open':''}`}><div className="flex items-center gap-3 p-5 border-b"><img src="/brand/yash-mark-hd.png" alt="Yash Ornaments" className="w-11 h-11"/><strong className="font-heading">Yash Ornaments</strong><Button size="icon" variant="ghost" className="lg:hidden" onClick={()=>setOpen(false)} data-testid="nav-close"><X size={18}/></Button></div>
      <nav className="p-3 space-y-1">{nav.filter(n=>n[2].includes(me.role)).map(([p,title])=><NavLink key={p} end to={`/admin${p?'/'+p:''}`} data-testid={`nav-${p||'overview'}`} className={({isActive})=>`console-nav ${isActive?'active':''}`}>{title}</NavLink>)}</nav>
    </aside><div className="console-body"><header className="console-header"><Button className="lg:hidden" variant="ghost" size="icon" onClick={()=>setOpen(true)} data-testid="admin-mobile-menu-button"><Menu size={20}/></Button><div><strong data-testid="canonical-staff-name">{me.name||'Staff'}</strong><p className="text-xs capitalize" data-testid="admin-role-badge">{me.role.replace('_',' ')}</p></div><Button variant="outline" onClick={logout} data-testid="admin-logout-button"><LogOut size={16}/>Sign out</Button></header>
    <main className="console-content"><Notice>{error}</Notice>{roleCanOpen(me.role,location.pathname)?<Outlet/>:<Notice id="admin-route-forbidden">This operation is not permitted for your current role.</Notice>}</main></div>
  </div></Ctx.Provider>;
}