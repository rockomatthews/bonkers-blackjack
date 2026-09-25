export type IntentStatus='quoted'|'awaiting'|'detected'|'confirming'|'converting'|'settling'|'available'|'owner_authorized'|'submitted'|'completed'|'expired'|'refund_pending'|'refunded'|'review'|'failed';
export type IntentKind='deposit'|'withdrawal';
const transitions:Partial<Record<IntentStatus,IntentStatus[]>>={
 quoted:['awaiting','owner_authorized','expired','failed'],awaiting:['detected','expired','review'],detected:['confirming','refund_pending','review'],
 confirming:['converting','settling','completed','review','refund_pending'],converting:['settling','refund_pending','review'],settling:['available','review'],
 owner_authorized:['submitted','expired','failed'],submitted:['confirming','review'],expired:['detected','refund_pending','review'],
 refund_pending:['refunded','review'],review:['confirming','converting','settling','refund_pending','failed'],
};
export function transition(from:IntentStatus,to:IntentStatus){
 if(from===to)return;
 if(!transitions[from]?.includes(to))throw Error(`Illegal intent transition ${from} → ${to}`);
}
export type DepositEvidence={chainId:number;token:string;recipient:string;amount:string;transactionHash:string;logIndex:number;blockHash:string;blockNumber:string};
