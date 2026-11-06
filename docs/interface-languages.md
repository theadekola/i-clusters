# Interface languages

Appearance → Interface Language switches pages, navigation, control labels, dialogs, notifications, help text and accessible labels immediately. The preference is saved in the current browser and restored before the app mounts. The standalone connection diagnostics and self-contained offline recovery screen also use the saved language. The packs ship with the web app; no translation service or API key is needed.

| Language | Locale | Flag | Direction |
| --- | --- | --- | --- |
| English (UK) | en-GB | United Kingdom | Left to right |
| English (US) | en-US | United States | Left to right |
| Français | fr-FR | France | Left to right |
| Español | es-ES | Spain | Left to right |
| Deutsch | de-DE | Germany | Left to right |
| Português | pt-PT | Portugal | Left to right |

English (UK) and English (US) share the English source catalogue; dates and numbers follow the selected regional locale. These flags identify the selected regional variants. Other countries also speak these languages. Flag images are bundled under `public/flags`, from the MIT-licensed flag-icons project.

## What changes

Language switching retains open forms, unsaved input, selection and authentication. Unsupported saved language preferences fall back to English and left-to-right layout. Dates and numbers use the selected locale. The picker supports keyboard navigation and reports a missing pack without losing the active language.

Resource names, addresses, paths, account names, secrets, terminal output, source code and provider data remain their original values. Provider messages that match bundled interface messages are translated for display. Arbitrary provider logs, user-authored descriptions and generated AI responses remain in their source language. Operation identifiers, option values and API payloads retain their original values.

## Maintaining coverage

The application uses a React JSX rendering boundary and a Vite source transform so shared controls and page copy use one locale store. Resource fields are explicitly marked as verbatim before rendering; structural table helpers recognize the rendering boundary. Rich messages retain React child elements and numbered substitutions rather than replacing DOM text after rendering.

1. Add or change source copy.
2. Run `npm run i18n:extract -w apps/web` to refresh the English catalogue and manifest.
3. Update every target JSON pack in `apps/web/src/i18n/packs`, preserving each `{0}` substitution.
4. Run `npm run i18n:check -w apps/web`, `npm run i18n:recovery -w apps/web`, web tests and the production build. The recovery generator embeds only its small copy subset in the service worker so it still works when every external asset is unreachable.
5. Run `LAYOUT_LOCALE=de-DE` and `LAYOUT_LOCALE=fr-FR` with `scripts/audit-layout.mjs` for layout checks. `LAYOUT_CHECK_LANGUAGES=1` additionally exercises all six regional choices, persistence, flags, keyboard navigation and the French login page.

The build rejects missing keys, empty translations, changed substitutions and missing flag files. The validator also supports the standalone web Docker build context, where API source files are absent. New technical data fields must be added to the protected field list or marked `translate="no"` at their containing element.

Core navigation and controls have reviewed translations. Longer interface copy uses offline machine translation and should receive native-speaker editorial review as part of future language maintenance. The models are Helsinki-NLP OPUS-MT English to French, German, Spanish and Romance (Portuguese target `>>pt<<`), run locally through CTranslate2. No user content or infrastructure data is sent for translation.
