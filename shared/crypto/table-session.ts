import {encodeAbiParameters,hashTypedData,keccak256,type Address,type Hex} from 'viem';
import {initial,shuffle,step,observation,payouts,type CryptoState} from './replay';
export type TableOffer={tableId:Hex;nonce:string;validUntil:string;seats:number[];stakes:string[];commitments:Hex[];signature:Hex};
export type TableProof={seed:Hex;moves:number[];observations:Hex[];signatures:Hex[];acknowledgements:Hex[]};
export type TableHand={seat:number;stake:string;state:CryptoState;observation:Hex;viewSignature:Hex;proof?:TableProof;moves:number[];signatures:Hex[];acknowledgements:Hex[];observations:Hex[]};
export type FastSnapshot={id:Hex;owner:Address;key:Address;balance:string;collateral:string;limit:string;expires:number;nonce:string;closed:boolean;lastActivity:number;offer?:TableOffer;entropy?:Hex;betSignature?:Hex;hands:TableHand[];settled:boolean;settlementHash?:Hex;error?:string;closeAt?:number;disputeAt?:number};
export const tableDomain=(game:Address)=>({name:'BonkersTable',version:'1',chainId:8453,verifyingContract:game} as const);
export const tableTypes={
 TableOffer:[{name:'tableId',type:'bytes32'},{name:'nonce',type:'uint64'},{name:'validUntil',type:'uint64'},{name:'layoutHash',type:'bytes32'},{name:'commitmentsHash',type:'bytes32'}],
 TableBet:[{name:'offerHash',type:'bytes32'},{name:'entropy',type:'bytes32'}],
 TableAction:[{name:'betHash',type:'bytes32'},{name:'seat',type:'uint8'},{name:'index',type:'uint32'},{name:'move',type:'uint8'},{name:'observation',type:'bytes32'}],
 TableAcknowledgement:[{name:'actionDigest',type:'bytes32'}],
 TableView:[{name:'betHash',type:'bytes32'},{name:'seat',type:'uint8'},{name:'count',type:'uint32'},{name:'observation',type:'bytes32'}],
 TableClose:[{name:'tableId',type:'bytes32'},{name:'nonce',type:'uint64'}],
} as const;
export function offerMessage(o:TableOffer){return{tableId:o.tableId,nonce:BigInt(o.nonce),validUntil:BigInt(o.validUntil),layoutHash:keccak256(encodeAbiParameters([{type:'uint8[]'},{type:'uint128[]'}],[o.seats,o.stakes.map(BigInt)])),commitmentsHash:keccak256(encodeAbiParameters([{type:'bytes32[]'}],[o.commitments]))};}
export function typedOffer(game:Address,o:TableOffer){return{domain:tableDomain(game),types:tableTypes,primaryType:'TableOffer',message:offerMessage(o)} as const;}
export function typedBet(game:Address,o:TableOffer,entropy:Hex){return{domain:tableDomain(game),types:tableTypes,primaryType:'TableBet',message:{offerHash:hashTypedData(typedOffer(game,o)),entropy}} as const;}
export function typedAction(game:Address,bet:Hex,seat:number,index:number,move:number,snapshot:Hex){return{domain:tableDomain(game),types:tableTypes,primaryType:'TableAction',message:{betHash:bet,seat,index,move,observation:keccak256(snapshot)}} as const;}
export function typedAck(game:Address,action:Hex){return{domain:tableDomain(game),types:tableTypes,primaryType:'TableAcknowledgement',message:{actionDigest:action}} as const;}
export function typedView(game:Address,bet:Hex,h:Pick<TableHand,'seat'|'moves'|'observation'>){return{domain:tableDomain(game),types:tableTypes,primaryType:'TableView',message:{betHash:bet,seat:h.seat,count:h.moves.length,observation:keccak256(h.observation)}} as const;}
export function typedClose(game:Address,id:Hex,nonce:string){return{domain:tableDomain(game),types:tableTypes,primaryType:'TableClose',message:{tableId:id,nonce:BigInt(nonce)}} as const;}
export function tableEntropy(id:Hex,nonce:string,seat:number,entropy:Hex){return keccak256(encodeAbiParameters([{type:'bytes32'},{type:'uint64'},{type:'uint8'},{type:'bytes32'}],[id,BigInt(nonce),seat,entropy]));}
export const onchainOffer=(o:TableOffer)=>({...o,nonce:BigInt(o.nonce),validUntil:BigInt(o.validUntil),stakes:o.stakes.map(BigInt)});
/** Final seeds are checked locally before a browser accepts any result or balance change. */
export function verifyTableProof(o:TableOffer,entropy:Hex,seat:number,p:TableProof){
 const at=o.seats.indexOf(seat);if(at<0||keccak256(encodeAbiParameters([{type:'bytes32'}],[p.seed]))!==o.commitments[at])throw Error('Table seed mismatch');
 if(p.moves.length>128||p.observations.length!==p.moves.length+1||p.signatures.length!==p.moves.length||p.acknowledgements.length!==p.moves.length)throw Error('Table proof bounds');
 const stake=BigInt(o.stakes[at]),deck=shuffle(p.seed,tableEntropy(o.tableId,o.nonce,seat,entropy)),state=initial(deck,1);let spent=stake;
 for(let i=0;i<p.moves.length;i++){if(keccak256(observation(state))!==p.observations[i])throw Error('Table observation mismatch');spent+=stake*BigInt(step(state,deck,{seat:0,move:p.moves[i]}))/2n;}
 if(keccak256(observation(state))!==p.observations.at(-1))throw Error('Table final observation mismatch');return{spent,payout:payouts(state,[stake])[0],state};
}
