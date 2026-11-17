# AI providers and models

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

Assistant requests send your question and selected infrastructure measurements to the selected provider. The assistant remains read-only and has no infrastructure tool execution. Cloud requests use fixed provider HTTPS endpoints. Local n8n requests go to the production webhook configured by the owner. See [privacy](../PRIVACY.md) for processing details.

For environment-based setup, use `AI_PROVIDER` (`openai`, `anthropic`, `gemini`, `deepseek`, `groq` `mistral` or `n8n`). Existing `OPENAI_API_KEY` and `OPENAI_MODEL` variable names also configure the selected provider for compatibility. Leave the model blank to use its default. UI settings override environment defaults after saving.

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

The Compose deployment includes a private Redis cache for each cluster’s latest monitoring samples. The assistant can use reported node addresses, guest counts, connected Docker hosts and containers, storage, tasks and shared activities. Cache entries expire after two minutes. If Redis is unavailable, the assistant uses the monitoring sample directly. Answers depend on the readings available to that cluster’s configured integrations.
