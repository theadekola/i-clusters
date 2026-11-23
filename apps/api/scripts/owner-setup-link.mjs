// Invoked locally by the installer or the privileged controller CLI.
import {pool} from '../src/db.js';
import {issueOwnerSetupToken} from '../src/setup.js';

try {
 const url = new URL(process.argv[2] || (process.env.WEB_ORIGIN || '').split(',')[0]);
 if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
  throw Error('Configure an HTTPS dashboard origin before requesting a setup link.');
 }
 url.hash = 'owner-setup=' + await issueOwnerSetupToken(pool);
 const href = url.href;
 // Use OSC 8 on the private terminal and keep the full address visible for copying.
 console.log(process.argv[3] === '--terminal-link' ? `\x1b]8;;${href}\x1b\\${href}\x1b]8;;\x1b\\` : href);
} catch (error) {
 console.error(error.message);
 // A fresh installation can attach an existing database volume.
 process.exitCode = error.status === 409 ? 3 : 1;
} finally {
 await pool.end();
}
