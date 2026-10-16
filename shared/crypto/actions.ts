import {formatUSDC} from './money';
import type {CryptoState} from './replay';
export function actionOptions(state:CryptoState|undefined,stake:bigint):[number,string][]{
 return state?.insurance?[[5,`Insurance $${formatUSDC(stake/2n).replace(/(\.\d{2})0+$/, '$1')}`],[6,'No insurance']]:[[1,'Hit'],[2,'Stand'],[3,'Double'],[4,'Split'],[7,'Surrender']];
}
