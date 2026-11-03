// Long authenticated file transfers must not lengthen ordinary JSON body reads.
export function requestBodyDeadline(req,res,next){
 if(!req.headers['content-length']&&!req.headers['transfer-encoding'])return next();
 const upload=req.method==='PUT'&&/^\/api\/proxmox\/storage-file-upload\/[a-f0-9]{48}$/.test(req.path)&&req.headers['content-type']?.split(';')[0]==='application/octet-stream';
 const timer=setTimeout(()=>{if(!res.headersSent)res.status(408).json({error:'Request body timed out. Check storage contents before retrying an import.'});req.destroy();},upload?7200000:120000);timer.unref();
 const clear=()=>clearTimeout(timer);req.once('end',clear);req.once('aborted',clear);res.once('finish',()=>{clear();if(!req.complete)req.destroy()});res.once('close',clear);next();
}
