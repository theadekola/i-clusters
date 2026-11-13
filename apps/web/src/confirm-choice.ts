/** Standalone component mounts without the dialog presenter retain the browser prompt. */
export function confirmChoice(message:string):Promise<boolean>{
 return new Promise(resolve=>{
  const event=new CustomEvent('iclusters-confirm-choice',{cancelable:true,detail:{message,resolve}});
  if(window.dispatchEvent(event))resolve(window.confirm(message));
 });
}
