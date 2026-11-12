import {clusterBase} from './cluster-context';
export function dashboardLink(input:string){
 try{const url=new URL(input);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname))return '';return url.origin+clusterBase+'/'}catch{return ''}
}
