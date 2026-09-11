import React,{useRef} from 'react';
import {PrivateImage} from './PrivateImage';
import {Button} from '@/components/ui/button';

export const SquareCrop=({path,geometry,value,onChange,bounds})=>{
 const ref=useRef(null),drag=useRef(null);if(!geometry||!value)return null;
 const width=geometry.width_points,height=geometry.height_points,region=bounds||[0,0,width,height];
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const adjust=(start,dx,dy,resize)=>{let [x,y,x1,y1]=start,size=x1-x;if(resize)size=clamp(size+Math.max(dx,dy),12,Math.min(region[2]-x,region[3]-y));else{x=clamp(x+dx,region[0],region[2]-size);y=clamp(y+dy,region[1],region[3]-size);}onChange([x,y,x+size,y+size]);};
 const down=(e,resize=false)=>{e.preventDefault();e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);drag.current={x:e.clientX,y:e.clientY,start:[...value],scale:width/ref.current.getBoundingClientRect().width,resize};};
 const move=e=>{const d=drag.current;if(d)adjust(d.start,(e.clientX-d.x)*d.scale,(e.clientY-d.y)*d.scale,d.resize);};
 const up=()=>{drag.current=null;};
 return <div className="space-y-3"><p className="text-sm" data-testid="crop-coordinate-space">Square photograph · unrotated PDF coordinates · rotation {geometry.rotation}°</p>
 <div ref={ref} style={{position:'relative',width:'100%',maxWidth:680,aspectRatio:`${width}/${height}`,userSelect:'none'}} data-testid="crop-page">
   <PrivateImage src={path} id="crop-source-image" className="source-page"/>
   <div role="slider" tabIndex={0} aria-label="Move crop" aria-valuetext="Square crop inside photo region" className="crop-square" data-testid="crop-move" onPointerDown={e=>down(e)} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();adjust(value,e.key==='ArrowLeft'?-1:e.key==='ArrowRight'?1:0,e.key==='ArrowUp'?-1:e.key==='ArrowDown'?1:0,false);}}} style={{left:`${value[0]/width*100}%`,top:`${value[1]/height*100}%`,width:`${(value[2]-value[0])/width*100}%`,height:`${(value[3]-value[1])/height*100}%`}}>
    <button type="button" aria-label="Resize square crop" className="crop-handle" data-testid="crop-resize" onPointerDown={e=>down(e,true)} onPointerMove={move} onPointerUp={up} onPointerCancel={up}/>
   </div>
 </div><div className="flex gap-2"><Button variant="outline" data-testid="crop-shrink" onClick={()=>adjust(value,-4,-4,true)}>Smaller crop</Button><Button variant="outline" data-testid="crop-grow" onClick={()=>adjust(value,4,4,true)}>Larger crop</Button></div></div>;
};