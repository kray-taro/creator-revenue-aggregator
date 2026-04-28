# **PRODUCT REQUIREMENTS DOCUMENT (PRD)**

## **Creator Revenue Aggregator \- Phase 1**

---

## **DOCUMENT CONTROL**

| Field | Value |
| ----- | ----- |
| **Product Name** | Creator Revenue Aggregator |
| **Phase** | Phase 1 \- Foundation (Months 1-3) |
| **Document Owner** | Product Management |
| **Last Updated** | April 5, 2026 |
| **Status** | Draft for Engineering Review |
| **Target Launch** | Q3 2026 (90-day build cycle) |

---

## **EXECUTIVE SUMMARY**

### **Problem Statement**

Specialized bookkeepers managing creator economy clients spend **96 hours per month** on manual reconciliation work due to:

* Fragmented revenue data across 10+ platforms per client  
* Platform-specific fee structures that require manual reverse-engineering (e.g., YouTube's 45% cut buried in net payouts)  
* Timing gaps between "earned date" and "bank deposit date" (YouTube NET-60, Patreon monthly cycles)  
* Duplicate revenue entries when platforms share underlying processors (Gumroad via Stripe)  
* No audit trail linking QuickBooks entries to platform payout documentation

**Impact:** Bookkeepers cannot scale beyond 12 clients without hiring, limiting annual revenue to \~$180K when market demand exists for $250K+ practices.

### **Solution Overview**

Phase 1 delivers a **three-stage data pipeline** (Ingestion → Review → Sync) that:

1. Normalizes inconsistent platform data using Creator Revenue Standard (CRS) schema  
2. Provides human-in-the-loop approval gates with confidence-scored categorization  
3. Automatically tracks accrual timing gaps to eliminate "phantom receivable" spreadsheets  
4. Generates immutable audit documentation (receipt snapshots) to survive platform URL changes  
5. Enables multi-client management from a unified dashboard

### **Success Metrics (Phase 1 Exit Criteria)**

| Metric | Baseline (Pre-Tool) | Phase 1 Target | Measurement Method |
| ----- | ----- | ----- | ----- |
| **Reconciliation Time per Client** | 8 hours/month | \<4 hours/month | Time-tracking survey (beta cohort) |
| **Bank Reconciliation Match Rate** | 78% (manual) | \>95% automated | System logs (amount ± $1, date ± 5 days) |
| **Categorization Accuracy** | N/A | \>90% (high-confidence) | Human override rate in Review Queue |
| **OAuth Uptime** | N/A | \>98% | Token health monitoring logs |
| **Duplicate Revenue Incidents** | 8/month (per bookkeeper) | \<1/month | User-reported flags in beta |

---

## **STRATEGIC CONTEXT**

### **Target User: Primary Persona**

**Sarah Chen** \- Specialized Creator Economy Bookkeeper

* Manages 12 creator clients (average 4-6 platforms each)  
* Currently at capacity: turns away 2-3 leads/month  
* Goal: Scale to 20-25 clients solo by reclaiming 68-92 hours/month  
* Revenue model: $600-1,200/month retainer per client  
* Decision criteria: Trust/control \> speed; will not adopt "black-box" automation

### **User Journey (Current State \- Pre-Tool)**

**Monday Morning (90 min):** Chasing OAuth re-authorizations, managing 47 browser tabs  
 **Tuesday-Thursday (18-24 hrs):** Manual CSV downloads, Excel revenue calculators, phantom receivable tracking  
 **Friday (3-4 hrs):** Duplicate detective work (Stripe vs. platform-native entries)  
 **Week 2-3 (48-72 hrs):** QuickBooks data entry, categorization anxiety  
 **Week 4 (24-36 hrs):** Bank reconciliation, client explanations ("Why don't the numbers match?")

### **Competitive Landscape**

**QuickBooks/Xero:** Horizontal tools; no creator-specific logic (platform fees, timing gaps, processor deduplication)  
 **Zapier/IFTTT:** Brittle OAuth, no approval gates, no deduplication, breaks within 90 days  
 **Previous Integration Tools (Why They Failed):**

* Treated QuickBooks as writable (destructive rollbacks broke reconciliations)  
* Silent OAuth expiration (integrations died without warning)  
* Auto-categorized blindly (bookkeepers couldn't trust output)  
* No processor awareness (Stripe revenue counted 2-3x)

**Our Differentiation:**

* **Trust Moat:** Approval workflow \+ COA control (bookkeeper retains professional liability protection)  
* **Reliability Moat:** Proactive token health monitoring (prevents OAuth death spiral)  
* **Data Quality Moat:** CRS schema \+ deduplication logic (years of operational learning baked in)

---

## **PHASE 1 SCOPE**

### **IN SCOPE (Must-Have for Phase 1\)**

#### **1\. PLATFORM INTEGRATIONS (Big 5\)**

* YouTube AdSense API (OAuth 2.0, read-only revenue scopes)  
* Patreon API v2 (creator account, pledge \+ payout endpoints)  
* Gumroad API (product sales, licenses)  
* Substack API (paid subscriptions)  
* Shopify API (for product-selling creators)  
* Stripe API (processor layer with deduplication flags)

**Deliverable:** OAuth connection flow, daily token health pings, API adapters for each platform

#### **2\. CREATOR REVENUE STANDARD (CRS) SCHEMA**

Normalized data model mapping inconsistent platform outputs to unified structure:

| CRS Field | YouTube Source | Patreon Source | Stripe Source | Transformation Logic |
| ----- | ----- | ----- | ----- | ----- |
| gross\_revenue | Calculated | patron\_pledge\_amount | amount (tax-stripped) | YouTube: net ÷ 0.55 |
| platform\_fee | Calculated | processing\_fees | stripe\_fee | YouTube: gross × 0.45 |
| net\_payout | total\_earnings | payout\_amount | net\_amount | Actual bank deposit amount |
| platform\_id | payout\_id | payout\_guid | transfer\_id | Links to receipt snapshot |
| deduplication\_hash | Generated | Generated | Generated | Hash(amount, date, platform, desc) |
| source\_hierarchy | primary | primary | processor | Auto-exclude Stripe if native platform exists |

**Deliverable:** Database schema, platform-specific adapters, transformation pipeline

#### **3\. RECEIPT SNAPSHOTTING (Audit-Proof Documentation)**

**Problem Solved:** Platform "link rot" (Patreon URL changes, API shutdowns) breaks audit trails

**Technical Spec:**

* At time of API data pull, generate static PDF/image of platform payout summary  
* Include: Platform logo, payout ID, date range, gross/fees/net breakdown, line items  
* Store in encrypted S3 bucket with 7-year retention (IRS audit window)  
* Attach as QuickBooks "Document Link" (using QB API Attachable endpoint)  
* Accessible via "View Source" button in Review Queue

**Deliverable:** PDF generation service, S3 integration, QB attachment API integration

#### **4\. HUMAN-IN-THE-LOOP REVIEW QUEUE**

**Three-Tab Interface:**

**GREEN TAB (High Confidence ≥95%)**

* Transactions matching historical patterns (e.g., "YouTube Super Chat" matched 89 prior instances)  
* Displays: Transaction count, total amount, "Bulk Approve All" button  
* Shows confidence reasoning: "Pattern match: 95% | Amount variance: \<2% | Category: YouTube AdSense"  
* Audit log: Tracks who approved what, when

**YELLOW TAB (Needs Review)**

* First-time revenue sources (e.g., "TikTok Creator Fund detected—map to QB account")  
* Potential duplicates (e.g., "$500 in Gumroad \+ $500 in Stripe on same date—select primary")  
* Amount variances (e.g., "Expected $1,200, platform shows $1,180—investigate refund?")  
* Category uncertainty (\<95% confidence)

**RED TAB (Errors)**

* OAuth token expired/expiring (e.g., "YouTube auth expires in 5 days—renewal sent to client")  
* API failures (e.g., "Patreon API timeout—retry scheduled")  
* Data integrity issues (e.g., "Gross \- Fees ≠ Net by \>$1—manual correction required")

**Deliverable:** React-based dashboard, confidence scoring engine, bulk approval workflow, override tracking

#### **5\. MULTI-CLIENT DASHBOARD (Practice-Level View)**

**Single-Pane-of-Glass Design:**

┌─────────────────────────────────────────────────────────────┐  
│ Sarah's Dashboard \- March 2026                             │  
├─────────────────────────────────────────────────────────────┤  
│ Client A (Jane Doe)         23 Pending   \[Approve All\]      │  
│ ├─ YouTube: 15 ✓ | Patreon: 8 ⚠                            │  
│                                                              │  
│ Client B (John Smith)       ✓ Synced (Mar 1-31)             │  
│                                                              │  
│ Client C (Emma Lee)         🔴 3 Errors \- OAuth Expiring    │  
│ ├─ Patreon: Auth expires Apr 10 \[Send Renewal\]             │  
│                                                              │  
│ \[Bulk Actions\] ▼                                            │  
│ • Approve all high-confidence (All 12 clients)              │  
│ • Download combined March report (CSV)                      │  
│ • Send OAuth renewal reminders (3 clients)                  │  
└─────────────────────────────────────────────────────────────┘

**Features:**

* Unified search: "Show all Stripe payouts \>$500 across clients"  
* Token health hub: See all platform connections, expiration dates at-a-glance  
* Batch re-authentication: One-click renewal reminder to multiple clients  
* Activity feed: "Client B authorized Substack 2 hours ago"

**Deliverable:** Multi-tenant database architecture, React dashboard, unified search API

#### **6\. ACCRUAL ENGINE (Phantom Receivable Automation)**

**Dual-Mode Logic:**

**ACCRUAL MODE (Default for Professional Bookkeepers):**

March 15: YouTube reports $1,000 earned  
→ System creates (in staging, pre-approval):  
   DR Accounts Receivable \- YouTube ($1,000)  
   CR Revenue \- AdSense ($1,000)

April 21: Bank deposit $1,000 detected (via Plaid/bank feed or manual match)  
→ System proposes (in Review Queue):  
   DR Bank ($1,000)  
   CR Accounts Receivable \- YouTube ($1,000)

**CASH MODE (Simplified Alternative):**

March 15: YouTube reports $1,000 earned  
→ Held in "Pending Revenue Queue" (no QB entry yet)

April 21: Bank deposit $1,000 detected  
→ System proposes:  
   DR Bank ($1,000)  
   CR Revenue \- AdSense ($1,000) \[dated April 21\]

**Platform Payout Calendar Database:**

| Platform | Payout Schedule | Example |
| ----- | ----- | ----- |
| YouTube | NET-60 | March earnings → April 21 deposit |
| Patreon | 5th of month | March pledges → April 5 deposit |
| Stripe | Rolling 2-7 days | Variable by account settings |
| Gumroad | Weekly (Friday) | Mon-Sun sales → Friday deposit |
| Substack | 1st of month | March subs → April 1 deposit |

**Deliverable:** Accrual/cash mode toggle (per client), payout calendar table, A/R creation/clearance logic, bank deposit matching algorithm

#### **7\. QUICKBOOKS INTEGRATION (Append-Only Sync)**

**Critical Design Principles:**

* **QuickBooks is Source of Truth:** Tool is feeder system, never destructive  
* **Append-only sync:** No deletions, no rollbacks  
* **Idempotent transactions:** Duplicate detection before sync (check for existing transaction ID fingerprint)  
* **Void-and-Replace workflow:** If error discovered post-sync, bookkeeper voids in QB → tool detects void → flags for correction in Review Queue → new entry syncs

**API Endpoints Used:**

* /invoice \- Create revenue entries  
* /bill \- Create expense entries (platform fees)  
* /journalentry \- Create A/R tracking entries  
* /attachable \- Attach receipt snapshots  
* /query \- Read-back verification (detect voids, reconciliations)

**Deliverable:** QB OAuth integration, sync engine, read-back monitoring, void detection

#### **8\. FLEXIBLE CHART OF ACCOUNTS (COA) MAPPING**

**Problem Solved:** Every bookkeeper organizes accounts differently

**Onboarding Flow:**

1. Tool suggests categories (e.g., "YouTube AdSense Revenue")  
2. Bookkeeper maps to existing QB account (e.g., "4100 \- Advertising Income")  
3. System stores mapping: youtube\_adsense → QB Account 4100  
4. All future YouTube transactions auto-map to 4100  
5. Override capability: Bookkeeper can change mapping anytime; system learns from override

**First-Time Revenue Source Handling:**

* New platform detected (e.g., "TikTok Creator Fund")  
* Flagged in Yellow tab: "Map TikTok to which QB account?"  
* Bookkeeper selects from dropdown of their existing COA  
* Mapping saved for all future TikTok transactions

**Deliverable:** COA onboarding wizard, mapping storage (PostgreSQL), override learning loop

#### **9\. OAUTH HEALTH MONITORING (Proactive Token Management)**

**Daily Health Checks:**

* System pings each platform's auth endpoint: GET /oauth/validate  
* Logs token status: Valid | Expiring (\<30 days) | Expired

**Expiration Warning Workflow:**

* **Day 30:** Auto-email to client: "Your YouTube connection expires in 30 days—\[Renew Now\]"  
* **Day 14:** Second reminder (email \+ in-app notification to bookkeeper)  
* **Day 7:** Final warning (email to client \+ bookkeeper)  
* **Day 0 (expired):** Transactions flagged "Pending \- Auth Required" in Red tab

**One-Click Renewal Flow (Auth Proxy Portal):**

1. Client clicks email link → Directed to Auth Proxy Portal (standalone secure environment)  
2. Platform's native OAuth screen loads (Google/YouTube, Patreon login)  
3. Client authenticates on their device (bookkeeper never sees passwords/2FA)  
4. Token returned to system, encrypted at rest  
5. Dashboard updates: Red → Green status  
6. Automatic backfill: Pull missing data from expiration period

**Deliverable:** Token health cron job, email notification service, Auth Proxy Portal (React app), backfill logic

#### **10\. DEDUPLICATION INTELLIGENCE**

**Problem Solved:** Platforms using shared processors (e.g., Buy Me a Coffee → Stripe) create duplicate revenue entries

**Technical Implementation:**

* **Source Hierarchy Field:** Mark platforms as primary or processor  
  * Primary: Gumroad, Buy Me a Coffee, Stan Store  
  * Processor: Stripe (when used by another platform)  
* **Deduplication Fingerprint:** Hash of (amount, date, platform, description)  
  * Example: Hash(500.00, 2026-03-15, Gumroad, Product: Guide to YouTube) \= a3f2c9...  
* **Matching Logic:**  
  * Pull Gumroad transaction: Fingerprint \= a3f2c9...  
  * Pull Stripe transaction: Fingerprint \= a3f2c9... (match detected)  
  * Check source hierarchy: Gumroad \= primary, Stripe \= processor  
  * **Action:** Auto-exclude Stripe entry, flag in Yellow tab: "Duplicate detected—kept Gumroad (primary source)"

**Deliverable:** Deduplication algorithm, source hierarchy database, flagging UI in Review Queue

---

### **OUT OF SCOPE (Phase 2+)**

**Features Deferred to Later Phases:**

* **Strategic Insights Export / Creator Health Scorecard** (Phase 2 \- Month 4-6)  
  * Rationale: Requires clean data foundation from Phase 1 first  
* **Contextual Client Explanations** ("Copy Explanation" feature) (Phase 2\)  
  * Rationale: Template system requires user feedback on most common scenarios  
* **Historical Backfill / "Wipe the Slate" Onboarding Tool** (Phase 2\)  
  * Rationale: Complex edge cases require beta user validation before build  
* **Additional Platform Integrations** (Ko-fi, Teachable, Thinkific) (Phase 3\)  
  * Rationale: Validate Big 5 reliability before expanding  
* **White-Label Client Portal** (Phase 3\)  
  * Rationale: Enterprise feature; focus on bookkeeper workflow first  
* **Real-Time Webhooks** (Phase 3\)  
  * Rationale: Monthly sync sufficient for MVP; webhooks add complexity

**Explicitly NOT Building:**

* Mobile app (web-only for Phase 1\)  
* Xero integration (QuickBooks only for MVP)  
* Tax filing automation (focus on data accuracy, not tax prep)  
* Client-facing revenue dashboards (bookkeeper-first, B2B2C later)

---

## **USER STORIES & ACCEPTANCE CRITERIA**

### **Epic 1: Platform Data Ingestion**

**US-101: OAuth Connection Setup**

* **As a** bookkeeper managing creator clients  
* **I want to** authenticate my clients' YouTube, Patreon, Gumroad, Substack, and Shopify accounts via OAuth  
* **So that** I can pull their revenue data automatically without managing passwords

**Acceptance Criteria:**

* \[ \] Bookkeeper clicks "Add Client" → Enters client name/email  
* \[ \] System emails client: "Your bookkeeper invited you—authorize platforms: \[YouTube\] \[Patreon\] \[Gumroad\] \[Substack\] \[Shopify\]"  
* \[ \] Client clicks platform button → OAuth popup → Native platform login screen  
* \[ \] After approval, token stored encrypted at rest with minimum required scopes (read-only revenue)  
* \[ \] Dashboard shows: "Client A: YouTube ✓, Patreon ✓, Gumroad ⏳ (pending auth)"  
* \[ \] Token refresh logic: Auto-refresh before expiration (YouTube: 90 days, Patreon: 1 year)

**Technical Notes:**

* OAuth libraries: passport.js for Node.js backend  
* Scopes required:  
  * YouTube: https://www.googleapis.com/auth/yt-analytics-monetary.readonly  
  * Patreon: campaigns.members pledges  
  * Stripe: read\_only scope  
* Encryption: AES-256 for token storage (PostgreSQL bytea column)

---

**US-102: Automated Revenue Data Pull**

* **As the** system  
* **I want to** automatically pull revenue data from connected platforms nightly (1st of month \+ daily incremental)  
* **So that** bookkeepers see up-to-date transactions without manual CSV downloads

**Acceptance Criteria:**

* \[ \] Cron job runs at 2 AM UTC on 1st of month (full pull for prior month)  
* \[ \] Daily incremental pulls at 2 AM UTC (catch late-posting transactions)  
* \[ \] For each platform:  
  * YouTube: Hit /youtube/v3/reports endpoint, filter earnings dimension  
  * Patreon: Hit /api/oauth2/v2/campaigns/{id}/pledges \+ /payouts  
  * Stripe: Hit /v1/balance\_transactions for prior month  
* \[ \] Raw API responses logged to S3 (compliance \+ debugging)  
* \[ \] Data transformed via CRS adapters → Stored in transactions table  
* \[ \] Error handling: Retry 3x with exponential backoff; if fail, flag in Red tab

**Technical Notes:**

* Job scheduler: node-cron or AWS EventBridge  
* Rate limiting: Respect platform limits (YouTube: 10K requests/day; throttle accordingly)  
* Idempotency: Check platform\_transaction\_id before inserting (avoid duplicates on retry)

---

**US-103: CRS Schema Normalization**

* **As the** ingestion pipeline  
* **I want to** transform inconsistent platform data into Creator Revenue Standard format  
* **So that** downstream logic (categorization, deduplication, A/R) operates on clean, unified data

**Acceptance Criteria:**

* \[ \] **YouTube Adapter:**  
  * Input: estimatedRevenue (net after 45% cut)  
  * Output CRS: gross\_revenue \= net ÷ 0.55, platform\_fee \= gross × 0.45, net\_payout \= input  
* \[ \] **Patreon Adapter:**  
  * Input: Separate pledges table (gross) \+ payouts table (net)  
  * Output CRS: Merge → gross\_revenue \= pledges, platform\_fee \= pledges \- payouts, net\_payout \= payouts  
* \[ \] **Stripe Adapter:**  
  * Input: amount, fee, net, tax (may be included in amount)  
  * Output CRS: Strip tax → gross\_revenue \= amount \- tax, platform\_fee \= fee, net\_payout \= net  
* \[ \] **Validation Rule:** For every transaction: gross\_revenue \- platform\_fee \= net\_payout (within $0.01 tolerance)  
* \[ \] Failed validation → Flagged in Red tab: "Data integrity error—manual review required"

**Technical Notes:**

* Adapter pattern: YouTubeAdapter.ts, PatreonAdapter.ts implementing IPlatformAdapter interface  
* Database: transactions table with CRS columns (gross\_revenue DECIMAL(10,2), etc.)  
* Unit tests: 50+ edge cases per adapter (refunds, currency conversion, partial payouts)

---

### **Epic 2: Audit-Proof Documentation**

**US-201: Receipt Snapshot Generation**

* **As a** bookkeeper  
* **I want** the system to auto-generate a static PDF snapshot of every platform payout at time of data pull  
* **So that** I have immutable audit documentation even if the platform changes URLs or shuts down APIs

**Acceptance Criteria:**

* \[ \] Immediately after API pull, generate PDF containing:  
  * Platform logo (YouTube, Patreon, etc.)  
  * Payout ID (YT-2026-03-15-ABC123)  
  * Date range covered (March 1-31, 2026\)  
  * Gross revenue, platform fees, net payout (from CRS)  
  * Line-item breakdown (if available: e.g., "AdSense: $800, Super Chat: $200")  
  * Timestamp: "Generated April 1, 2026 at 2:34 AM UTC"  
* \[ \] PDF stored in S3: s3://creator-aggregator-receipts/{client\_id}/{platform}/{year}/{month}/{payout\_id}.pdf  
* \[ \] 7-year retention policy (IRS audit window compliance)  
* \[ \] Encryption at rest: AES-256  
* \[ \] Access logging: Track who viewed which receipt (audit trail for bookkeeper's own compliance)

**Technical Notes:**

* PDF library: puppeteer (headless Chrome) or pdfkit (Node.js native)  
* Template: HTML → PDF rendering (easier to style vs. direct PDF generation)  
* S3 lifecycle policy: Auto-archive to Glacier after 2 years (cost optimization)

---

**US-202: QuickBooks Document Attachment**

* **As a** bookkeeper  
* **I want** receipt snapshots auto-attached to QuickBooks entries  
* **So that** I can access original payout documentation in one click during audits

**Acceptance Criteria:**

* \[ \] After transaction sync to QuickBooks, call QB API: POST /v3/company/{id}/attachable  
* \[ \] Attachment metadata:  
  * EntityRef: Link to QB transaction (Invoice, Journal Entry, etc.)  
  * FileName: YouTube\_Payout\_2026-03-15.pdf  
  * ContentType: application/pdf  
  * FileAccessUri: Signed S3 URL (24-hour expiration for security)  
* \[ \] In Review Queue, "View Source" button:  
  * Displays platform payout ID  
  * Shows QB entry ID (if synced)  
  * "Download Receipt PDF" button → Fetches from S3  
* \[ \] If QB API attachment fails (rare), store PDF link in transaction memo field as fallback

**Technical Notes:**

* QB API: Attachable endpoint (requires multipart/form-data upload)  
* Signed URLs: aws-sdk getSignedUrl() with 24-hour expiration  
* Error handling: If attachment fails, retry 2x; if still fails, log error but don't block sync

---

### **Epic 3: Human-in-the-Loop Review Queue**

**US-301: Confidence-Scored Categorization**

* **As the** categorization engine  
* **I want to** assign confidence scores to every transaction based on pattern matching  
* **So that** bookkeepers can bulk-approve high-confidence items and focus manual review on edge cases

**Acceptance Criteria:**

* \[ \] **Confidence Algorithm (Rule-Based \+ ML Hybrid):**  
  * **Phase 1 (Rule-Based Only):**  
    * Exact platform match: If platform \= youtube AND description CONTAINS 'AdSense' → Category: "YouTube AdSense" (95% confidence)  
    * Historical pattern: If last 10 YouTube transactions mapped to QB Account 4100 → Suggest 4100 (90% confidence)  
    * Amount variance: If expected $1,000 ± 2% → High confidence; \>10% variance → Flag Yellow  
  * **Phase 2 (Add ML):** Train classifier on bookkeeper overrides  
* \[ \] **Green Tab Logic:**  
  * Show transactions with ≥95% confidence  
  * Group by category: "YouTube AdSense (15 transactions, $8,240 total)"  
  * Display reasoning: "Pattern match: 95% | Last 10 mapped to Account 4100 | Amount variance: \<2%"  
* \[ \] **Yellow Tab Logic:**  
  * 80-94% confidence OR first-time revenue source OR potential duplicate  
* \[ \] **Red Tab Logic:**  
  * \<80% confidence OR validation errors OR OAuth failures

**Technical Notes:**

* Database: confidence\_score DECIMAL(3,2) column (0.00-1.00)  
* Pattern matching: PostgreSQL SIMILAR TO for description matching  
* Historical lookup: Query last 30 days of user overrides for same platform/client

---

**US-302: Bulk Approval Workflow**

* **As a** bookkeeper  
* **I want to** bulk-approve all high-confidence (Green) transactions with one click  
* **So that** I spend my time on edge cases (Yellow/Red) instead of repetitive approvals

**Acceptance Criteria:**

* \[ \] Green tab shows: "47 transactions ready for approval ($22,340 total)"  
* \[ \] "Bulk Approve All" button:  
  * Shows confirmation modal: "Approve 47 transactions? This will sync to QuickBooks."  
  * Checkbox: "I have reviewed the categorization and amounts" (required)  
  * "Approve" button (green) \+ "Cancel" button  
* \[ \] On approve:  
  * Mark all Green transactions as status \= approved  
  * Trigger sync to QuickBooks (see Epic 5\)  
  * Log audit trail: user\_id, timestamp, transaction\_ids, action \= bulk\_approved  
* \[ \] After approval, Green tab shows: "✓ 47 transactions synced to QuickBooks"  
* \[ \] Undo capability: 5-minute window to "Undo Bulk Approval" (before QB sync completes)

**Technical Notes:**

* Transaction: Atomic update of all 47 records (PostgreSQL BEGIN...COMMIT)  
* Audit log: Separate approval\_log table for compliance  
* Undo: Set status \= pending\_review \+ cancel pending QB sync jobs

---

**US-303: Yellow Tab Manual Review**

* **As a** bookkeeper  
* **I want to** review flagged transactions (Yellow tab) and either approve, edit, or reject them  
* **So that** I maintain control over edge cases before they hit QuickBooks

**Acceptance Criteria:**

* \[ \] Yellow tab shows categorized flags:  
  * "First-Time Revenue Sources (3)"  
  * "Potential Duplicates (2)"  
  * "Amount Variances (1)"  
* \[ \] **For First-Time Revenue:**  
  * Display: "TikTok Creator Fund \- $450 \- Map to QB account?"  
  * Dropdown: Bookkeeper's existing COA (pulled from QB API)  
  * "Save & Approve" button → Maps TikTok to selected account for all future transactions  
* \[ \] **For Potential Duplicates:**  
  * Display side-by-side: "Gumroad: $500 (Mar 15\) | Stripe: $500 (Mar 15)"  
  * Radio buttons: "Keep Gumroad (primary)" | "Keep Stripe" | "Keep Both (not duplicate)"  
  * "Save" button → Excludes non-selected entry, stores deduplication rule  
* \[ \] **For Amount Variances:**  
  * Display: "Expected $1,200 (based on Feb average) | Actual $1,180 (-1.7%)"  
  * Freeform note field: "Refund processed mid-month"  
  * "Approve Anyway" button  
* \[ \] Edited transactions move to Green tab for bulk approval

**Technical Notes:**

* COA dropdown: Cache QB chart of accounts (refresh daily)  
* Deduplication rules: Store in deduplication\_rules table (e.g., "Always prefer Gumroad over Stripe")  
* Notes: Store in transaction\_notes field (syncs to QB memo)

---

**US-304: Red Tab Error Handling**

* **As a** bookkeeper  
* **I want to** see all blocking errors (OAuth, validation) in one place  
* **So that** I can resolve issues before month-end close

**Acceptance Criteria:**

* \[ \] Red tab shows error categories:  
  * "OAuth Expiring Soon (2 clients)"  
  * "OAuth Expired (1 client)"  
  * "API Failures (0)"  
  * "Data Validation Errors (1)"  
* \[ \] **OAuth Expiring:**  
  * Display: "Client C \- Patreon expires Apr 10 (5 days) \[Send Renewal\]"  
  * "Send Renewal" button → Emails client with Auth Proxy Portal link  
* \[ \] **OAuth Expired:**  
  * Display: "Client A \- YouTube expired Mar 28\. 23 transactions pending."  
  * "Send Renewal" button (same as above)  
  * After client renews: Auto-backfill missing data, move transactions to Green/Yellow  
* \[ \] **Validation Errors:**  
  * Display: "Patreon payout: Gross ($1,000) \- Fees ($120) ≠ Net ($900). Diff: $20."  
  * "View Platform Data" button → Shows raw API response  
  * "Override & Approve" button → Logs manual intervention, proceeds with sync

**Technical Notes:**

* Email service: SendGrid or AWS SES  
* Backfill logic: Query platform API for date range \[expiration\_date, today\]  
* Manual override: Requires second confirmation (prevent accidental approvals)

---

### **Epic 4: Multi-Client Dashboard**

**US-401: Practice-Level Overview**

* **As a** bookkeeper managing 12+ clients  
* **I want to** see all clients' sync status on one screen  
* **So that** I don't waste 30 min/day logging in/out of individual client views

**Acceptance Criteria:**

* \[ \] Dashboard shows sortable table:  
  * Columns: Client Name | Pending Transactions | Synced Status | OAuth Health | Last Sync Date  
  * Example rows:  
    * "Client A | 23 | ⚠ Review Needed | ✓ All Connected | Apr 1, 2026"  
    * "Client B | 0 | ✓ Synced | ✓ All Connected | Apr 1, 2026"  
    * "Client C | 15 | 🔴 Auth Expired | Patreon Expired | Mar 28, 2026"  
* \[ \] Click client name → Drill down to client-specific Review Queue (Green/Yellow/Red tabs)  
* \[ \] Color coding:  
  * Green row \= All synced, no issues  
  * Yellow row \= Pending reviews (Yellow tab items)  
  * Red row \= Blocking errors (Red tab items)

**Technical Notes:**

* Database query: Aggregate counts by client (COUNT(\*) WHERE status \= pending GROUP BY client\_id)  
* Caching: Refresh counts every 5 minutes (reduce DB load)  
* Pagination: Show 20 clients per page (scalable to 50+ clients in future)

---

**US-402: Bulk Actions Across Clients**

* **As a** bookkeeper  
* **I want to** perform actions across multiple clients simultaneously  
* **So that** I can close all 12 clients' books in one workflow instead of 12 separate workflows

**Acceptance Criteria:**

* \[ \] "Bulk Actions" dropdown on dashboard:  
  * "Approve all high-confidence (All clients)" → Triggers bulk approve for every client's Green tab  
  * "Download combined report (CSV)" → Exports all transactions for all clients (filtered by date range)  
  * "Send OAuth renewal reminders" → Emails clients with expiring tokens (\<14 days)  
* \[ \] **Approve All:**  
  * Shows confirmation: "Approve 237 transactions across 12 clients? This will sync to 12 QuickBooks accounts."  
  * Progress bar: "Syncing... Client A (✓) | Client B (✓) | Client C (⏳)"  
  * Final summary: "✓ 237 transactions synced. 3 errors (see Red tab)."  
* \[ \] **Combined Report:**  
  * CSV columns: Client Name, Platform, Transaction Date, Gross, Fees, Net, Category, QB Account, Sync Status  
  * Use case: Import into Excel pivot table for practice-wide revenue analysis

**Technical Notes:**

* Background jobs: Queue approval tasks (don't block UI)  
* Progress tracking: WebSocket or polling endpoint (GET /bulk-approval/status/{job\_id})  
* CSV generation: Stream to S3, return signed URL (handle large exports)

---

**US-403: Unified Search**

* **As a** bookkeeper  
* **I want to** search across all clients' transactions  
* **So that** I can answer cross-client questions like "Show all Stripe payouts \>$500 this quarter"

**Acceptance Criteria:**

* \[ \] Search bar at top of dashboard  
* \[ \] Example queries:  
  * "Stripe \>500" → Returns all Stripe transactions \>$500 across all clients  
  * "Client A March" → Returns all Client A transactions from March  
  * "Duplicate" → Returns all flagged duplicates (Yellow tab items)  
* \[ \] Search results table:  
  * Columns: Client, Platform, Date, Amount, Status, Actions (View, Edit)  
  * Click row → Opens transaction detail modal  
* \[ \] Filters: Platform (dropdown), Date range (picker), Amount range (sliders), Status (Green/Yellow/Red)

**Technical Notes:**

* Full-text search: PostgreSQL tsvector \+ GIN index on description field  
* Query optimization: Limit results to 100 (paginate for large result sets)  
* Saved searches: Allow bookkeeper to save "Stripe \>500" as "High-Value Stripe Payouts" (Phase 2 feature)

---

### **Epic 5: Accrual Engine & QuickBooks Sync**

**US-501: Dual-Mode Accounting (Accrual vs. Cash)**

* **As a** bookkeeper  
* **I want to** choose accrual or cash accounting per client  
* **So that** I can match each client's tax election and CPA preferences

**Acceptance Criteria:**

* \[ \] Client settings: "Accounting Method" radio buttons (Accrual | Cash)  
* \[ \] **Accrual Mode Workflow:**  
  * Mar 15: YouTube reports $1,000 earned  
  * System creates (in Review Queue, pending approval):  
    * Entry 1: DR Accounts Receivable \- YouTube ($1,000) / CR Revenue \- AdSense ($1,000) \[dated Mar 15\]  
  * Apr 21: Bank deposit $1,000 detected (via manual match or Plaid integration)  
  * System creates:  
    * Entry 2: DR Bank ($1,000) / CR A/R \- YouTube ($1,000) \[dated Apr 21\]  
  * Approval required for both entries (appears in Green tab on respective dates)  
* \[ \] **Cash Mode Workflow:**  
  * Mar 15: YouTube reports $1,000 earned → Held in "Pending Revenue Queue" (no QB entry)  
  * Apr 21: Bank deposit $1,000 detected  
  * System creates: DR Bank ($1,000) / CR Revenue \- AdSense ($1,000) \[dated Apr 21\]  
  * Only one entry, only one approval needed

**Technical Notes:**

* Mode stored in clients table (accounting\_mode ENUM('accrual', 'cash'))  
* A/R creation: Use QB JournalEntry endpoint (not Invoice, since no customer involved)  
* Matching logic: See US-502

---

**US-502: Bank Deposit Matching (Smart Reconciliation)**

* **As the** system  
* **I want to** automatically match platform payouts to bank deposits  
* **So that** bookkeepers don't manually reconcile "phantom receivables"

**Acceptance Criteria:**

* \[ \] **Matching Algorithm:**  
  * Input: Bank deposit (amount, date)  
  * Search transactions table for:  
    * net\_payout ± $1 (account for rounding)  
    * expected\_deposit\_date ± 5 days (account for weekend/holiday delays)  
    * platform matches known payout pattern (e.g., YouTube always exact, Stripe may batch)  
  * If single match found → Auto-link, propose A/R clearance entry  
  * If multiple matches found → Flag Yellow: "Ambiguous match—select correct payout"  
  * If no match found → Flag Yellow: "Unmatched deposit—investigate"  
* \[ \] **Platform Payout Calendars (Used for Expected Deposit Date):**  
  * Database table: payout\_schedules (platform, schedule\_type, schedule\_value)  
  * Examples:  
    * YouTube: NET-60 → expected\_date \= earned\_date \+ 60 days  
    * Patreon: MONTHLY\_5TH → expected\_date \= first day of next month \+ 4 days  
    * Stripe: ROLLING → Query Stripe API for account-specific delay\_days setting  
* \[ \] Edge cases:  
  * Refunds: If bank deposit \< expected, flag: "Deposit short by $X—refund processed?"  
  * Currency conversion: If client earns EUR but books USD, apply conversion rate at deposit date

**Technical Notes:**

* Bank data source: Phase 1 \= manual CSV upload; Phase 2 \= Plaid API integration  
* Fuzzy matching: Use BETWEEN SQL clauses for amount/date ranges  
* Refund handling: Create separate "Refund" transaction (negative revenue) instead of adjusting original

---

**US-503: Append-Only Sync to QuickBooks**

* **As the** sync engine  
* **I want to** push approved transactions to QuickBooks in append-only fashion (never delete/rollback)  
* **So that** bookkeepers' bank reconciliations in QB are never broken by our tool

**Acceptance Criteria:**

* \[ \] **Pre-Sync Validation:**  
  * Check QB API: Does transaction with external\_id \= {our\_transaction\_id} already exist?  
  * If yes → Skip (idempotent sync prevents duplicates)  
  * If no → Proceed

\[ \] **Sync Payload (Revenue Entry Example):**  
 POST /v3/company/{id}/journalentry{  "Line": \[    {      "DetailType": "JournalEntryLineDetail",      "Amount": 1000.00,      "JournalEntryLineDetail": {        "PostingType": "Debit",        "AccountRef": { "value": "1200" }  // A/R \- YouTube (bookkeeper's COA)      },      "Description": "YouTube AdSense \- March 2026"    },    {      "DetailType": "JournalEntryLineDetail",      "Amount": 1000.00,      "JournalEntryLineDetail": {        "PostingType": "Credit",        "AccountRef": { "value": "4100" }  // Revenue (bookkeeper's mapping)      }    }  \],  "TxnDate": "2026-03-15",  "PrivateNote": "Creator Aggregator ID: txn\_abc123 | Platform ID: YT-2026-03-15"}

*   
* \[ \] **Post-Sync Read-Back:**  
  * Query QB API: GET /v3/company/{id}/journalentry/{qb\_id}  
  * Store QB entry ID in our database: qb\_entry\_id \= "12345"  
  * Link receipt snapshot (see US-202)  
* \[ \] **Error Handling:**  
  * QB API error (rate limit, auth issue) → Retry 3x with exponential backoff  
  * Persistent failure → Flag Red: "QB sync failed—contact support"

**Technical Notes:**

* PrivateNote field: Stores our transaction ID for reverse lookup  
* QB rate limits: 500 requests/minute; batch entries where possible (QB supports array of JournalEntry objects)  
* Sync queue: Use job queue (BullMQ, AWS SQS) to handle spikes (e.g., 237 transactions from bulk approval)

---

**US-504: Void-and-Replace Error Correction**

* **As a** bookkeeper  
* **I want to** correct synced entries without breaking QB reconciliations  
* **So that** I can fix mistakes discovered after month-end close

**Acceptance Criteria:**

* \[ \] **Error Discovery:**  
  * Bookkeeper notices error in QB: "YouTube revenue should be $950, not $1,000"  
  * Voids entry in QuickBooks (standard QB workflow: Edit → Void)  
* \[ \] **System Detection:**  
  * Daily read-back job: GET /v3/company/{id}/journalentry?status=Voided  
  * Finds voided entry with PrivateNote containing our transaction ID  
  * Updates our database: qb\_sync\_status \= voided  
  * Flags in Red tab: "Entry voided in QB—correction required"  
* \[ \] **Correction Workflow:**  
  * Bookkeeper opens transaction in Review Queue  
  * Edits amount: $1,000 → $950  
  * Adds note: "Client reported $50 refund not reflected in platform data"  
  * Clicks "Re-Sync to QB"  
  * System creates NEW QB entry (dated same as original) with corrected amount  
  * Old entry remains voided (preserves audit trail)

**Technical Notes:**

* Read-back frequency: Daily (not real-time) to balance API usage  
* Voided entries: Never delete from our database (maintain complete history)  
* Re-sync: Generates new external\_id to distinguish from voided entry

---

### **Epic 6: Deduplication & Data Quality**

**US-601: Source Hierarchy Management**

* **As the** deduplication engine  
* **I want to** prioritize platform-native APIs over processor APIs  
* **So that** revenue is counted once (from the most authoritative source)

**Acceptance Criteria:**

* \[ \] Database table: platform\_hierarchy (platform, hierarchy\_level)  
  * Examples:  
    * gumroad → primary  
    * buy\_me\_a\_coffee → primary  
    * stripe → processor  
* \[ \] **Deduplication Logic:**  
  * Pull Gumroad transaction: deduplication\_hash \= abc123, source\_hierarchy \= primary  
  * Pull Stripe transaction: deduplication\_hash \= abc123, source\_hierarchy \= processor  
  * Match detected (same hash)  
  * System auto-excludes Stripe entry, flags in Yellow tab: "Duplicate detected—kept Gumroad (primary source). Stripe entry excluded."  
* \[ \] **User Override:**  
  * Bookkeeper can view excluded duplicates: "Show Excluded Duplicates" button  
  * If wrong decision: "Unexclude" button → Marks Stripe as primary for this transaction  
  * Creates deduplication rule: "For Client E, always prefer Stripe over Gumroad" (rare edge case)

**Technical Notes:**

* Hash function: SHA-256 of (amount, date, client\_id, description\_normalized)  
  * Description normalization: Lowercase, remove special chars, trim whitespace  
* Deduplication rules: Store in deduplication\_overrides table (client-specific exceptions)

---

**US-602: Data Validation Gates**

* **As the** CRS transformation pipeline  
* **I want to** validate every transaction against business rules before staging for review  
* **So that** bookkeepers never see transactions with impossible data (e.g., negative gross revenue)

**Acceptance Criteria:**

* \[ \] **Validation Rules:**  
  * Rule 1: gross\_revenue \>= 0 (no negative gross)  
  * Rule 2: platform\_fee \>= 0 (fees are never negative; refunds handled separately)  
  * Rule 3: gross\_revenue \- platform\_fee \= net\_payout (within $0.01 tolerance)  
  * Rule 4: transaction\_date \<= today (no future-dated transactions)  
  * Rule 5: Platform-specific (e.g., "YouTube platform\_fee \= gross × 0.45 ± 1%")  
* \[ \] **Validation Failures:**  
  * Failed transactions flagged in Red tab: "Data validation error"  
  * Display: Rule failed, expected value, actual value, raw API data  
  * Actions: "Override & Approve" (logs manual intervention) | "Contact Support"  
* \[ \] **Soft Warnings (Yellow tab):**  
  * Rule 6: Amount variance \>10% from historical average  
  * Rule 7: First transaction from new platform (not a failure, just FYI)

**Technical Notes:**

* Validation: Run in PostgreSQL trigger or application layer (before INSERT INTO transactions)  
* Override logging: validation\_overrides table (for audit purposes)

---

## **TECHNICAL ARCHITECTURE**

### **System Architecture Diagram**

┌─────────────────────────────────────────────────────────────────┐  
│                        PRESENTATION LAYER                        │  
├─────────────────────────────────────────────────────────────────┤  
│  React SPA (Next.js)                                            │  
│  ├─ Multi-Client Dashboard (US-401)                             │  
│  ├─ Review Queue (Green/Yellow/Red Tabs) (US-301-304)           │  
│  ├─ Client Onboarding Wizard (COA Mapping) (US-103)             │  
│  └─ Auth Proxy Portal (OAuth Renewal) (US-901)                  │  
└─────────────────────────────────────────────────────────────────┘  
                              ▼ HTTPS/REST  
┌─────────────────────────────────────────────────────────────────┐  
│                       APPLICATION LAYER                          │  
├─────────────────────────────────────────────────────────────────┤  
│  Node.js (Express) API Server                                   │  
│  ├─ Authentication Service (JWT, OAuth)                         │  
│  ├─ Platform Ingestion Service (US-102)                         │  
│  │   ├─ YouTube Adapter                                         │  
│  │   ├─ Patreon Adapter                                         │  
│  │   ├─ Stripe Adapter                                          │  
│  │   ├─ Gumroad Adapter                                         │  
│  │   └─ Substack/Shopify Adapters                               │  
│  ├─ CRS Transformation Service (US-103)                         │  
│  ├─ Deduplication Engine (US-601)                               │  
│  ├─ Categorization Engine (US-301)                              │  
│  ├─ Accrual Engine (US-501)                                     │  
│  ├─ QuickBooks Sync Service (US-503)                            │  
│  ├─ Receipt Snapshot Service (US-201)                           │  
│  └─ OAuth Health Monitor (US-901)                               │  
└─────────────────────────────────────────────────────────────────┘  
                              ▼  
┌─────────────────────────────────────────────────────────────────┐  
│                         DATA LAYER                               │  
├─────────────────────────────────────────────────────────────────┤  
│  PostgreSQL (Primary Database)                                  │  
│  ├─ clients (id, name, email, accounting\_mode, qb\_company\_id)   │  
│  ├─ platform\_connections (client\_id, platform, oauth\_token\_enc, │  
│  │                         expires\_at, status)                  │  
│  ├─ transactions (CRS schema: gross, fees, net, platform\_id,    │  
│  │                deduplication\_hash, confidence\_score, status) │  
│  ├─ coa\_mappings (client\_id, platform\_category, qb\_account\_id)  │  
│  ├─ approval\_log (user\_id, timestamp, transaction\_ids, action)  │  
│  └─ payout\_schedules (platform, schedule\_type, schedule\_value)  │  
│                                                                  │  
│  Redis (Caching Layer)                                          │  
│  ├─ QB chart of accounts (per client, 1-hour TTL)               │  
│  ├─ Dashboard aggregates (5-minute TTL)                         │  
│  └─ Job queue (BullMQ for async tasks)                          │  
│                                                                  │  
│  AWS S3 (Object Storage)                                        │  
│  ├─ Receipt snapshots (7-year retention)                        │  
│  ├─ Raw API responses (compliance logging)                      │  
│  └─ CSV exports (combined reports, 30-day retention)            │  
└─────────────────────────────────────────────────────────────────┘  
                              ▼  
┌─────────────────────────────────────────────────────────────────┐  
│                      EXTERNAL INTEGRATIONS                       │  
├─────────────────────────────────────────────────────────────────┤  
│  Platform APIs (OAuth 2.0)                                      │  
│  ├─ YouTube Analytics API                                       │  
│  ├─ Patreon API v2                                              │  
│  ├─ Stripe API                                                  │  
│  ├─ Gumroad API                                                 │  
│  └─ Substack/Shopify APIs                                       │  
│                                                                  │  
│  QuickBooks Online API                                          │  
│  ├─ OAuth 2.0 (company-level access)                            │  
│  ├─ JournalEntry, Attachable endpoints                          │  
│  └─ Query endpoint (read-back, COA fetch)                       │  
│                                                                  │  
│  Email Service (SendGrid or AWS SES)                            │  
│  └─ OAuth renewal reminders, error alerts                       │  
└─────────────────────────────────────────────────────────────────┘

### **Data Flow: Ingestion → Review → Sync**

1\. NIGHTLY INGESTION (2 AM UTC)  
   ├─ Cron triggers Platform Ingestion Service  
   ├─ For each client with connected platforms:  
   │   ├─ Check OAuth token health (US-901)  
   │   ├─ If valid: Call platform API (YouTube, Patreon, etc.)  
   │   ├─ Store raw API response → S3 (compliance)  
   │   ├─ Transform via CRS Adapter → Normalized transaction  
   │   ├─ Run deduplication check (hash lookup)  
   │   ├─ Run validation gates (US-602)  
   │   ├─ Calculate confidence score (US-301)  
   │   ├─ Generate receipt snapshot PDF → S3 (US-201)  
   │   └─ Insert transaction → PostgreSQL (status \= pending\_review)  
   └─ Email bookkeeper: "45 new transactions ready for review"

2\. BOOKKEEPER REVIEW (Manual, Async)  
   ├─ Bookkeeper logs in → Multi-Client Dashboard  
   ├─ Sees "Client A: 45 pending"  
   ├─ Drills down → Review Queue (Green/Yellow/Red tabs)  
   ├─ GREEN TAB (US-302):  
   │   ├─ 40 transactions, 95%+ confidence  
   │   ├─ Clicks "Bulk Approve All"  
   │   └─ Transactions → status \= approved  
   ├─ YELLOW TAB (US-303):  
   │   ├─ 4 transactions (1 first-time, 2 duplicates, 1 variance)  
   │   ├─ Maps TikTok → QB Account 4500  
   │   ├─ Selects "Keep Gumroad" for duplicate  
   │   ├─ Approves variance with note  
   │   └─ Transactions → status \= approved  
   └─ RED TAB (US-304):  
       ├─ 1 OAuth expiring warning  
       └─ Sends renewal link to client

3\. SYNC TO QUICKBOOKS (Triggered Post-Approval)  
   ├─ Approved transactions queued (BullMQ job)  
   ├─ For each transaction:  
   │   ├─ Check QB: Does external\_id exist? (idempotent check)  
   │   ├─ If no: Create JournalEntry via QB API  
   │   ├─ Attach receipt snapshot PDF (US-202)  
   │   ├─ Store QB entry ID in our DB  
   │   └─ Update status \= synced  
   ├─ If error: Retry 3x → Flag Red if still fails  
   └─ Email bookkeeper: "✓ 44 transactions synced. 1 error (see Red tab)."

4\. DAILY READ-BACK (Morning Check)  
   ├─ Query QB API: Fetch all JournalEntries modified since last check  
   ├─ Detect voided entries (US-504)  
   ├─ Update our DB: qb\_sync\_status \= voided  
   └─ Flag in Red tab: "Entry voided—correction required"

### **Technology Stack**

| Layer | Technology | Justification |
| ----- | ----- | ----- |
| **Frontend** | Next.js (React) | SSR for SEO, fast initial load; TypeScript for type safety |
| **API Server** | Node.js (Express) | Async I/O ideal for API orchestration; large npm ecosystem |
| **Database** | PostgreSQL 14+ | ACID compliance (financial data), JSON support (flexible CRS schema), GIN indexes (full-text search) |
| **Caching** | Redis | Session management, dashboard aggregates, job queue (BullMQ) |
| **Object Storage** | AWS S3 | Durable (99.999999999%), lifecycle policies, signed URLs |
| **PDF Generation** | Puppeteer | Headless Chrome for HTML→PDF (easier styling than pdfkit) |
| **OAuth** | Passport.js | Multi-strategy support (YouTube, Patreon, QB, Stripe) |
| **Email** | SendGrid | Reliable deliverability, template support, analytics |
| **Hosting** | AWS (ECS Fargate) | Containerized deployment, auto-scaling, managed infra |
| **Monitoring** | Datadog | APM, error tracking, custom dashboards (API latency, sync success rate) |

### **Security & Compliance**

**Data Encryption:**

* **At Rest:** PostgreSQL: AES-256 encryption (AWS RDS), S3: SSE-S3  
* **In Transit:** TLS 1.3 (all API calls, OAuth flows)  
* **OAuth Tokens:** AES-256 encryption before storage (PostgreSQL bytea column \+ app-level encryption key in AWS Secrets Manager)

**Access Control:**

* **Authentication:** JWT tokens (15-min expiration, refresh token rotation)  
* **Authorization:** Role-based (Bookkeeper \= full access, Client \= view-only for their own data)  
* **QuickBooks Access:** Company-level OAuth (bookkeeper authorizes once per client; we store tokens, not credentials)

**Audit Logging:**

* All approval actions logged: approval\_log table (who, what, when, transaction IDs)  
* All QB syncs logged: sync\_log table (timestamp, QB entry ID, status, retry count)  
* Receipt snapshot access logged: S3 access logs (who viewed which PDF, when)

**Compliance:**

* **SOC 2 Type II (Phase 2 goal):** Automated audit trails, encryption, access controls  
* **GDPR:** User data deletion workflow (if EU clients added in future)  
* **IRS Documentation Requirements:** 7-year retention for receipt snapshots

---

## **NON-FUNCTIONAL REQUIREMENTS**

### **Performance**

| Metric | Target | Measurement |
| ----- | ----- | ----- |
| **API Response Time** | \<200ms (p95) | Datadog APM |
| **Dashboard Load Time** | \<2 sec (initial) | Lighthouse, WebPageTest |
| **Bulk Approval (50 txns)** | \<10 sec (sync queued) | Backend timer |
| **Receipt PDF Generation** | \<3 sec per PDF | Puppeteer performance logs |
| **OAuth Health Check** | \<5 sec per platform | Daily cron job duration |

### **Scalability**

| Dimension | Phase 1 Target | Phase 2 Target | Design Consideration |
| ----- | ----- | ----- | ----- |
| **Concurrent Users** | 20 bookkeepers | 200 bookkeepers | Stateless API (horizontal scaling) |
| **Clients per Bookkeeper** | 15 clients | 50 clients | Partitioned DB queries (indexed by client\_id) |
| **Transactions/Month** | 100K | 1M | Batch processing, job queues |
| **Platforms per Client** | 6 platforms | 15 platforms | Adapter pattern (easy to add new platforms) |

### **Reliability**

| Metric | Target | Implementation |
| ----- | ----- | ----- |
| **Uptime (API)** | 99.5% | AWS multi-AZ deployment, health checks, auto-recovery |
| **OAuth Token Uptime** | 98% | Proactive expiration warnings (30/14/7 days), auto-refresh |
| **Data Durability** | 99.999999999% | S3 standard storage, PostgreSQL daily snapshots |
| **Sync Success Rate** | 95% | Retry logic (3x exponential backoff), manual fallback for failures |

### **Usability**

**Target:** Bookkeeper can complete full month-end close for 1 client in \<4 hours (vs. 8 hours baseline)

**Usability Testing Plan (Pre-Launch):**

* 5 bookkeepers (not beta participants) perform month-end close for mock client  
* Tasks: Review 50 transactions, approve 45, edit 3, reject 2, sync to QB  
* Success criteria:  
  * 100% task completion without support  
  * \<3 usability issues rated "critical" (blocks task completion)  
  * SUS (System Usability Scale) score \>70

---

## **SUCCESS METRICS & KPIs**

### **Phase 1 Exit Criteria (90-Day Beta)**

| Metric | Baseline | Target | Measurement Method | Go/No-Go Threshold |
| ----- | ----- | ----- | ----- | ----- |
| **Time Savings per Client** | 8 hrs/month | \<4 hrs/month | Weekly time-tracking survey | 15/20 beta users hit target |
| **Bank Rec Match Rate** | 78% | \>95% | System logs (automated match vs. manual intervention) | \>90% across all beta clients |
| **Categorization Accuracy** | N/A | \>90% | Override rate in Review Queue (high-confidence transactions edited \<10%) | \<15% override rate |
| **OAuth Uptime** | N/A | \>98% | Token health logs (% of time all tokens valid) | \<5% downtime incidents |
| **Duplicate Revenue Incidents** | 8/month/user | \<1/month/user | User-reported flags in Yellow tab | \<2 reports/month across 20 users |
| **NPS (Net Promoter Score)** | N/A | \>50 | Monthly survey: "How likely to recommend?" (0-10 scale) | NPS ≥40 (good), ≥50 (excellent) |
| **Beta Retention** | N/A | 75% | Renewals at end of 90 days | 15/20 users renew for paid tier |

### **Phase 1 Launch KPIs (Month 7+)**

**Product Health:**

* Monthly Active Users (MAU): 50 bookkeepers (Month 7), 200 (Month 12\)  
* Transactions Processed: 250K/month (Month 7), 1M/month (Month 12\)  
* Sync Success Rate: \>95% (monthly average)  
* API Uptime: \>99.5%

**User Engagement:**

* Avg. Clients per Bookkeeper: 8 (Month 7), 12 (Month 12\)  
* Avg. Review Queue Completion Time: \<30 min per client (Green tab only), \<60 min (all tabs)  
* Bulk Approval Adoption: \>80% of transactions approved via bulk (not individual clicks)

**Revenue Metrics (Phase 2):**

* ARR (Annual Recurring Revenue): $150K (Month 12, assuming 50 Pro users @ $149/mo × 12 \+ 150 Starter users @ $49/mo × 12\)  
* Churn Rate: \<5% monthly  
* Upgrade Rate (Starter → Pro): \>30% within 6 months

---

## **RISKS & MITIGATION**

### **Technical Risks**

| Risk | Probability | Impact | Mitigation |
| ----- | ----- | ----- | ----- |
| **Platform API Changes Break Integrations** | High | Critical | \- Version API adapters (YouTubeAdapterV1, V2)\<br\>- Monitor platform dev blogs, subscribe to API change notifications\<br\>- Build fallback: Allow manual CSV upload if API fails |
| **OAuth Token Expiration Goes Unnoticed** | Medium | High | \- Proactive monitoring (US-901): 30/14/7-day warnings\<br\>- Daily health checks\<br\>- Red tab visibility |
| **QuickBooks Rate Limits During Bulk Sync** | Medium | Medium | \- Throttle requests: Max 400/min (80% of QB's 500/min limit)\<br\>- Queue system: Spread syncs over 5-10 min window\<br\>- Retry logic with exponential backoff |
| **PDF Generation Fails (Puppeteer Crashes)** | Low | Medium | \- Fallback to pdfkit (lighter-weight library)\<br\>- Store raw API response as JSON backup\<br\>- Manual upload capability for receipts |
| **Deduplication Logic Misses Edge Case** | Medium | High | \- Yellow tab flagging: "Potential duplicate—verify"\<br\>- User feedback loop: Learn from overrides\<br\>- Extensive edge case testing (50+ scenarios) |

### **Business Risks**

| Risk | Probability | Impact | Mitigation |
| ----- | ----- | ----- | ----- |
| **Bookkeepers Don't Trust "Black-Box" Automation** | High | Critical | \- Human-in-the-loop by design (no auto-posting)\<br\>- Transparent confidence scoring ("Why this category?")\<br\>- Approval gates at every step |
| **Platform Fee Structures Change (e.g., YouTube lowers cut to 40%)** | Medium | Medium | \- Admin panel: Update fee % in payout\_schedules table\<br\>- Alert users: "YouTube fee structure changed—verify March data"\<br\>- Adapter versioning |
| **Competitor Launches Similar Tool** | Medium | Medium | \- Speed to market: Aggressive 90-day beta launch\<br\>- Differentiation: Trust moat (approval workflow) \+ audit-proofing (receipt snapshots)\<br\>- Bookkeeper community lock-in (referral program) |
| **Beta Users Churn Before Renewal** | Medium | High | \- Weekly check-ins during beta\<br\>- Rapid bug fixes (\<48 hr for critical issues)\<br\>- Early access to Phase 2 features (advisory reports) for renewals |

### **Operational Risks**

| Risk | Probability | Impact | Mitigation |
| ----- | ----- | ----- | ----- |
| **Support Overwhelm (20 Beta Users × 12 Clients \= 240 End-Users)** | High | Medium | \- Self-service: Comprehensive docs, video tutorials\<br\>- Office hours: 2× weekly Zoom for beta cohort\<br\>- Slack channel: Async support, peer-to-peer help |
| **AWS Costs Exceed Budget** | Medium | Medium | \- Cost monitoring: AWS Budgets with alerts at 80%, 100%\<br\>- Optimize: S3 lifecycle (archive old receipts to Glacier)\<br\>- Right-size: Start with t3.medium, scale based on load |
| **Key Team Member Leaves Mid-Build** | Low | High | \- Documentation: Architectural decision records (ADRs)\<br\>- Code reviews: Knowledge sharing\<br\>- Redundancy: 2 engineers can maintain critical paths |

---

## **LAUNCH PLAN**

### **Phase 1 Timeline (Months 1-3)**

**Month 1: Foundation**

* Week 1-2: Platform API integrations (YouTube, Patreon, Stripe, Gumroad, Substack)  
* Week 3: CRS schema, database design, adapters  
* Week 4: Receipt snapshotting, S3 integration

**Month 2: Review Queue & Sync**

* Week 5-6: Review Queue UI (Green/Yellow/Red tabs), confidence scoring  
* Week 7: QuickBooks OAuth, sync engine (append-only)  
* Week 8: Accrual engine, bank deposit matching

**Month 3: Polish & Beta Prep**

* Week 9: Multi-client dashboard, bulk actions  
* Week 10: OAuth health monitoring, Auth Proxy Portal  
* Week 11: Deduplication logic, validation gates  
* Week 12: Beta onboarding, documentation, bug fixes

### **Beta Launch (Month 4\)**

**Beta Cohort Selection:**

* 20 bookkeepers (recruited via QuickBooks ProAdvisor network, accounting forums)  
* Criteria:  
  * Manages 3+ creator clients  
  * Currently using QuickBooks Online  
  * Willing to commit 2 hours/week for feedback  
  * NDA signed (pre-launch product)

**Beta Onboarding (Week 1-2 of Month 4):**

1. Kickoff Zoom: Product walkthrough, set expectations  
2. 1:1 setup calls: Connect first 3 clients, map COA  
3. Slack channel invite: Async support, share feedback  
4. Baseline survey: Current time spent, pain points (quantify improvement later)

**Beta Iteration (Weeks 3-12 of Months 4-6):**

* Weekly async surveys: "What broke this week?"  
* Bi-weekly office hours: Screen-shares, Q\&A  
* Monthly NPS check-ins: Track satisfaction trend  
* Rapid bug fixes: \<48 hr for P0 (blocks workflow), \<1 week for P1 (workaround exists)

**Beta Exit Criteria (End of Month 6):**

* 15/20 bookkeepers renew for paid tier (75% retention)  
* NPS ≥50  
* Time savings \>50% validated (survey \+ usage logs)  
* \<5 critical bugs remaining in backlog

### **Paid Launch (Month 7\)**

**Go-to-Market:**

* Pricing: Starter ($49), Pro ($149), Enterprise ($499)  
* Landing page: Case studies from beta (with permission)  
* Content marketing: "The Bookkeeper's Guide to Creator Economy Reconciliation" (SEO)  
* Referral program: 20% lifetime revenue share for bookkeeper referrals  
* Partnerships: QuickBooks ProAdvisor newsletter, accounting association sponsorships

**First 100 Customers Goal:** Month 9 (50 Starter, 40 Pro, 10 Enterprise)

---

## **OPEN QUESTIONS & DECISIONS NEEDED**

### **Pre-Build Decisions (Week 0\)**

1. **Plaid Integration (Bank Deposit Matching):**

   * **Question:** Phase 1 or Phase 2?  
   * **Trade-off:** Plaid adds $0.25/client/month cost but automates bank deposit detection (vs. manual CSV upload)  
   * **Decision Needed By:** Week 1 (impacts Month 2 sync engine scope)  
2. **ML Categorization Engine:**

   * **Question:** Phase 1 (rule-based \+ simple ML) or Phase 2 (after collecting training data)?  
   * **Trade-off:** ML improves confidence scores but adds 2-3 weeks to timeline  
   * **Recommendation:** Phase 1 \= rule-based only; Phase 2 \= add ML after beta feedback  
   * **Decision Needed By:** Week 1  
3. **White-Label Capability:**

   * **Question:** Enterprise tier only or available to all Pro users?  
   * **Trade-off:** White-label increases perceived value but adds UI complexity (custom logos, colors)  
   * **Recommendation:** Enterprise only for Phase 1; gauge demand in beta  
   * **Decision Needed By:** Month 3 (pricing finalization)

### **Post-Beta Decisions (Month 6\)**

4. **Phase 2 Feature Prioritization:**

   * **Options:** a. Strategic Insights Export (Creator Health Scorecard) \- unlocks advisory revenue b. Historical Backfill Tool \- removes onboarding friction c. Contextual Client Explanations \- reduces "teaching tax"  
   * **Decision Criteria:** Beta user feedback (which pain point is most acute?)  
   * **Decision Needed By:** End of Month 6 (inform Month 7+ roadmap)  
5. **Additional Platform Integrations:**

   * **Question:** Which platforms to add in Phase 3? (Ko-fi, Teachable, Thinkific, OnlyFans, Cameo)  
   * **Decision Criteria:** Beta user requests (frequency × client count)  
   * **Decision Needed By:** Month 6 (engineering capacity planning)

---

## **APPENDICES**

### **Appendix A: Glossary**

| Term | Definition |
| ----- | ----- |
| **Accrual Accounting** | Revenue recognized when earned (not when cash received); requires A/R tracking |
| **Cash Accounting** | Revenue recognized when cash received (simpler but less accurate for timing gaps) |
| **COA (Chart of Accounts)** | QuickBooks account structure (e.g., "4100 \- Advertising Income") |
| **CRS (Creator Revenue Standard)** | Our normalized data schema (gross, fees, net, platform\_id, etc.) |
| **Deduplication Fingerprint** | SHA-256 hash of transaction attributes (amount, date, platform) to detect duplicates |
| **Phantom Receivable** | Revenue earned but not yet deposited (YouTube NET-60 creates 60-day "phantom" A/R) |
| **Source Hierarchy** | Primary (platform-native API) vs. Processor (Stripe, PayPal) to prevent double-counting |
| **OAuth Token** | Secure credential for API access (expires periodically, requires renewal) |
| **Idempotent Sync** | Duplicate-safe operation (running twice produces same result as running once) |

### **Appendix B: Platform API Documentation Links**

* **YouTube Analytics API:** https://developers.google.com/youtube/analytics  
* **Patreon API v2:** https://docs.patreon.com  
* **Stripe API:** https://stripe.com/docs/api  
* **Gumroad API:** https://gumroad.com/api  
* **Substack API:** (Private, request access via partner program)  
* **Shopify API:** https://shopify.dev/api/admin-rest  
* **QuickBooks Online API:** https://developer.intuit.com/app/developer/qbo/docs/api/accounting

### **Appendix C: Sample CRS Schema (PostgreSQL)**

CREATE TABLE transactions (  
  id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),  
  client\_id UUID REFERENCES clients(id),  
  platform VARCHAR(50) NOT NULL, \-- 'youtube', 'patreon', etc.  
  platform\_transaction\_id VARCHAR(255) UNIQUE, \-- YT-2026-03-15-ABC123  
  transaction\_date DATE NOT NULL,  
    
  \-- CRS Normalized Fields  
  gross\_revenue DECIMAL(10,2) NOT NULL,  
  platform\_fee DECIMAL(10,2) NOT NULL,  
  net\_payout DECIMAL(10,2) NOT NULL,  
    
  \-- Metadata  
  description TEXT,  
  deduplication\_hash VARCHAR(64), \-- SHA-256  
  source\_hierarchy VARCHAR(20), \-- 'primary' or 'processor'  
    
  \-- Categorization  
  suggested\_category VARCHAR(100),  
  confidence\_score DECIMAL(3,2), \-- 0.00-1.00  
  qb\_account\_id VARCHAR(50), \-- Mapped COA account  
    
  \-- Workflow  
  status VARCHAR(50), \-- 'pending\_review', 'approved', 'synced', 'voided'  
  reviewed\_by UUID REFERENCES users(id),  
  reviewed\_at TIMESTAMP,  
    
  \-- QuickBooks Sync  
  qb\_entry\_id VARCHAR(50),  
  qb\_sync\_status VARCHAR(50),  
  synced\_at TIMESTAMP,  
    
  \-- Audit  
  created\_at TIMESTAMP DEFAULT NOW(),  
  updated\_at TIMESTAMP DEFAULT NOW(),  
  receipt\_snapshot\_url TEXT \-- S3 URL  
);

CREATE INDEX idx\_client\_date ON transactions(client\_id, transaction\_date);  
CREATE INDEX idx\_dedup\_hash ON transactions(deduplication\_hash);  
CREATE INDEX idx\_status ON transactions(status);

---

## **APPROVAL & SIGN-OFF**

| Role | Name | Signature | Date |
| ----- | ----- | ----- | ----- |
| **Product Owner** | \[Your Name\] | \_\_\_\_\_\_\_\_\_ | \_\_\_\_\_\_ |
| **Engineering Lead** | \[To Be Assigned\] | \_\_\_\_\_\_\_\_\_ | \_\_\_\_\_\_ |
| **Design Lead** | \[To Be Assigned\] | \_\_\_\_\_\_\_\_\_ | \_\_\_\_\_\_ |
| **Stakeholder (Finance)** | \[To Be Assigned\] | \_\_\_\_\_\_\_\_\_ | \_\_\_\_\_\_ |

**Next Steps:**

1. Engineering review: Technical feasibility, timeline validation (Week 1\)  
2. Design review: UI/UX specs, wireframes (Week 1-2)  
3. Kickoff meeting: Finalize sprint plan, assign tasks (End of Week 2\)  
4. Build begins: Month 1, Week 1

---

**End of PRD**

