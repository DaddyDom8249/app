# BeatVision - Product Requirements Document

## Original Problem Statement
Build a production-style MVP web app called BeatVision. Tagline: "Every Song Has a World. BeatVision Reveals It."
BeatVision helps musicians and creators turn a song into a visual music video concept using lyrics, style presets, uploaded reference photos, and approval-gated stages. Must support uploaded reference photos for image generation. Must never fake generated images — manual upload always works as fallback.

## Tech Stack
- Frontend: React (JSX, not TS per user preference), Tailwind, Framer Motion, lucide-react, sonner
- Backend: FastAPI, emergentintegrations
- LLM: Claude Sonnet 4.5 (text), Gemini Nano Banana (images) — both via Emergent LLM Key
- Persistence: localStorage only (no auth, no DB writes for MVP)

## User Personas
- Independent musicians without a director budget
- Music video creators who need a director's playbook
- Non-technical creators who want to iterate on visual concepts

## Core Requirements (Static)
- Approval-gated workflow (Reference Photos → World Report → World Assets → Storyboard → Scene Prompts → Scene Images → Motion/Export)
- 10 style presets, 5 reference-photo types
- Reference photos influence world report, prompts, and scene image generation
- Never falsify generated images; provider missing state is explicit
- Runtime error boundary instead of black screens

## What's Been Implemented (2026-02-14)
- Landing, Dashboard, Create Project, Project Workflow, Settings pages
- Backend endpoints: /api/provider-status, /api/generate-world-report, /api/generate-world-assets, /api/generate-storyboard, /api/generate-scene-prompts, /api/generate-scene-image
- Editorial Noir dark cinematic theme with Archivo Black + Cormorant Garamond + Manrope + IBM Plex Mono
- Reference photo uploader (drag/drop, type assignment, description, remove)
- Scene image dual mode: manual upload + generate from reference
- Motion/Export mock plan
- ErrorBoundary component
- All interactive elements have data-testid attributes

## Prioritized Backlog
### P0 (done)
- All above features shipped

### P1 (future)
- Real MP4 export renderer (stitch approved scene images with motion effects)
- Per-scene reference photo picker (currently uses storyboard's suggested ids)
- Motion generation provider integration when available

### P2
- Auth + cloud project storage
- Collaborative approval (share link, comments)
- Version history for regenerated sections
