// Runs inside the controller from the host console. Credentials arrive only on stdin.
import fs from 'node:fs';
import {pool} from '../src/db.js';
import {claimOwnerFromConsole} from '../src/setup.js';

try {
 const fields=fs.readFileSync(0,'utf8').replace(/\r?\n$/,'').split(/\r?\n/);
 if(fields.length!==4)throw Error('Run sudo iclusters claim-owner on the controller.');
 const [name,username,email,password]=fields;
 const owner=await claimOwnerFromConsole(pool,{name,username,email,password});
 console.log('Owner account created. Sign in as '+owner.username+'.');
} catch(error) {
 console.error(error.message);
 process.exitCode=1;
} finally {
 await pool.end();
}
