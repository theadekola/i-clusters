import './brand-storage';
export const themePresets=[
 {id:'ocean',name:'Ocean',detail:'Deep blue and cool cyan',accent:'#2563eb',surface:'#0b2035',background:'radial-gradient(ellipse at 80% 0%,#123e62 0,transparent 55%),linear-gradient(145deg,#081522,#06101d)'},
 {id:'midnight-cyan',name:'Midnight Cyan',detail:'Midnight navy with royal blue controls and cyan highlights',accent:'#075bd8',surface:'#09243a',background:'radial-gradient(ellipse at 82% 0%,#0b3552 0,transparent 55%),linear-gradient(145deg,#031426,#061b2e)'},
 {id:'warm',name:'Warm Light',detail:'Ivory surfaces and warm copper accents',accent:'#985127',surface:'#302821',background:'linear-gradient(145deg,#352b23,#1a1613)'},
 {id:'aurora',name:'Aurora',detail:'Northern lights in teal and violet',accent:'#0d9488',surface:'#0b282b',background:'radial-gradient(ellipse at 10% 0%,#174d49 0,transparent 50%),radial-gradient(ellipse at 90% 20%,#382c59 0,transparent 55%),#07181d'},
 {id:'forest',name:'Forest',detail:'Rich evergreen and soft emerald',accent:'#15803d',surface:'#112b21',background:'radial-gradient(ellipse at 80% 0%,#26533a 0,transparent 60%),linear-gradient(150deg,#0e211b,#07130f)'},
 {id:'sunset',name:'Sunset',detail:'Warm amber over a plum horizon',accent:'#c2410c',surface:'#302029',background:'radial-gradient(ellipse at 90% 0%,#633a2c 0,transparent 55%),linear-gradient(140deg,#291a30,#170f20)'},
 {id:'violet',name:'Violet',detail:'Soft indigo and midnight purple',accent:'#7c3aed',surface:'#231d3b',background:'radial-gradient(ellipse at 75% 0%,#453568 0,transparent 60%),linear-gradient(140deg,#1c1730,#100c1e)'},
 {id:'slate',name:'Slate',detail:'Quiet charcoal and silver blue',accent:'#475569',surface:'#202a38',background:'radial-gradient(ellipse at 70% 0%,#354255 0,transparent 60%),linear-gradient(150deg,#19212d,#0c111a)'}
] as const;
export const appearanceDefaults={preset:'ocean',theme:'dark' as 'dark'|'light'|'system',accent:'#2563eb',density:'comfortable',animations:true,accentStyle:'solid',accentIntensity:100,fontFamily:'system',borderRadius:12,background:'gradient',reduceMotion:false,smoothTransitions:true,sectionLabels:true};
export type AppearanceSettings=typeof appearanceDefaults;
const color=/^#[0-9a-f]{6}$/i;
export function normalizeAppearance(value:any):AppearanceSettings{const v=value&&typeof value==='object'?value:{};return {preset:themePresets.some(p=>p.id===v.preset)?v.preset:appearanceDefaults.preset,theme:['light','dark','system'].includes(v.theme)?v.theme:'dark',accent:typeof v.accent==='string'&&color.test(v.accent)?v.accent:appearanceDefaults.accent,density:['compact','comfortable','spacious'].includes(v.density)?v.density:appearanceDefaults.density,animations:typeof v.animations==='boolean'?v.animations:true,accentStyle:v.accentStyle==='gradient'?'gradient':'solid',accentIntensity:typeof v.accentIntensity==='number'&&Number.isFinite(v.accentIntensity)?Math.max(25,Math.min(100,Math.round(v.accentIntensity))):100,fontFamily:['system','arial','monospace'].includes(v.fontFamily)?v.fontFamily:'system',borderRadius:typeof v.borderRadius==='number'&&Number.isFinite(v.borderRadius)?Math.max(0,Math.min(24,Math.round(v.borderRadius))):12,background:v.background==='solid'?'solid':'gradient',reduceMotion:v.reduceMotion===true,smoothTransitions:v.smoothTransitions!==false,sectionLabels:v.sectionLabels!==false};}
export function loadAppearance(){try{return normalizeAppearance(JSON.parse(localStorage.getItem('iclusters_appearance')||'{}'))}catch{return {...appearanceDefaults}}}
function channels(hex:string){
 return [1,3,5].map(start=>parseInt(hex.slice(start,start+2),16));
}
function luminance(hex:string){
 const [r,g,b]=channels(hex).map(value=>value/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);
 return .2126*r+.7152*g+.0722*b;
}
function mixColour(start:string,end:string,amount:number){
 const target=channels(end);
 return '#'+channels(start).map((value,i)=>Math.round(value+(target[i]-value)*amount).toString(16).padStart(2,'0')).join('');
}
export function accentText(accent:string){
 if(!color.test(accent))return '#ffffff';
 const value=luminance(accent);
 if(1.05/(value+.05)>=4.5)return '#ffffff';
 return (value+.05)/(luminance('#07111e')+.05)>=4.5?'#07111e':'#000000';
}
// Keep the selected hue for links and icons, darkening it only when a light surface needs more contrast.
function lightAccent(accent:string){
 let ink=accent;
 while(luminance(ink)>.105)ink=mixColour(ink,'#000000',.07);
 return ink;
}
export function appearanceVariables(value:AppearanceSettings){
 const a=normalizeAppearance(value);
 const fill=mixColour('#172536',a.accent,a.accentIntensity/100);
 const text=accentText(fill);
 const midnight=a.preset==='midnight-cyan'&&a.accent==='#075bd8';
 return {
  '--app-accent':a.accent,'--app-accent-fill':fill,'--app-accent-text':text,
  '--app-accent-gradient-end':mixColour(fill,text==='#ffffff'?'#000000':'#ffffff',.13),
  '--app-light-accent':midnight?'#00677d':lightAccent(a.accent),
  '--app-dark-accent':midnight?'#39d8f3':mixColour(a.accent,'#ffffff',.52),
  '--app-accent-intensity':`${a.accentIntensity}%`,'--app-radius':`${a.borderRadius}px`,
  '--app-font-family':a.fontFamily==='arial'?'Arial, sans-serif':a.fontFamily==='monospace'?'ui-monospace, SFMono-Regular, Consolas, monospace':'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
 };
}
export function resolvedTheme(theme:AppearanceSettings['theme']){return theme==='system'?(window.matchMedia?.('(prefers-color-scheme: dark)').matches?'dark':'light'):theme;}
export function watchSystemTheme(){const media=window.matchMedia?.('(prefers-color-scheme: dark)'),changed=()=>{if(loadAppearance().theme==='system')applyAppearance();};media?.addEventListener?.('change',changed);return ()=>media?.removeEventListener?.('change',changed);}
export function applyAppearance(){const a=loadAppearance(),root=document.documentElement;for(const [key,value] of Object.entries(appearanceVariables(a)))root.style.setProperty(key,value);const preset=themePresets.find(p=>p.id===a.preset)!;root.dataset.preset=a.preset;root.style.setProperty('--app-theme-background',preset.background);root.style.setProperty('--app-theme-surface',preset.surface);root.dataset.theme=resolvedTheme(a.theme);root.style.colorScheme=root.dataset.theme;root.dataset.density=a.density;root.dataset.animations=a.animations&&!a.reduceMotion?'on':'off';root.dataset.transitions=a.smoothTransitions?'on':'off';root.dataset.accentStyle=a.accentStyle;root.dataset.background=a.background;root.dataset.sectionLabels=a.sectionLabels?'on':'off';root.dataset.appearance='custom';}
export function saveAppearance(value:AppearanceSettings){if(typeof value.accent!=='string'||!color.test(value.accent))throw Error('Enter a colour in #RRGGBB format.');const normalized=normalizeAppearance(value);localStorage.setItem('iclusters_appearance',JSON.stringify(normalized));applyAppearance();window.dispatchEvent(new Event('iclusters-appearance'));}
// Older builds automatically wrote "expanded" even when nobody chose it.
export function loadSidebarDisplay(){return localStorage.getItem('iclusters_sidebar')==='open'?'expanded':'collapsed'}
export function saveAppearanceWithSidebar(value:AppearanceSettings,sidebar:string){
 if(typeof value.accent!=='string'||!color.test(value.accent))throw Error('Enter a colour in #RRGGBB format.');if(!['expanded','collapsed'].includes(sidebar))throw Error('Choose a supported sidebar display.');
 const entries=[['iclusters_sidebar',sidebar==='expanded'?'open':'collapsed'],['iclusters_appearance',JSON.stringify(normalizeAppearance(value))]],previous=entries.map(([key])=>[key,localStorage.getItem(key)]);
 try{for(const [key,next] of entries)localStorage.setItem(key,next);}catch(error){for(const [key,old] of previous)try{old===null?localStorage.removeItem(key!):localStorage.setItem(key!,old!)}catch{}throw error;}
 applyAppearance();window.dispatchEvent(new Event('iclusters-appearance'));window.dispatchEvent(new Event('iclusters-sidebar'));
}
