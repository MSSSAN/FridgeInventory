# Extracted raw notes

The uploaded `.webarchive` is a saved Claude conversation page, not a source-code archive. Code in the page was embedded as rendered HTML paragraphs, and some Claude artifact previews were collapsed/truncated.

For repository use, the main scripts were reconstructed from the visible code snippets around these sections:

- `generate-upload-url Lambda`
- `Updated Chat Lambda with DynamoDB/S3`
- `Async polling: dispatcher / worker / status check`
- `S3UploadService` and `GeminiService` Swift snippets

The curated files in `backend/` and `ios/` are cleaned, environment-variable based versions of those snippets. Do not treat them as a drop-in Xcode project; treat them as repository-ready architecture/reference scripts.
