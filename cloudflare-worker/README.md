# BeatVision Cloudflare Image Worker

This Worker provides Stage 06 image generation for BeatVision.

Public routes:

- GET /api/health
- GET /api/provider-status
- POST /api/generate-scene-image

Cloudflare configuration:

- Workers AI binding name: AI
- Required encrypted secret: BEATVISION_ACCESS_KEY
- Model: @cf/black-forest-labs/flux-1-schnell

Never commit the secret value.

The current provider uses reference-photo names, types, descriptions, and
selected IDs as prompt guidance. It does not send uploaded reference pixels
to the FLUX model.

The real workers.dev URL and access key are stored outside the repository in:

$HOME/.config/beatvision/worker.env

Android Termux cannot run Cloudflare workerd. Deploy this Worker through the
Cloudflare dashboard or a supported Linux CI runner.
