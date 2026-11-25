# AI providers and models

> **Suspended.** These setup instructions describe earlier releases. The AI page and provider endpoints are unavailable in the current build. Existing encrypted chats and provider settings are retained on the controller.

Open **AI Assistant → Configure AI Assistant**. Select a provider to update the API format and suggested model choices, then enter an API key issued by that provider.

| Provider | API format |
| --- | --- |
| OpenAI | Responses or Chat Completions |
| Anthropic Claude | Messages |
| Google Gemini | Generate Content |
| DeepSeek | Chat Completions |
| Groq | Chat Completions |
| Mistral AI | Chat Completions |
| n8n (local AI) | Authenticated production webhook |

Use **Load Models** to list text models available to your key. Suggested model IDs are starting points; availability changes and may depend on your account. Choose a listed model or enter a custom ID, then use **Test Connection** to verify that model and API format. Tests send a small prompt and can incur provider charges. Save Configuration applies the selection without restarting i-Clusters.

Switching provider clears the entered key and model list. A new key is required when switching; blank password fields retain a saved key only for the same provider. Existing OpenAI configurations continue to work without re-entering their key. Credentials remain encrypted and are never returned to the browser.

Every ordinary assistant reply uses the saved provider connection. Requests include your question, selected infrastructure measurements and up to four previous exchanges. Provider errors remain visible for retry instead of being replaced by a local summary. Without a configured provider, supported inventory questions can still receive a local measured answer. The assistant remains read-only and has no infrastructure tool execution. Cloud requests use fixed provider HTTPS endpoints. Local n8n requests go to the production webhook configured by the owner. See [privacy](../PRIVACY.md) for processing details.

For environment-based setup, use `AI_PROVIDER` (`openai`, `anthropic`, `gemini`, `deepseek`, `groq`, `mistral` or `n8n`). Existing `OPENAI_API_KEY` and `OPENAI_MODEL` variable names also configure the selected provider for compatibility. Leave the model blank to use its default. UI settings override environment defaults after saving.

API references checked during implementation:

- [Claude Messages and Models](https://platform.claude.com/docs/en/api/overview)
- [Gemini Generate Content](https://ai.google.dev/api/generate-content) and [models](https://ai.google.dev/api/models)
- [DeepSeek](https://api-docs.deepseek.com/)
- [Groq compatibility](https://console.groq.com/docs/openai)
- [Mistral Chat](https://docs.mistral.ai/api) and [models](https://docs.mistral.ai/api/endpoint/models)


## Local AI through n8n

1. In n8n create a **Webhook** node with method **POST** and path `iclusters-assistant`. Choose **Header Auth**. Set the header name to `Authorization` and the value to `Bearer YOUR_SHARED_SECRET`.
2. Connect a **Basic LLM Chain** to your local chat model, such as an Ollama Chat Model. Set the prompt expression to `{{ JSON.stringify($json.body) }}`. The request contains the question in `message`, selected measurements in `context`, previous exchanges in `history` and response guidance in `instructions`. A test request carries an empty context and history.
3. Set the Webhook response mode to **Using Respond to Webhook Node**. Connect the chain to **Respond to Webhook**, choose JSON, and use the expression `{{ { answer: $json.text } }}` for the response body. Publish the workflow.
4. In **Configure AI Assistant**, select **n8n (local AI)**. Paste the HTTPS production webhook URL and enter only the shared secret in **API key**. The i-Clusters API container must be able to resolve the hostname and trust its TLS certificate. Use **Test Connection**, then **Save Configuration**. For environment setup, use `AI_PROVIDER=n8n`, `N8N_WEBHOOK_URL`, and `OPENAI_API_KEY`.
5. **Saved Assistant** shows the active connection and lets its owner test, reconfigure or revoke access from i-Clusters. Rotate the Header Auth secret in n8n to invalidate the credential there.

## Measured inventory

The Compose deployment includes a private Redis cache for each cluster’s latest monitoring samples. The assistant can use reported node addresses, guest counts, connected Docker hosts and containers, storage, tasks and shared activities. Cache entries expire within two minutes of the sample timestamp. If Redis is unavailable, the assistant uses the monitoring sample directly. Answers depend on the readings available to that cluster’s configured integrations.

VM and LXC count questions use the full measured inventory, including when the provider prompt would show only 24 guest rows. Use “How many VMs are running on node01?” or “How many LXC containers are stopped on node02?” with the actual node name. Totals exclude templates and report excluded templates separately. Paused and suspended VMs retain their measured power state. Unknown guest states are disclosed. Incomplete or stale measurements cannot establish an exact count. These facts are supplied to the saved provider in `context.verifiedAnswer`, with instructions to preserve their counts, addresses, states and uncertainty. The model still writes the final reply, so compare measured claims with Proxmox and check the sample timestamp. Recent activity questions use up to 12 shared events for the selected cluster; Overview shows up to six events visible to the signed-in user.

Cache entries are scoped to the installation key, selected profile, runtime directory, Proxmox connection identity and sample timestamp. Their remaining lifetime is bounded by the age of the sample. The API checks the integrity of cached measurements and falls back to the monitor snapshot after a miss or error. A previously sampled Proxmox reading more than two minutes old is withheld from current inventory answers and provider context.

## Saved chat history

Questions, replies, source links, errors, names and pinned status are stored encrypted on the API server for each account and cluster. They survive page reloads, sign-out and subsequent sign-in. Switching clusters loads that cluster's conversations. The browser keeps only the active chat identifier. Any matching chat still present in the old browser session is imported once. Chats already lost from that session cannot be reconstructed.

Use each chat's menu to rename, pin, download or delete it. Deleting a chat also prevents an outstanding reply from recreating it. A request interrupted by an API restart is marked for manual retry. Duplicate retries of a completed exchange return the stored reply. History has a 16 MiB account-and-cluster limit with space reserved for pending replies. At the limit, new messages stop with a visible error instead of silently deleting older chats. Server backups may retain deleted records. The encrypted files depend on the deployment encryption key and persistent `DATA_DIR` storage.

## Public search through the saved connection

**Search the web** prefills `web: `. This sends only the public query to the saved provider, without cluster measurements or chat history. Source links are shown when supplied. Search support depends on the selected model and provider account.

| Saved connection | Search behaviour |
| --- | --- |
| OpenAI Responses | Requests the native `web_search` tool |
| Anthropic Messages | Offers the native `web_search_20250305` tool |
| Google Gemini Generate Content | Enables Google Search grounding and displays its source links and search suggestions |
| n8n | Sends the query to the saved webhook and checks its `webSearch` response marker |
| OpenAI Chat Completions, DeepSeek, Groq, Mistral | Uses the saved model with a visible notice that this integration has no live search tool |

A connection that does not confirm a search is labelled accordingly. An unsupported model or provider failure remains an actionable error. i-Clusters does not switch providers, keys, models or API formats automatically.

[OpenAI web search](https://developers.openai.com/api/docs/guides/tools-web-search) · [Anthropic web search](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool) · [Gemini grounding](https://ai.google.dev/gemini-api/docs/generate-content/google-search)

## Public web search with n8n and Ollama

Download the [inactive n8n workflow](examples/n8n-ollama.json). The workflow has two paths. Ordinary prompts go to Ollama. **Search the web** prefills `web: `. Enter public terms, for example `web: Proxmox VE backup retention documentation`, and press Send. The API sends only that prefixed message to the search workflow. Public results include source links. A search failure is shown as an error.

1. In the n8n editor, import the example. Bind a Webhook Header Auth credential with header name `Authorization` and value `Bearer YOUR_SHARED_SECRET`.
2. In **Ask local Ollama**, set the private URL reachable from the n8n service and replace `REPLACE_WITH_INSTALLED_MODEL` with an exact installed model tag from Ollama's `GET /api/tags`. The workflow sends a non-streaming `POST /api/chat` and extracts `message.content`.
3. In **Search public web**, bind a separate HTTP Header Auth credential with header name `X-Subscription-Token` and the Brave Search API key. Only the terms following `web:` go to Brave. Searches are subject to the configured account's usage charges.
4. When ready, publish the workflow. Select **n8n (local AI)** in i-Clusters, use its HTTPS production URL under `/webhook/`, and enter the raw webhook secret in **API key**. The API must resolve and trust the webhook host. Redirects and test webhook URLs are rejected. A connection test sends a real request and times out after 30 seconds. Chat and public search requests allow 90 seconds.
5. A normal response is `{"answer":"reply text"}`. A completed public search must also return `"webSearch": true`. An older model-only workflow can still reply through the saved connection, but its answer carries a notice that a live search was not confirmed.

[Ollama chat API](https://docs.ollama.com/api/chat) · [n8n Webhook](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/) · [Brave Search API](https://api-dashboard.search.brave.com/app/documentation/web-search/get-started)

## Read-only deployment checks

Run `pvecm status`, `pvesh get /cluster/status --output-format json-pretty` and `pvesh get /cluster/resources --type vm --output-format json-pretty` on one authorised Proxmox node. Compare the exact node names, cluster-status IPs, VMIDs, guest types, template flags and reported states with the selected cluster's Proxmox page. For a VM reported as running, `pvesh get /nodes/NODE/qemu/VMID/status/current --output-format json-pretty` also shows the QEMU monitor state when available. On an offline node the current power state remains unknown.

In the i-Clusters Compose directory, `docker compose exec -T api cat /app/src/build-info.json` identifies the API image. A Git checkout alone cannot identify what is running. To verify Redis from that API, take a recent completed dashboard response in your existing browser session. Copy its exact `sampledAt` and profile ID. The default profile ID is `default`; additional profiles use the UUID in the request path. Use this command for a sample containing Proxmox inventory. It sends PING, PTTL and GET to Redis and displays a summary.

```bash
read -r -p 'Cluster profile ID: ' profile
read -r -p 'Completed dashboard sampledAt: ' stamp
docker compose exec -T api node --input-type=module - "$profile" "$stamp" <<'JS'
import path from 'node:path';
import {createHash,createHmac} from 'node:crypto';
import Redis from 'ioredis';
const [profile,stamp]=process.argv.slice(2);
if(profile!=='default'&&!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(profile))throw Error('Invalid profile');
if(!Number.isFinite(Date.parse(stamp)))throw Error('Invalid sample time');
if(!process.env.REDIS_URL||!process.env.JWT_SECRET||!process.env.DATA_DIR)throw Error('Missing API cache configuration');
if(profile!=='default'){
  process.env.DATA_DIR=path.join(process.env.DATA_DIR,'clusters',profile);
  process.env.ICLUSTERS_CLUSTER_PROFILE=profile;
}
const {clusterConfig}=await import('./src/cluster-config.js');
const url=clusterConfig().url;
if(!url)throw Error('No Proxmox endpoint for this profile');
const connection=createHash('sha256').update(url).digest('hex');
const scope=JSON.stringify([profile,process.env.DATA_DIR,connection,stamp]);
const mac=()=>createHmac('sha256',process.env.JWT_SECRET);
const key='iclusters:assistant:v2:'+mac().update(scope).digest('hex');
const db=new Redis(process.env.REDIS_URL,{lazyConnect:true,connectTimeout:1500,commandTimeout:1000,maxRetriesPerRequest:0,retryStrategy:()=>null});
db.on('error',()=>{});
try{
  await db.connect();
  console.log('API to Redis:',await db.ping());
  const ttl=await db.pttl(key),raw=await db.get(key);
  const entry=raw&&JSON.parse(raw);
  const verified=typeof entry?.body==='string'&&entry.tag===mac().update(key).update(entry.body).digest('hex');
  const data=verified?JSON.parse(entry.body):null;
  console.log({ttlMilliseconds:ttl,matchedSample:data?.sampledAt===stamp,verified,
    measuredAt:data?.proxmox?.measuredAt,complete:data?.proxmox?.complete,
    nodes:data?.proxmox?.nodes?.items?.map(n=>n.name)});
}catch(e){console.error(e.code||e.name);process.exitCode=1}finally{db.disconnect()}
JS
```

A verified match, the expected node names and a positive TTL of at most 120,000 ms establish that this profile's sample was stored. A miss can indicate expiry, eviction, an interim reading or a different timestamp. Repeat with a fresh completed sample. If another authorised profile exists, verify its own measurements separately. Inspect existing n8n execution records when retained. Sending an assistant message or pressing **Test Connection** creates a real request.
