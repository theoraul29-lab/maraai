param(
  [Parameter(Mandatory = $true)]
  [string]$RepoUrl,
  [string]$CommitMessage = "chore: sync MaraAI changes"
)

$ErrorActionPreference = "Stop"

Write-Host "== MaraAI safe push =="
Write-Host "Repo URL: $RepoUrl"

if (-not (git rev-parse --is-inside-work-tree 2>$null)) {
  throw "Current folder is not a git repository."
}

# Keep local secrets/databases out of commits.
$ignoreEntries = @(
  ".env",
  ".env.*",
  "*.sqlite",
  "*.sqlite3",
  "maraai.sqlite",
  "logs/"
)

if (-not (Test-Path ".gitignore")) {
  New-Item -Path ".gitignore" -ItemType File | Out-Null
}

$gitignore = Get-Content ".gitignore" -ErrorAction SilentlyContinue
foreach ($entry in $ignoreEntries) {
  if ($gitignore -notcontains $entry) {
    Add-Content ".gitignore" $entry
  }
}

# Unstage sensitive files only when currently staged.
function Unstage-IfStaged {
  param([string]$Path)
  $staged = git diff --cached --name-only -- "$Path"
  if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($staged)) {
    git restore --staged -- "$Path" *> $null
  }
}

Unstage-IfStaged ".env"
Unstage-IfStaged "maraai.sqlite"
Unstage-IfStaged "frontend/.env"

# Remove sensitive tracked files from index (keep local files) only if tracked.
function Remove-FromIndexIfTracked {
  param([string]$Path)
  $tracked = git ls-files -- "$Path"
  if (-not [string]::IsNullOrWhiteSpace($tracked)) {
    git rm --cached -- "$Path" *> $null
  }
}

Remove-FromIndexIfTracked ".env"
Remove-FromIndexIfTracked "maraai.sqlite"
Remove-FromIndexIfTracked "frontend/.env"

# Stage everything else.
git add .

# Commit if needed.
$pending = git diff --cached --name-only
if (-not [string]::IsNullOrWhiteSpace($pending)) {
  git commit -m $CommitMessage
} else {
  Write-Host "No staged changes to commit."
}

# Ensure main branch.
$currentBranch = git branch --show-current
if ($currentBranch -ne "main") {
  git checkout main
}

# Configure remote.
$hasOrigin = git remote | Select-String -Pattern "^origin$" -Quiet
if ($hasOrigin) {
  git remote set-url origin $RepoUrl
} else {
  git remote add origin $RepoUrl
}

# Push.
git push -u origin main

Write-Host "Push complete."
