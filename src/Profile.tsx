"use client";
import { useEffect, useState, type ChangeEvent } from 'react';
import { AVATARS, nameError, nameKey, type PublicProfile } from '../shared/profiles';
import type { Account } from './types';

export function Avatar({ profile }: { profile: Pick<PublicProfile, 'avatar' | 'avatarId'> }) {
  const preset = AVATARS.find(a => a.id === profile.avatar) ?? AVATARS[0];
  return <span className="avatar-art" style={{background:preset.color}}>
    {profile.avatarId ? <img src={'/api/v1/avatars/' + profile.avatarId} alt="" width={160} height={160} /> : <span aria-hidden="true">{preset.emoji}</span>}
  </span>;
}

type Props = {
  account: Account | null; profileId: string; busy: boolean;
  api: (path: string, body?: unknown) => Promise<any>;
  command: (kind:string, payload?:Record<string,unknown>) => Promise<any>;
  onJoin: () => void;
};
export function ProfilePage({account, profileId, busy, api, command, onJoin}:Props) {
  const own = !profileId || profileId === account?.id;
  const [visitor, setVisitor] = useState<PublicProfile | null>(null);
  const [loadError, setLoadError] = useState('');
  const [name, setName] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [availability, setAvailability] = useState<{available:boolean;reason:string}|null>(null);
  const [image, setImage] = useState('');
  const [imageError, setImageError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [feedback, setFeedback] = useState('');
  useEffect(() => {
    let ignore=false; setVisitor(null); setLoadError('');
    if (!own) api('profiles/' + encodeURIComponent(profileId)).then(p=>{if(!ignore)setVisitor(p);}).catch(e=>{if(!ignore)setLoadError(e.message);});
    return ()=>{ignore=true;};
  }, [profileId,own,api]);
  useEffect(() => {
    setAvailability(null);
    if (!own || !account || account.nameChanged || !name) return;
    const reason=nameError(name);
    if(reason){setAvailability({available:false,reason});return;}
    if(nameKey(name)===nameKey(account.name)){setAvailability({available:false,reason:'Choose a different name for your one change.'});return;}
    let ignore=false;
    const timer=setTimeout(()=>api('profile-name?name='+encodeURIComponent(name)).then(result=>{if(!ignore)setAvailability(result);}).catch(()=>{if(!ignore)setAvailability({available:false,reason:'Could not check availability. Try again.'});}),350);
    return ()=>{ignore=true;clearTimeout(timer);};
  },[name,own,account?.id,account?.name,account?.nameChanged,api]);
  async function chooseImage(event:ChangeEvent<HTMLInputElement>) {
    const file=event.target.files?.[0]; event.target.value='';
    if(!file)return;
    setImageError(''); setImage(''); setFeedback('');
    if(!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size>5*1024*1024){setImageError('Choose a PNG, JPEG or WebP under 5 MB.');return;}
    setProcessing(true);
    try {
      const bitmap=await createImageBitmap(file);
      if(bitmap.width*bitmap.height>25_000_000){bitmap.close();throw Error('That image is too large. Choose one under 25 megapixels.');}
      const canvas=document.createElement('canvas');canvas.width=160;canvas.height=160;
      const ctx=canvas.getContext('2d');if(!ctx){bitmap.close();throw Error('This browser cannot prepare an image.');}
      const size=Math.min(bitmap.width,bitmap.height);
      ctx.drawImage(bitmap,(bitmap.width-size)/2,(bitmap.height-size)/2,size,size,0,0,160,160);bitmap.close();
      const prepared=canvas.toDataURL('image/webp',0.75);
      if(prepared.length>28000 || !prepared.startsWith('data:image/webp;'))throw Error('Try a simpler image or another browser.');
      setImage(prepared);
    } catch(e){setImageError(e instanceof Error ? e.message : 'Could not read that image.');}
    finally {setProcessing(false);}
  }
  const profile=own?account:visitor;
  if(!profile)return <section className="section reading"><h1>{own?'Make yourself at home.':loadError?'Profile unavailable.':'Finding your table mate…'}</h1><p>{loadError || 'Your personality deserves a seat at the table.'}</p>{own&&<button className="button primary" onClick={onJoin}>Join the club</button>}</section>;
  return <section className="section profile-page">
    <a className="text-link" href="#lobby">← Back to the tables</a>
    <div className="profile-banner"><span>PLAYER DOSSIER / BONKERS BLACKJACK</span><b>GOOD CARDS.<br/>QUESTIONABLE COMPANY.</b></div>
    <div className="profile-identity">
      <div className="profile-portrait"><Avatar profile={profile}/></div>
      <div><span className="eyebrow">{own?'YOUR SEAT IN THE UNIVERSE':'MEET YOUR TABLE MATE'}</span><h1>{profile.name}</h1><p>{profile.nameChanged?'One name. All yours.':'A little mystery. A lot of personality.'}</p></div>
      <span className="profile-badge">PLAY-MONEY CLUB</span>
    </div>
    {own && account && <div className="profile-edit-grid">
      <div className="panel name-panel"><span className="eyebrow">MAKE A NAME FOR YOURSELF</span><h2>{account.nameChanged?'Your name is locked in.':'One change. Make it Bonkers.'}</h2>
        {account.nameChanged ? <><p className="locked-name">{account.name}</p><p>You’ve used your one name change. Your profile image can still change whenever you like.</p></> : <form onSubmit={async e=>{e.preventDefault();if(!accepted||!availability?.available)return;const result=await command('claim-name',{name});if(result){setAccepted(false);setFeedback('Name locked in. Welcome to your new identity.');}}}>
          <p>Your starter name is yours until you choose another. Once saved, your new username is permanent.</p>
          <label>Choose your username<input value={name} onChange={e=>{setName(e.target.value);setAccepted(false);setAvailability(null);}} maxLength={48} autoComplete="off" spellCheck={false} placeholder="Cosmic Goblin" aria-describedby="name-availability" disabled={busy}/></label>
          <p id="name-availability" className={availability?.available?'name-available':'muted'} aria-live="polite">{name?(availability?.reason ?? 'Checking availability…'):'3–24 characters. Names are unique regardless of capitalization.'}</p>
          <label className="checkbox"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)} disabled={busy}/><span>I understand I can only change my username once.</span></label>
          <button className="button primary" disabled={busy||!accepted||!availability?.available}>Claim username permanently</button>
        </form>}
      </div>
      <div className="panel avatar-panel"><span className="eyebrow">PICK YOUR ALTER EGO</span><h2>A face for the table.</h2><p>Choose a character or upload your own image. This part can change as often as you like.</p>
        <div className="avatar-picker">{AVATARS.map(a=><button key={a.id} aria-label={'Use '+a.label+' avatar'} aria-pressed={!account.avatarId&&account.avatar===a.id} title={a.label} disabled={busy||processing} onClick={async()=>{const result=await command('set-avatar',{avatar:a.id});if(result){setImage('');setFeedback('Avatar updated.');}}}><Avatar profile={{avatar:a.id,avatarId:null}}/><small>{a.label}</small></button>)}</div>
        <label className="upload-label">Upload profile image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseImage} disabled={busy||processing}/></label><p className="muted">PNG, JPEG or WebP · up to 5 MB · cropped to a square. Profile names and images are public.</p>
        {processing&&<p role="status">Preparing your image…</p>}
        {image&&<div className="avatar-preview"><img src={image} alt="New profile image preview" width={100} height={100}/><button className="button secondary" disabled={busy} onClick={async()=>{const result=await command('upload-avatar',{image});if(result){setImage('');setFeedback('Profile image saved.');}}}>Save profile image</button></div>}
        {imageError&&<p role="alert">{imageError}</p>}
      </div>
    </div>}
    {feedback&&<p className="profile-feedback" role="status">{feedback}</p>}
    <div className="profile-links"><a href="#lobby" className="button secondary">Find a table</a>{own&&<a href="#account" className="text-link">Account & play-money balance →</a>}<button className="text-link" onClick={async()=>{const url=new URL(location.href);url.hash='profile/'+profile.id;try{await navigator.clipboard.writeText(url.toString());setFeedback('Profile link copied.');}catch{setFeedback(url.toString());}}}>Copy profile link</button></div>
  </section>;
}
