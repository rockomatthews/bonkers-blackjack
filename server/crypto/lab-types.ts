import type {Address,Hex} from 'viem';
export type LabConfig={chainId:31337;rulesVersion?:1|2;rpc:string;game:Address;vault:Address;token:Address;operator:Address;player:Address;startBlock:string;forkBlock:string;createdAt:string};
export type LabReceipt={id:Hex;commitment:Hex;entropy:Hex;seed:Hex;stakes:string[];actions:{seat:number;move:number}[];observations:Hex[];payouts:string[];settlementHash:Hex};
