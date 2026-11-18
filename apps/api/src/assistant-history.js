import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {createClusterStore} from './cluster-config.js';

const failure = (message, status = 400) => Object.assign(Error(message), {status});
const validId = id => Number.isSafeInteger(id) && id >= 0;

// Each cluster process writes its own directory. Synchronous encrypted updates
// keep concurrent requests from replacing another tab's conversation changes.
export function createAssistantHistory(directory = process.env.DATA_DIR || 'runtime') {
  const active = new Set();
  const vault = user => createClusterStore(path.join(directory, 'assistant-history',
    createHash('sha256').update(user).digest('hex') + '.json'), undefined, value => value);
  function read(user) {
    const saved = vault(user).read() || {threads: []};
    for (const thread of saved.threads) for (const row of thread.rows) {
      if (row.pending && !active.has(row.pending)) {
        delete row.pending;
        row.error = 'The previous reply was interrupted. Retry this message.';
      }
    }
    return saved;
  }
  function write(user, saved) {
    if (Buffer.byteLength(JSON.stringify(saved)) + saved.threads.reduce((total,thread)=>total+thread.rows.filter(row=>row.pending).length*1024*1024,0) > 16 * 1024 * 1024)
      throw failure('Chat history is full. Download and delete an older chat to make room.', 413);
    vault(user).save(saved);
  }
  const publicThread = ({legacyImport, ...thread}) => ({...thread, rows: thread.rows.map(({pending, ...row}) => ({...row, ...(pending ? {pending: true} : {})}))});
  return {
    list(user) {
      return {threads: read(user).threads.map(({rows, legacyImport, ...thread}) => ({...thread, rows: [], question: rows[0]?.question}))};
    },
    get(user, id) {
      const thread = read(user).threads.find(row => row.id === id);
      if (!thread) throw failure('Chat not found.', 404);
      return publicThread(thread);
    },
    edit(user, id, patch) {
      const saved = read(user), thread = saved.threads.find(row => row.id === id);
      if (!thread) throw failure('Chat not found.', 404);
      if (patch.title !== undefined) {
        if (typeof patch.title !== 'string' || !patch.title.trim() || patch.title.length > 160) throw failure('Enter a chat name up to 160 characters.');
        thread.title = patch.title.trim();
      }
      if (patch.pinned !== undefined) {
        if (typeof patch.pinned !== 'boolean') throw failure('Invalid pinned setting.');
        thread.pinned = patch.pinned;
      }
      write(user, saved);
      return publicThread(thread);
    },
    remove(user, id) {
      const saved = read(user);
      saved.threads = saved.threads.filter(row => row.id !== id);
      write(user, saved);
    },
    import(user, threads) {
      if (!Array.isArray(threads) || threads.length > 20) throw failure('Invalid browser chat history.');
      const saved = read(user);
      for (const thread of threads) {
        if (!validId(thread?.id) || !Array.isArray(thread.rows) || thread.rows.length > 12) throw failure('Invalid browser chat history.');
        if (!thread.rows.length) continue;
        const rows = thread.rows.map(row => {
          if (!validId(row?.id) || typeof row.question !== 'string' || row.question.length > 10000) throw failure('Invalid browser chat message.');
          return {id: row.id, question: row.question, ...Object.fromEntries(['answer', 'error', 'mode'].filter(key => typeof row[key] === 'string').map(key => [key, row[key].slice(0, 32000)]))};
        });
        const imported = {id: thread.id, title: String(thread.title || rows[0].question).slice(0, 160), pinned: thread.pinned === true, rows};
        const legacyImport = createHash('sha256').update(JSON.stringify(imported)).digest('hex');
        if (saved.threads.some(row => row.legacyImport === legacyImport)) continue;
        // Older browsers used id 0 for their first chat. Preserve both histories.
        if (saved.threads.some(row => row.id === imported.id)) {
          imported.id = parseInt(legacyImport.slice(0, 13), 16);
          while (saved.threads.some(row => row.id === imported.id)) imported.id++;
        }
        saved.threads.unshift({...imported, legacyImport});
      }
      write(user, saved);
    },
    begin(user, threadId, exchangeId, message) {
      if (!validId(threadId) || !validId(exchangeId)) throw failure('Invalid chat identifier.');
      if (message.length > 10000) throw failure('Enter a message up to 10,000 characters.');
      const saved = read(user);
      let thread = saved.threads.find(row => row.id === threadId);
      if (!thread) {
        thread = {id: threadId, title: message.slice(0, 160), rows: []};
        saved.threads.unshift(thread);
      }
      let row = thread.rows.find(row => row.id === exchangeId);
      if (row && row.question !== message) throw failure('This message changed. Start a new message.', 409);
      if (row?.answer) {
        const {id, question, ...result} = row;
        return {result};
      }
      if (row?.pending) throw failure('A reply is still being generated for this message.', 409);
      if (!row) { row = {id: exchangeId, question: message}; thread.rows.push(row); }
      delete row.error;
      row.pending = randomUUID();
      write(user, saved);
      active.add(row.pending);
      const pending = row.pending;
      const history = thread.rows.slice(0, thread.rows.indexOf(row)).filter(row => row.answer).slice(-4).map(({question, answer}) => ({question: question.slice(0, 2000), answer: answer.slice(0, 4000)}));
      return {history, finish(result) {
        try {
          const latest = read(user), item = latest.threads.find(row => row.id === threadId)?.rows.find(row => row.id === exchangeId);
          // A deleted chat stays deleted when an outstanding reply completes.
          if (!item || item.pending !== pending) return;
          delete item.pending;
          Object.assign(item, result);
          write(user, latest);
        } finally { active.delete(pending); }
      }};
    }
  };
}
