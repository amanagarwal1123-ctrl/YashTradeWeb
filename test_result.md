#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================
user_problem_statement: "Apply WEBSITE_PRIVACY_UPDATE.md + GOOGLE_PLAY_DATA_SAFETY.md handoff (14 Sep 2026): align /privacy wording, make /delete-account show distinct states (app erased / website cleaned+acknowledged → deletion complete / provider copies NOT erased), and make the D4 deletion consumer acknowledge only after verified website-local cleanup under the new contract required_acknowledgements=['website']. Pin app contract 281067b. Test the deletion journey end to end (mocked SMS only)."

backend:
  - task: "D4 deletion consumer + /delete/confirm outcome fields (website_acknowledged, deletion_complete, awaiting_other_consumers, provider_copies_erased)"
    implemented: true
    working: true
    file: "backend/bff/routes.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "consume_deletions returns acknowledged_events/completed_events/awaiting_other_consumers; cleanup_event re-counts WEBSITE_OWNED rows and returns 'blocked' if any residual; ack only after verified cleanup. Verified by pytest: deletion grant test + D4 cursor test (140 events incl. 3 website-only contract events → completed=3, legacy events stay pending globally) + winback tests."
  - task: "Public config privacy_updated=2026-09-14, deletion_url, privacy_url"
    implemented: true
    working: true
    file: "backend/bff/routes.py"
    stuck_count: 0
    priority: "low"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "GET /api/public/config now returns privacy_updated 2026-09-14 + canonical deletion_url/privacy_url."

frontend:
  - task: "Privacy policy replacement wording (AI, staff uploads, deletion, staff/review accounts, providers table, pending owner facts)"
    implemented: true
    working: true
    file: "frontend/src/pages/Privacy.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "19 sections; effective 14 September 2026; no [OWNER:…] placeholders rendered — unconfirmed hosting facts rendered as data-testid=privacy-pending-fact italic text. Browser journey asserts wording."
  - task: "Delete-account outcome states (DeletionOutcome: app / website / providers / kept rows)"
    implemented: true
    working: true
    file: "frontend/src/pages/DeleteAccount.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "testids deletion-result-heading, deletion-reference, deletion-app-status, deletion-website-status (ok when acknowledged, pending otherwise), deletion-awaiting (legacy consumers), deletion-provider-status (warn: NOT erased), deletion-kept, deletion-winback-kept, deletion-policy-link. Browser journey asserts 'Your account has been deleted' + 'deletion recorded as complete'."
  - task: "Winback console: refresh table before closing editor"
    implemented: true
    working: true
    file: "frontend/src/pages/admin/Winback.js"
    stuck_count: 0
    priority: "low"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "act() now reloads contacts/churn before hiding the editor so the status column is fresh when the dialog closes (fixed a race seen in the browser journey)."

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 21
  run_ui: true

test_plan:
  current_focus:
    - "D4 deletion consumer + /delete/confirm outcome fields"
    - "Delete-account outcome states"
    - "Privacy policy replacement wording"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: "Run the isolated suite: `cd /app && PYMUPDF_MESSAGE=fd:2 python -m pytest -q -p no:warnings` (expects 118 passed incl. the browser journey; Playwright chromium is installed at /pw-browsers, reinstall with `python -m playwright install chromium` if missing). Preview UI is intentionally fail-closed for OTP (placeholder keys) — do NOT try real OTPs; E2E deletion must be exercised through the isolated fixtures in tests/shared_v1 (test_bff_followup_core_regressions.py::test_deletion…, test_bff_winback.py, browser journey). Never touch 9999813334."
