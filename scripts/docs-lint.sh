#!/usr/bin/env bash
#
# docs-lint: project-locked copy conventions enforced at pre-commit + CI.
#
# Per CLAUDE.md project conventions and step 9 design review section
# "Copy conventions". Three checks:
#
#   1. EM-DASH ZERO     -- FAIL on any U+2014 character in tracked content.
#   2. BRITISH ENGLISH  -- FAIL on American spellings in user-facing strings
#                          (.ts and .tsx files). Markdown docs are exempt
#                          because rule documentation legitimately quotes
#                          American forms as anti-examples; reviewer-judged.
#                          className="..." attributes are stripped before
#                          the scan to avoid false positives on Tailwind
#                          utility classes (text-center, transition-colors).
#   3. AI-SLOP          -- WARN on common LLM prose patterns. Scoped to
#                          .ts, .tsx, and .md. Markdown rule-docs may
#                          legitimately contain the blacklist words as
#                          rule references; WARN is non-blocking.
#
# Pre-commit (via simple-git-hooks) and CI (.github/workflows/docs-lint.yml)
# run the same script. Local --no-verify works for emergencies; CI
# re-catches.
#
# Output: monospace, column-aligned, no emoji, direct voice.
#
# The em-dash literal in this script source is constructed at runtime
# from its UTF-8 byte sequence (printf with hex escapes). The script
# file itself contains zero U+2014 characters and never trips its own
# check.

set -u

# Em-dash codepoint U+2014, constructed at runtime from its UTF-8
# bytes (E2 80 94). Source has no literal em dash anywhere.
EM_DASH=$(printf '\xe2\x80\x94')

# Paths to scan.
ROOTS=("src" "docs" "plans" "scripts")
ROOT_FILES=("DESIGN.md" "README.md" "CLAUDE.md" "CHANGELOG.md")

RED=$'\033[31m'
YELLOW=$'\033[33m'
RESET=$'\033[0m'
NC_RED="FAIL"
NC_YELLOW="WARN"

if [[ "${NO_COLOR:-}" == "1" || ! -t 1 ]]; then
  RED=""
  YELLOW=""
  RESET=""
fi

EXIT_CODE=0
HAS_WARN=0

# ----------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------

# List tracked content files matching the given extensions, excluding build
# artefacts. Echoes paths one per line.
collect_targets() {
  local extensions=("$@")
  local pattern_args=()
  for ext in "${extensions[@]}"; do
    pattern_args+=(--include="*.$ext")
  done

  local roots_present=()
  for r in "${ROOTS[@]}"; do
    if [[ -d "$r" ]]; then
      roots_present+=("$r")
    fi
  done

  local root_files_present=()
  for f in "${ROOT_FILES[@]}"; do
    if [[ -f "$f" ]]; then
      root_files_present+=("$f")
    fi
  done

  if [[ ${#roots_present[@]} -gt 0 ]]; then
    grep -rln "${pattern_args[@]}" --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=playwright-report --exclude-dir=test-results "" "${roots_present[@]}" 2>/dev/null || true
  fi
  for f in "${root_files_present[@]}"; do
    local match=0
    for ext in "${extensions[@]}"; do
      if [[ "$f" == *.$ext ]]; then
        match=1
        break
      fi
    done
    [[ $match -eq 1 ]] && echo "$f"
  done
}

# ----------------------------------------------------------------------------
# Check 1: em-dash zero
# ----------------------------------------------------------------------------

emdash_check() {
  local files
  files=$(collect_targets ts tsx js jsx mjs md css json yaml yml sh)
  local hit=0
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    local matches
    matches=$(grep -n -- "$EM_DASH" "$f" 2>/dev/null || true)
    if [[ -n "$matches" ]]; then
      while IFS= read -r line; do
        local lineno
        lineno=$(echo "$line" | cut -d: -f1)
        printf "  %-50s %s\n" "${f}:${lineno}" "unexpected em dash (U+2014)"
        hit=$((hit + 1))
      done <<< "$matches"
    fi
  done <<< "$files"

  if [[ $hit -gt 0 ]]; then
    printf "%sdocs-lint: %s%s  em-dash zero\n" "$RED" "$NC_RED" "$RESET"
    printf "  %d em-dash occurrence(s) found.\n" "$hit"
    printf "  Substitutions per grammatical role:\n"
    printf "    apposition  -> colon (:)\n"
    printf "    list        -> comma (,)\n"
    printf "    clause join -> semicolon (;)\n"
    printf "    sentence    -> period (.)\n"
    printf "    aside       -> parentheses ( )\n"
    printf "  See DESIGN.md \"Copy conventions / No em dash\".\n\n"
    EXIT_CODE=1
  fi
}

# ----------------------------------------------------------------------------
# Check 2: British English
# ----------------------------------------------------------------------------
#
# Scoped to .ts and .tsx (UI strings + email templates). Strips
# className="..." attributes before scanning so Tailwind utility classes
# (text-center, transition-colors) don't trip false positives. Code-comment
# lines (starting with whitespace + //) are skipped.

british_check() {
  local files
  files=$(collect_targets ts tsx)
  local pattern='\b(color|colors|center|centers|behavior|behaviors|organize|organizes|organizing|organized|recognize|recognizes|recognized|analyze|analyzes|analyzed|apologize|apologizes|apologized|favorite|favorites)\b'
  local hit=0
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    # Strip className="..." attributes (single-line); keep line numbers.
    # Skip lines starting with optional whitespace + //.
    local matches
    matches=$(sed -E 's/className="[^"]*"//g' "$f" \
      | grep -nE -- "$pattern" 2>/dev/null \
      | grep -vE '^[0-9]+:\s*//' || true)
    if [[ -n "$matches" ]]; then
      while IFS= read -r line; do
        local lineno
        lineno=$(echo "$line" | cut -d: -f1)
        local content
        content=$(echo "$line" | cut -d: -f2-)
        local word
        word=$(echo "$content" | grep -oE -- "$pattern" | head -1)
        printf "  %-50s American spelling: %s\n" "${f}:${lineno}" "\"$word\""
        hit=$((hit + 1))
      done <<< "$matches"
    fi
  done <<< "$files"

  if [[ $hit -gt 0 ]]; then
    printf "%sdocs-lint: %s%s  British English\n" "$RED" "$NC_RED" "$RESET"
    printf "  %d American-spelling occurrence(s) in user-facing strings.\n" "$hit"
    printf "  Use British: programme, organise, centre, behaviour, colour, recognised, analyse, apologise, favourite.\n"
    printf "  className=\"...\" Tailwind classes are excluded by the preprocessor.\n"
    printf "  Code-comment lines (//) are excluded by heuristic.\n"
    printf "  Markdown rule-doc anti-examples are out of scope; reviewer-judged.\n\n"
    EXIT_CODE=1
  fi
}

# ----------------------------------------------------------------------------
# Check 3: AI-slop warning
# ----------------------------------------------------------------------------

slop_check() {
  local files
  files=$(collect_targets ts tsx md)
  local pattern='\b(dive deep|robust|leverage|comprehensive solution|seamless|cutting-edge|best-in-class|revolutionary|unleash|empower|elevate|game-changer)\b'
  local hit=0
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    local matches
    matches=$(grep -niE -- "$pattern" "$f" 2>/dev/null || true)
    if [[ -n "$matches" ]]; then
      while IFS= read -r line; do
        local lineno
        lineno=$(echo "$line" | cut -d: -f1)
        local content
        content=$(echo "$line" | cut -d: -f2-)
        local word
        word=$(echo "$content" | grep -oiE -- "$pattern" | head -1)
        printf "  %-50s AI-slop word: %s\n" "${f}:${lineno}" "\"$word\""
        hit=$((hit + 1))
      done <<< "$matches"
    fi
  done <<< "$files"

  if [[ $hit -gt 0 ]]; then
    printf "%sdocs-lint: %s%s  AI-slop vocabulary\n" "$YELLOW" "$NC_YELLOW" "$RESET"
    printf "  %d match(es). Commit will proceed; this is a warning, not a failure.\n" "$hit"
    printf "  Replace where applicable with: use, rely on, build on, fast, full, or remove.\n"
    printf "  Words can appear in legitimate quoted-source text or rule-doc anti-examples; author decides per match.\n\n"
    HAS_WARN=1
  fi
}

# ----------------------------------------------------------------------------
# Run all checks
# ----------------------------------------------------------------------------

emdash_check
british_check
slop_check

if [[ $EXIT_CODE -ne 0 ]]; then
  echo "docs-lint: at least one check FAILED. Commit blocked."
  exit 1
fi

if [[ $HAS_WARN -ne 0 ]]; then
  echo "docs-lint: passed with warnings."
  exit 0
fi

echo "docs-lint: all checks passed."
exit 0
