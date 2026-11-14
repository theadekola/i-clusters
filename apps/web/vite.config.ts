import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
import {localizeSource} from './scripts/i18n-source.mjs';

export default defineConfig({
 resolve:{alias:{'@iclusters/i18n':fileURLToPath(new URL('./src/i18n',import.meta.url))}},
 optimizeDeps:{exclude:['@iclusters/i18n/jsx-runtime','@iclusters/i18n/jsx-dev-runtime']},
 plugins:[{name:'serve-icons-on-demand',apply:'build',enforce:'pre',transform(code,id){
  if(!id.endsWith('/bundled-icon-images.ts'))return;
  return code.replace(/"([a-z0-9]+)":"data:image\/png;base64,([A-Za-z0-9+/=]+)"/g,(_match,key,png)=>{
   const ref=this.emitFile({type:'asset',name:key+'.png',source:Buffer.from(png,'base64')});
   return JSON.stringify(key)+':import.meta.ROLLUP_FILE_URL_'+ref;
  });
 }},{name:'protect-resource-copy',enforce:'pre',transform:localizeSource,
  // Keep the JSX runtime and application on the same live locale store.
  configResolved(config){config.optimizeDeps.include=(config.optimizeDeps.include||[]).filter(id=>!id.startsWith('@iclusters/i18n/'))}
 },react({jsxImportSource:'@iclusters/i18n'})],
 build:{rollupOptions:{output:{manualChunks(id){if(id.endsWith('/bundled-icon-images.ts'))return 'system-icons';}}}},
 server:{proxy:{'/api':{target:process.env.ICLUSTERS_DEV_API_URL||process.env.HOMECLOUD_DEV_API_URL||'http://127.0.0.1:6000',changeOrigin:true}}}
});
