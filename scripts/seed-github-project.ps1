$ErrorActionPreference = "Stop"
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

$projectId = "PVT_kwHOBghmMs4BdxUl"
$projectNumber = 1
$owner = "CRZANDROID"

$statusId = "PVTSSF_lAHOBghmMs4BdxUlzhYQdcQ"
$areaId = "PVTSSF_lAHOBghmMs4BdxUlzhYQdmg"
$priorityId = "PVTSSF_lAHOBghmMs4BdxUlzhYQdng"
$estimateId = "PVTSSF_lAHOBghmMs4BdxUlzhYQdoY"
$sprintId = "PVTIF_lAHOBghmMs4BdxUlzhYQeFA"

$statusMap = @{
  "Backlog" = "d29d73a7"
  "Ready" = "94023d5d"
  "In progress" = "cf7455f7"
  "In review" = "c78cf477"
  "Blocked" = "b65604c3"
  "Done" = "48b8b97c"
}
$areaMap = @{
  "Backend" = "e6d3c586"
  "Frontend" = "14048aa4"
  "Database" = "212bd5c6"
  "Infrastructure" = "188e8ca1"
  "Product" = "b04bda08"
}
$priorityMap = @{ "P0" = "0703436a"; "P1" = "5c5142b1"; "P2" = "1bb26520" }
$estimateMap = @{ "1" = "43d5488e"; "2" = "17ecaac0"; "3" = "d983e0bc"; "5" = "dba7db96"; "8" = "5f7e8d2f" }
$sprintMap = @{
  "1" = "676a0f4e"; "2" = "d0f3ecf2"; "3" = "49326455"; "4" = "acff589f"
  "5" = "2509d776"; "6" = "c5a326e4"; "7" = "81ed4f13"; "8" = "e4f28f93"
}

function Add-NormaIssue {
  param(
    [string]$Repo,
    [string]$Title,
    [string]$Body,
    [string]$StatusName,
    [string]$AreaName,
    [string]$PriorityName,
    [string]$EstimateName,
    [string]$SprintNum,
    [string[]]$Labels
  )

  $bodyFile = Join-Path $env:TEMP ("norma-issue-" + [guid]::NewGuid().ToString() + ".md")
  Set-Content -Path $bodyFile -Value $Body -Encoding utf8

  $args = @("issue", "create", "-R", $Repo, "-t", $Title, "-F", $bodyFile)
  foreach ($label in $Labels) {
    $args += @("-l", $label)
  }

  $issueUrl = & gh @args
  if (-not $issueUrl) { throw "Failed to create issue: $Title" }
  Write-Host "Created $issueUrl"

  $itemJson = gh project item-add $projectNumber --owner $owner --url $issueUrl --format json
  $itemId = ($itemJson | ConvertFrom-Json).id
  if (-not $itemId) { throw "Failed to add item to project: $Title" }

  gh project item-edit --project-id $projectId --id $itemId --field-id $statusId --single-select-option-id $statusMap[$StatusName] | Out-Null
  gh project item-edit --project-id $projectId --id $itemId --field-id $areaId --single-select-option-id $areaMap[$AreaName] | Out-Null
  gh project item-edit --project-id $projectId --id $itemId --field-id $priorityId --single-select-option-id $priorityMap[$PriorityName] | Out-Null
  gh project item-edit --project-id $projectId --id $itemId --field-id $estimateId --single-select-option-id $estimateMap[$EstimateName] | Out-Null
  gh project item-edit --project-id $projectId --id $itemId --field-id $sprintId --iteration-id $sprintMap[$SprintNum] | Out-Null

  Remove-Item $bodyFile -Force -ErrorAction SilentlyContinue
  Write-Host "Configured fields for: $Title"
}

$issues = @(
  # Sprint 1
  @{
    Repo="CRZANDROID/norma-backend"; Sprint="1"; Status="Done"; Area="Backend"; Priority="P0"; Estimate="5"; Labels=@("sprint-1")
    Title="S1: NestJS scaffold + health + Prisma + Supabase DB"
    Body=@"
## Done
- NestJS project, ConfigModule, modular structure
- GET /health
- Prisma schema + migration applied on Supabase
- Local env documented

## Acceptance
- [x] Backend boots locally
- [x] /health returns database up
"@
  },
  @{
    Repo="CRZANDROID/norma-frontend"; Sprint="1"; Status="Done"; Area="Frontend"; Priority="P0"; Estimate="5"; Labels=@("sprint-1")
    Title="S1: React/Vite scaffold + router + layouts + Supabase client"
    Body=@"
## Done
- Vite + React + TS + Tailwind + Radix
- Router, layouts, empty pages
- Axios + Zustand
- Supabase JS client

## Acceptance
- [x] Frontend runs on localhost:5173
"@
  },
  @{
    Repo="CRZANDROID/norma-backend"; Sprint="1"; Status="Ready"; Area="Product"; Priority="P1"; Estimate="2"; Labels=@("sprint-1","docs")
    Title="S1: Document environments (dev/staging/prod)"
    Body=@"
## Goal
Document Development, Staging and Production environment variables and URLs.

## Acceptance
- [ ] README sections for each environment
- [ ] .env.example covers required keys without secrets
"@
  },
  @{
    Repo="CRZANDROID/norma-backend"; Sprint="1"; Status="Done"; Area="Product"; Priority="P0"; Estimate="3"; Labels=@("sprint-1")
    Title="S1: Create GitHub Project board and weekly sprints"
    Body=@"
## Done
- Project NORMA Piloto Arca created
- Fields: Status, Sprint, Area, Priority, Estimate
- 8 weekly iterations
- Both repos linked

## Acceptance
- [x] Board available at GitHub Projects
"@
  },

  # Sprint 2
  @{
    Repo="CRZANDROID/norma-backend"; Sprint="2"; Status="Ready"; Area="Database"; Priority="P0"; Estimate="5"; Labels=@("sprint-2","database","auth")
    Title="S2: Prisma schema for auth users, roles, memberships, clients, profiles, sources"
    Body=@"
## Goal
Replace passwordHash with Supabase authUserId. Model users, roles, permissions, memberships, clients, regulatory profiles and sources.

## Acceptance
- [ ] Migration applied
- [ ] Seed for VCGA / Arca Continental
- [ ] No local password storage
"@
  },
  @{
    Repo="CRZANDROID/norma-backend"; Sprint="2"; Status="Ready"; Area="Backend"; Priority="P0"; Estimate="8"; Labels=@("sprint-2","auth")
    Title="S2: NestJS Supabase JWT validation + Auth guards"
    Body=@"
## Goal
Validate Supabase access tokens in NestJS and protect routes with Guards based on role/membership.

## Acceptance
- [ ] Bearer JWT validated against Supabase JWKS/secret
- [ ] Unauthenticated requests rejected
- [ ] Role-based access works for admin/analyst
"@
  },
  @{
    Repo="CRZANDROID/norma-frontend"; Sprint="2"; Status="Ready"; Area="Frontend"; Priority="P0"; Estimate="5"; Labels=@("sprint-2","auth")
    Title="S2: Supabase Auth login + protected routes"
    Body=@"
## Goal
Replace placeholder login with Supabase Auth. Protect dashboard routes and attach access token to Axios.

## Acceptance
- [ ] Login/logout works
- [ ] Protected routes redirect when signed out
- [ ] API calls send Authorization Bearer token
"@
  },
  @{
    Repo="CRZANDROID/norma-backend"; Sprint="2"; Status="Ready"; Area="Backend"; Priority="P1"; Estimate="3"; Labels=@("sprint-2","auth")
    Title="S2: Auth me endpoint and user sync from Supabase"
    Body=@"
## Goal
Expose GET /auth/me and sync/create local User row from Supabase identity on first login.

## Acceptance
- [ ] First login creates local user profile
- [ ] /auth/me returns role and memberships
"@
  },

  # Sprint 3
  @{
    Repo="CRZANDROID/norma-backend"; Sprint="3"; Status="Backlog"; Area="Backend"; Priority="P0"; Estimate="5"; Labels=@("sprint-3")
    Title="S3: CRUD Clients + regulatory profiles API"
    Body=@"
## Goal
Implement clients CRUD and regulatory profile CRUD scoped to authorization rules.

## Acceptance
- [ ] Create/read/update/deactivate clients
- [ ] Profiles linked to clients
- [ ] AuthZ enforced
"@
  },
  @{
    Repo="CRZANDROID/norma-backend"; Sprint="3"; Status="Backlog"; Area="Backend"; Priority="P0"; Estimate="5"; Labels=@("sprint-3")
    Title="S3: CRUD Sources + activate/deactivate"
    Body=@"
## Goal
Sources CRUD with enable/disable and initial config fields for connectors.

## Acceptance
- [ ] CRUD works
- [ ] Activate/deactivate endpoint
- [ ] Seed pilot sources (DOF, Diputados, one state congress)
"@
  },
  @{
    Repo="CRZANDROID/norma-backend"; Sprint="3"; Status="Backlog"; Area="Backend"; Priority="P1"; Estimate="5"; Labels=@("sprint-3","auth")
    Title="S3: Basic user admin and role assignment"
    Body=@"
## Goal
Admin endpoints to list users, invite/link users and assign roles/memberships.

## Acceptance
- [ ] Admin can list users
- [ ] Role assignment persists
- [ ] Non-admin cannot manage users
"@
  },
  @{
    Repo="CRZANDROID/norma-frontend"; Sprint="3"; Status="Backlog"; Area="Frontend"; Priority="P0"; Estimate="8"; Labels=@("sprint-3")
    Title="S3: Admin screens connected to real API"
    Body=@"
## Goal
Build Clients, Sources and Users screens against real backend APIs. Reusable table/form/modal components.

## Acceptance
- [ ] No mock data for these screens
- [ ] Loading/error states
- [ ] CRUD flows usable end-to-end
"@
  },

  # Sprint 4
  @{
    Repo="CRZANDROID/norma-backend"; Sprint="4"; Status="Backlog"; Area="Backend"; Priority="P0"; Estimate="5"; Labels=@("sprint-4")
    Title="S4: Swagger, validation, global errors, logging"
    Body=@"
## Goal
Document API with Swagger/OpenAPI, DTO validation, global exception filter and structured logging.

## Acceptance
- [ ] /docs available
- [ ] Invalid payloads return 400
- [ ] Unhandled errors logged
"@
  },
  @{
    Repo="CRZANDROID/norma-backend"; Sprint="4"; Status="Backlog"; Area="Database"; Priority="P1"; Estimate="3"; Labels=@("sprint-4","database")
    Title="S4: Indexes, seed data and auth/permission tests"
    Body=@"
## Goal
Review indexes, reproducible seed and automated tests for auth + permissions + CRUD smoke.

## Acceptance
- [ ] Seed script documented
- [ ] Critical indexes present
- [ ] Tests pass in CI/local
"@
  },
  @{
    Repo="CRZANDROID/norma-backend"; Sprint="4"; Status="Backlog"; Area="Infrastructure"; Priority="P1"; Estimate="3"; Labels=@("sprint-4")
    Title="S4: Sentry + Supabase Storage minimal integration"
    Body=@"
## Goal
Wire Sentry error capture and a minimal Storage upload/download path for future documents.

## Acceptance
- [ ] Test error appears in Sentry
- [ ] File upload/download works for a sample object
"@
  },
  @{
    Repo="CRZANDROID/norma-backend"; Sprint="4"; Status="Backlog"; Area="Product"; Priority="P1"; Estimate="3"; Labels=@("sprint-4","docs")
    Title="S4: Document contracts for documents and ingestion jobs"
    Body=@"
## Goal
Define document states and job contracts needed for Sprint 5 ingestion.

## Acceptance
- [ ] Document state machine written
- [ ] Job payload/result contract documented
"@
  },

  # Sprint 5
  @{
    Repo="CRZANDROID/norma-backend"; Sprint="5"; Status="Backlog"; Area="Infrastructure"; Priority="P0"; Estimate="8"; Labels=@("sprint-5")
    Title="S5: Redis + BullMQ workers and scheduler"
    Body=@"
## Goal
Introduce Redis/BullMQ, a worker process and scheduled source crawl jobs with retries/idempotency.

## Acceptance
- [ ] Job enqueued and processed
- [ ] Retry/failure visible
- [ ] Scheduler can trigger source crawls
"@
  },
  @{
    Repo="CRZANDROID/norma-backend"; Sprint="5"; Status="Backlog"; Area="Backend"; Priority="P0"; Estimate="8"; Labels=@("sprint-5")
    Title="S5: Pilot connectors (DOF, Diputados, one state congress)"
    Body=@"
## Goal
Implement 2-3 representative connectors for the Arca pilot.

## Acceptance
- [ ] Each connector fetches and persists raw crawl results
- [ ] Runs via queue job
- [ ] Failures are logged with source context
"@
  },

  # Sprint 6
  @{
    Repo="CRZANDROID/norma-backend"; Sprint="6"; Status="Backlog"; Area="Backend"; Priority="P0"; Estimate="8"; Labels=@("sprint-6","database")
    Title="S6: Document registry, storage originals, processing states"
    Body=@"
## Goal
Immutable document records, original file storage and processing state transitions.

## Acceptance
- [ ] Documents never deleted
- [ ] Originals stored
- [ ] States transition cleanly
"@
  },
  @{
    Repo="CRZANDROID/norma-backend"; Sprint="6"; Status="Backlog"; Area="Backend"; Priority="P0"; Estimate="8"; Labels=@("sprint-6")
    Title="S6: Extraction, normalization, hash and dedup"
    Body=@"
## Goal
HTML/PDF extraction, normalization to common document shape, content hash and initial deduplication.

## Acceptance
- [ ] Normalized document structure persisted
- [ ] Duplicates linked, not deleted
- [ ] Legislative status history tracked
"@
  },

  # Sprint 7
  @{
    Repo="CRZANDROID/norma-backend"; Sprint="7"; Status="Backlog"; Area="Backend"; Priority="P0"; Estimate="5"; Labels=@("sprint-7")
    Title="S7: OpenAI client with errors, limits and usage logging"
    Body=@"
## Goal
Reusable OpenAI client with error handling, rate limits and token/usage logging.

## Acceptance
- [ ] Client reusable by agents
- [ ] Failures handled
- [ ] Usage logged per call
"@
  },
  @{
    Repo="CRZANDROID/norma-backend"; Sprint="7"; Status="Backlog"; Area="Backend"; Priority="P0"; Estimate="8"; Labels=@("sprint-7")
    Title="S7: Classification, relevance and 4-level traffic light"
    Body=@"
## Goal
Classify findings, score relevance against Arca regulatory profile/portfolio and assign green/yellow/orange/red with justification.

## Acceptance
- [ ] Four-level severity
- [ ] Explanation stored
- [ ] Small evaluation set documented
"@
  },

  # Sprint 8
  @{
    Repo="CRZANDROID/norma-backend"; Sprint="8"; Status="Backlog"; Area="Backend"; Priority="P0"; Estimate="8"; Labels=@("sprint-8")
    Title="S8: Executive draft, folio, versions and prompt trace"
    Body=@"
## Goal
Generate executive draft with folio/versioning and store prompt/response traces for audit.

## Acceptance
- [ ] Draft generated per finding/report
- [ ] Versions retained
- [ ] Prompt/response audit available
"@
  },
  @{
    Repo="CRZANDROID/norma-frontend"; Sprint="8"; Status="Backlog"; Area="Frontend"; Priority="P0"; Estimate="8"; Labels=@("sprint-8")
    Title="S8: Findings inbox (advance / feedback / discard)"
    Body=@"
## Goal
Human validation inbox for findings with advance, feedback and discard actions.

## Acceptance
- [ ] Inbox lists pending findings
- [ ] Three-way decision persists
- [ ] Traceability visible
"@
  },
  @{
    Repo="CRZANDROID/norma-backend"; Sprint="8"; Status="Backlog"; Area="Infrastructure"; Priority="P1"; Estimate="3"; Labels=@("sprint-8")
    Title="S8: Resend test email after human approval"
    Body=@"
## Goal
Send a test email via Resend only after a finding/report is human-approved.

## Acceptance
- [ ] Email sends in test mode
- [ ] No auto-send without approval
"@
  }
)

foreach ($issue in $issues) {
  Add-NormaIssue `
    -Repo $issue.Repo `
    -Title $issue.Title `
    -Body $issue.Body `
    -StatusName $issue.Status `
    -AreaName $issue.Area `
    -PriorityName $issue.Priority `
    -EstimateName $issue.Estimate `
    -SprintNum $issue.Sprint `
    -Labels $issue.Labels
}

Write-Host "All issues created and assigned."
gh project item-list 1 --owner CRZANDROID --format json --limit 100 | ConvertFrom-Json | Select-Object -ExpandProperty items | Measure-Object | Select-Object Count
