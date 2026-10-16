import {cardLabel,suit} from '../shared/game';
export default function LiveCard({value}:{value:number}){
 const hidden=value<0,symbol=hidden?'':suit(value),red=symbol==='♥'||symbol==='♦';
 return <span className={`live-card${hidden?' live-card-back':''}${red?' live-card-red':''}`} aria-label={hidden?'Hidden card':`${cardLabel(value)} ${symbol}`}><small>{hidden?'':cardLabel(value)}</small><b>{hidden?'♠':symbol}</b><small>{hidden?'':cardLabel(value)}</small></span>;
}
