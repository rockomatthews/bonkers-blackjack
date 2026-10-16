import * as THREE from 'three';
export type CoinFace='heads'|'tails';
export async function createCoinScene(host:HTMLElement,face:CoinFace,spinning:boolean){
 const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});
 renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.domElement.setAttribute('aria-hidden','true');host.appendChild(renderer.domElement);
 const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1.4,1.4,1.4,-1.4,.1,20);camera.position.z=5;
 const coin=new THREE.Group();scene.add(coin);
 scene.add(new THREE.HemisphereLight(0xffffff,0xaebfd7,2.4));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(-3,4,5);scene.add(light);
 const white=new THREE.MeshStandardMaterial({color:0xffffff,metalness:.1,roughness:.36});
 const edgeGeometry=new THREE.CylinderGeometry(1.025,1.025,.16,128);edgeGeometry.rotateX(Math.PI/2);coin.add(new THREE.Mesh(edgeGeometry,white));
 const rimGeometry=new THREE.TorusGeometry(1.006,.019,12,128);for(const z of [-.08,.08]){const rim=new THREE.Mesh(rimGeometry,white);rim.position.z=z;coin.add(rim);}
 const faceGeometry=new THREE.CircleGeometry(.995,128);
 const textures:THREE.Texture[]=[],materials:THREE.Material[]=[white];let disposed=false,frame=0,visible=true,current=face==='heads'?-.35:Math.PI-.35,target=current,turnStart=current,started=0,last=0;
 const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
 let motion=spinning,side=face,settling=false;
 function draw(time:number){
  frame=0;if(disposed||!visible||document.hidden)return;
  const delta=Math.min((time-last)/1000,.05);last=time;
  if(reduceMotion.matches){current=side==='heads'?-.35:Math.PI-.35;settling=false;coin.position.y=0;}
  else if(motion){current+=delta*13;coin.position.y=Math.sin(time*.005)*.12;}
  else if(settling){const t=Math.min((time-started)/850,1),ease=1-Math.pow(1-t,3);current=turnStart+(target-turnStart)*ease;coin.position.y*=1-ease;settling=t<1;}
  else coin.position.y=0;
  coin.rotation.set(-.12,current,-.08);renderer.render(scene,camera);host.dataset.settled=!motion&&!settling?side:'';
  if((motion&&!reduceMotion.matches)||settling)frame=requestAnimationFrame(draw);
 }
 function schedule(){if(!disposed&&!frame){last=performance.now();frame=requestAnimationFrame(draw);}}
 function update(nextFace:CoinFace,nextSpinning:boolean){
  const changed=side!==nextFace||motion!==nextSpinning;side=nextFace;motion=nextSpinning;
  if(changed&&!motion){const base=side==='heads'?-.35:Math.PI-.35;turnStart=current;target=base+Math.round((current-base)/(2*Math.PI))*2*Math.PI;if(spinning&&target<current)target+=2*Math.PI;started=performance.now();settling=!reduceMotion.matches;if(!settling)current=target;}
  spinning=nextSpinning;schedule();
 }
 const resize=new ResizeObserver(()=>{const {width,height}=host.getBoundingClientRect();if(width&&height){renderer.setSize(width,height,false);const aspect=width/height;camera.left=-1.4*aspect;camera.right=1.4*aspect;camera.updateProjectionMatrix();schedule();}});resize.observe(host);
 const intersection=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;if(visible)schedule();else{cancelAnimationFrame(frame);frame=0;}});intersection.observe(host);
 const visibility=()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;}else schedule();};document.addEventListener('visibilitychange',visibility);reduceMotion.addEventListener('change',schedule);
 const lost=(event:Event)=>{event.preventDefault();visible=false;cancelAnimationFrame(frame);frame=0;host.dispatchEvent(new Event('coin-context-lost'));};renderer.domElement.addEventListener('webglcontextlost',lost);
 function dispose(){disposed=true;cancelAnimationFrame(frame);resize.disconnect();intersection.disconnect();document.removeEventListener('visibilitychange',visibility);reduceMotion.removeEventListener('change',schedule);renderer.domElement.removeEventListener('webglcontextlost',lost);edgeGeometry.dispose();rimGeometry.dispose();faceGeometry.dispose();textures.forEach(v=>v.dispose());materials.forEach(v=>v.dispose());renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();}
 try{
  const loader=new THREE.TextureLoader();const loaded=await Promise.allSettled(['/coins/heads-red.png','/coins/tails-blue.png'].map(url=>loader.loadAsync(url)));
  for(const result of loaded)if(result.status==='fulfilled')textures.push(result.value);
  if(loaded.some(v=>v.status==='rejected'))throw Error('Coin artwork unavailable');
  for(let n=0;n<textures.length;n++){const texture=textures[n];texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
   // Sample the circular artwork inside the source PNG's square margin; leave the originals unchanged.
   texture.repeat.set(.95,.95);texture.offset.set(.025,.025);
   const material=new THREE.MeshBasicMaterial({map:texture});materials.push(material);const cap=new THREE.Mesh(faceGeometry,material);cap.position.z=n===0?.081:-.081;if(n===1)cap.rotation.y=Math.PI;coin.add(cap);
  }
  schedule();return{update,dispose};
 }catch(error){dispose();throw error;}
}
