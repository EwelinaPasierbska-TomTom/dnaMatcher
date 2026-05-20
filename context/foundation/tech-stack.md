---
starter_id: fastapi
package_manager: uv
project_name: dna-matcher
hints:
  language_family: multi
  team_size: solo
  deployment_target: render
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: custom
  quality_override: false
  self_check_answers:
    typed: false
    from_official_starter: false
    conventions: false
    docs_current: true
    can_judge_agent: false
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
---

## Why this stack

Solo developer building a DNA segment comparison web app in 3 after-hours weeks with a beginner profile. Python anchors the backend: FastAPI + Pydantic handle CSV parsing, allele comparison, and segment classification — the domain engine passes all four agent-friendly quality gates within the Python family. React Router v7 (TypeScript) is the frontend starter, also clearing all four gates; its mainstream React ecosystem provides the best library coverage for the interactive chromosome visualization required by FR-007 (D3.js, Recharts, Visx). Both starters deploy as a single Render free-tier service — FastAPI serves the built React static bundle — keeping infrastructure to zero cost and one pipeline. Auth (FR-001, FR-002) and CSV file upload (FR-003) are the technology-forcing features; payments, realtime, and AI are out of scope per PRD non-goals. The self-check flagged can_judge_agent as false (beginner profile); CLAUDE.md compensation is required to encode stack conventions so the AI assistant provides guardrails instead of requiring the user to judge its output.
