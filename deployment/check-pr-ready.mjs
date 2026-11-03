// Read-only pre-merge gate. Merge separately using the same expected head SHA.
import {pathToFileURL} from 'node:url';
export function assertReady(pr,checks,status,expected){
 if(pr.state!=='open'||pr.draft||pr.head?.sha!==expected||pr.mergeable!==true)throw Error('PR must be open, ready, mergeable and at the reviewed head SHA.');
 if(checks.total_count>=100)throw Error('Too many check runs; inspect all pages before merging.');
 // A push and a pull_request can run the same job. All runs must finish successfully.
 const runs=checks.check_runs||[];
 if(!runs.some(run=>run.name==='checks'&&run.head_sha===expected&&run.conclusion==='success'))throw Error('The application checks job has not passed at the reviewed head.');
 if(runs.some(run=>run.head_sha!==expected||run.status!=='completed'||!['success','neutral','skipped'].includes(run.conclusion)))throw Error('Checks are pending, failed or belong to a different head.');
 if(status.total_count>0&&status.state!=='success')throw Error('Commit statuses have not all passed.');
 return expected;
}
async function main(){
 const [repository,number,expected]=process.argv.slice(2);
 if(!/^[\w.-]+\/[\w.-]+$/.test(repository||'')||!/^\d+$/.test(number||'')||!/^[a-f0-9]{40}$/.test(expected||''))throw Error('Usage: node deployment/check-pr-ready.mjs owner/repository PR_NUMBER REVIEWED_HEAD_SHA');
 const headers={'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(process.env.GITHUB_TOKEN?{Authorization:'Bearer '+process.env.GITHUB_TOKEN}:{})};
 const get=async path=>{const response=await fetch('https://api.github.com/repos/'+repository+path,{headers,signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('GitHub read failed: HTTP '+response.status);return response.json()};
 const [pr,checks,status]=await Promise.all([get('/pulls/'+number),get('/commits/'+expected+'/check-runs?per_page=100'),get('/commits/'+expected+'/status')]);
 console.log('Ready to merge reviewed head: '+assertReady(pr,checks,status,expected));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(error.message);process.exitCode=1});
