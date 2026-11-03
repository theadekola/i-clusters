import {Component,type ReactNode} from 'react';
// Old open tabs can request chunks removed by a deployment. Offer recovery instead
// of a blank screen, without automatically reloading forms or replaying writes.
export default class PageBoundary extends Component<{children:ReactNode},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true}}
 render(){
  if(!this.state.failed)return this.props.children;
  return <section className="card" role="alert"><h1>This page could not load</h1><p>A software update, interrupted download or page error may have caused this. Reload to get the current version. Any unsaved form changes may be lost; submitted operations are not automatically retried.</p><button className="btn primary" onClick={()=>window.location.reload()}>Reload page</button> <a href="/connection-check.html" target="_blank" rel="noopener">Connection diagnostics</a></section>;
 }
}
