import React,{useEffect,useRef,useState} from 'react';
import {api} from '@/lib/api';
export function canonicalMediaPath(src){
  if(!src)return null;
  if(src.startsWith('/api/files/'))return src.slice(4);
  if(src.startsWith('yash-trade/'))return '/files/'+src;
  if(src.startsWith('/pdf-upload/'))return src;
  return null;
}
export const PrivateImage=({src,alt='',id='private-photo',className=''})=>{
  const [url,setUrl]=useState(''),[error,setError]=useState(false),[visible,setVisible]=useState(false);const node=useRef(null);
  useEffect(()=>{const o=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))setVisible(true);},{rootMargin:'100px'});if(node.current)o.observe(node.current);return()=>o.disconnect();},[]);
  useEffect(()=>{if(!visible)return;let objectUrl;const controller=new AbortController();setUrl('');setError(false);const p=canonicalMediaPath(src);
    if(p){api.get('/bff'+p,{responseType:'blob',signal:controller.signal}).then(r=>{objectUrl=URL.createObjectURL(r.data);setUrl(objectUrl);}).catch(e=>{if(e.code!=='ERR_CANCELED')setError(true);});}
    else {try{const u=new URL(src);if(u.protocol==='https:'&&!u.username&&!u.password)setUrl(src);else setError(true);}catch{setError(true);}}
    return()=>{controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);};
  },[src,visible]);
  return <div ref={node} className={`photo-box ${className}`} data-testid={id}>{url?<img src={url} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={()=>setError(true)}/>:<span className="text-xs p-3 block">{error?'Photo unavailable':'Loading photo…'}</span>}</div>;
};