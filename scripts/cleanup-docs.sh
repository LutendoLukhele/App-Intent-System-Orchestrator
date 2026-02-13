#!/bin/bash
# cleanup-docs.sh - Archive implementation notes, keep only essentials in root

set -e

ARCHIVE_DIR=".archive/implementation-notes"
mkdir -p "$ARCHIVE_DIR"

# Files to KEEP in root (essential docs)
KEEP_FILES=(
  "README.md"
  "README_OPENSOURCE.md"  # Will become main README
  "ASO_PHILOSOPHY.md"     # Core philosophy
  "CONTRIBUTING.md"       # Contribution guide
  "LICENSE.md"            # License
)

# Move implementation notes to archive
echo "📦 Archiving implementation notes..."

# All *_FIX*.md, *_COMPLETE*.md, *_STATUS*.md, *_CHECKLIST*.md files
for pattern in "*_FIX*.md" "*_COMPLETE*.md" "*_STATUS*.md" "*_CHECKLIST*.md" "*_SUMMARY*.md" "*_IMPLEMENTATION*.md" "*_TESTING*.md" "*_REPORT*.md"; do
  for file in $pattern; do
    if [[ -f "$file" ]]; then
      # Check if it's in keep list
      keep=false
      for keep_file in "${KEEP_FILES[@]}"; do
        if [[ "$file" == "$keep_file" ]]; then
          keep=true
          break
        fi
      done
      
      if [[ "$keep" == "false" ]]; then
        echo "  → $file"
        mv "$file" "$ARCHIVE_DIR/" 2>/dev/null || true
      fi
    fi
  done
done

# Archive specific verbose docs
ARCHIVE_EXPLICIT=(
  "CACHE_TOOLS_VERIFICATION.md"
  "CACHED_ENTITY_INJECTION.md"
  "CORTEX_CHECKLIST.md"
  "CORTEX_INTEGRATION_CHECKLIST.md"
  "CORTEX_PERFORMANCE_ANALYSIS.md"
  "CORTEX_TESTING_PLAN.md"
  "CRM_ENTITY_CACHING_IMPLEMENTATION.md"
  "DATA_FLOW_ARCHITECTURE.md"
  "DATE_FORMATTING_FIX.md"
  "DOCUMENTATION_INDEX.md"
  "EMAIL_ANALYSIS_FIX.md"
  "EMAIL_COMPRESSION_ALIGNMENT.md"
  "ENHANCEMENTS_IMPLEMENTED.md"
  "FILTER_IMPLEMENTATION_GUIDE.md"
  "FIXES_NAVIGATION.md"
  "GMAIL_SYNC_FIX.md"
  "GMAIL_THREAD_MIGRATION.md"
  "HEADLESS_TESTING_COMPLETE.md"
  "HEADLESS_TESTING_DELIVERABLE.md"
  "HEADLESS_TESTING_GUIDE.md"
  "HEADLESS_TESTING_INDEX.md"
  "HEADLESS_TESTING_QUICK_REFERENCE.md"
  "HEADLESS_TESTING_SETUP.md"
  "LOG_MONITORING_GUIDE.md"
  "MASTER_PLAN.md"
  "MONOREPO_RELEASE_SUMMARY.md"
  "PAYMENT_SYSTEM_FLOW.md"
  "PAYMENT_SYSTEM_STATUS.md"
  "PERFORMANCE_ANALYSIS.md"
  "PERFORMANCE_TESTS_UPDATED.md"
  "PHASE_1_AUDIT_REPORT.md"
  "PHASE_1_COMPLETE.md"
  "PHASE_2_IMPLEMENTATION_GUIDE.md"
  "PHASE2_TESTING_ROADMAP.md"
  "PRACTICAL_IMPLEMENTATION_GUIDE.md"
  "PRE_LAUNCH_CHECKLIST.md"
  "PRODUCTION_INTEGRATION.md"
  "PROJECT_COMPLETE.md"
  "QUICK_INTEGRATION_REFERENCE.md"
  "QUICK_REFERENCE_CARD.md"
  "QUICK_REFERENCE.md"
  "README_INTEGRATION_DOCS.md"
  "README_MONOREPO.md"
  "SALESFORCE_PROVIDER_FIX.md"
  "SALESFORCE_TESTING_COMPLETE.md"
  "STRIPE_TESTING_GUIDE.md"
  "SUCCESS_PAGE_DOCUMENTATION_INDEX.md"
  "SUCCESS_PAGE_INTEGRATION.md"
  "SUCCESS_PAGE_QUICK_REFERENCE.md"
  "SUMMARY.md"
  "TEST_PROVIDER_CONFIG_STATUS.md"
  "TEST_REPORT.md"
  "TEST_RESULTS_SUMMARY.md"
  "TEST_SCENARIOS.md"
  "TEST_SUITE_STATUS.md"
  "TESTING_FRAMEWORK_PATTERNS.md"
  "UI_INTEGRATION_CHECKLIST.md"
  "UI_INTEGRATION_CONTRACT.md"
  "CORTEX_IMPLEMENTATION.md"
  "CORTEX_INTEGRATION_COMPLETE.md"
  "CORTEX_INTENT_FIRST_ARCHITECTURE.md"
  "CORTEX_QUICK_START.md"
  "CORTEX_WEBHOOK_ARCHITECTURE.md"
  "DEPLOYMENT_CHECKLIST.md"
)

for file in "${ARCHIVE_EXPLICIT[@]}"; do
  if [[ -f "$file" ]]; then
    echo "  → $file"
    mv "$file" "$ARCHIVE_DIR/" 2>/dev/null || true
  fi
done

echo ""
echo "✅ Cleanup complete!"
echo ""
echo "📁 Archived to: $ARCHIVE_DIR"
echo ""
echo "📄 Remaining in root:"
ls -1 *.md 2>/dev/null || echo "  (none)"
