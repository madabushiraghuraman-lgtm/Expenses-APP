# Security Specifications for Krystal Travel Workflow App

## 1. Data Invariants
- **User Identity & Authority**: A user document under `/users/{userId}` must only be writable by the user whose UID matches `userId`. Users can self-manage profiles in this sandbox context, but in production, roles are managed exclusively.
- **Claim Integrity**: A travel expense claim under `/claims/{claimId}`:
  - Must have `employeeUid` set to the authenticated user's ID.
  - The document ID `{claimId}` must match the `claimNumber` field.
  - Numeric values like `advanceAmount` and `totalExpenseAmount` must be non-negative.
  - Line items must be valid maps containing category, date, amount, narration, proofUrl, and proofName.
  - Chronology: `createdAt` can only be set to `request.time` during creation, and `updatedAt` must be updated to `request.time` during updates.
- **Role Permissions (ABAC)**:
  - **Employee**: Can read and write only their own claims (where `employeeUid == request.auth.uid`). Cannot approve or reject claims, nor update claims in flat states once processed.
  - **Auditor**: Can review/read all claims. Can update claim status (approve or reject) and append a rejection reason, but cannot delete claims or edit settings.
  - **Super Admin**: Can read and write all users and claims, delete records, and manage `/settings/global`.
- **System Settings**: `/settings/global` contains global parameters (nextSerial, globalPasscode, customCategories). Must be readable by authenticated users but only writable by Super Admins.

---

## 2. The "Dirty Dozen" Threat Payloads

### Threat Matcher #1: Account Identity Theft
- **Description**: Authenticated malicious user tries to write a profile document in `users/{victimUID}` to override a victim's details.
- **Payload**:
```json
{
  "userId": "victim_uid_123",
  "name": "Attacker Impersonator",
  "phone": "+919876543210",
  "role": "employee",
  "department": "Operations",
  "createdAt": "2026-05-23T07:28:41Z"
}
```
- **Target Path**: `/users/victim_uid_123`
- **Result**: `PERMISSION_DENIED` (Strict owner guard constraint)

### Threat Matcher #2: Claim Hijacking
- **Description**: Attacker tries to submit a claim under `claims/KRPLTR03` where `employeeUid` is a victim's UID.
- **Payload**:
```json
{
  "claimNumber": "KRPLTR03",
  "employeeUid": "victim_uid_123",
  "employeeName": "Rajesh Employee",
  "employeePhone": "+919876543210",
  "department": "Sales",
  "designation": "Associate",
  "status": "Pending",
  "tourStartDate": "2026-05-10",
  "tourEndDate": "2026-05-14",
  "advanceAmount": 500,
  "totalExpenseAmount": 750,
  "finalBalance": 250,
  "narration": "Hacked tour claim",
  "createdAt": "2026-05-23T07:28:41Z",
  "updatedAt": "2026-05-23T07:28:41Z",
  "lineItems": []
}
```
- **Target Path**: `/claims/KRPLTR03`
- **Result**: `PERMISSION_DENIED` (employeeUid ownership enforcement)

### Threat Matcher #3: Self-Assigned Super Admin Privilege Escalation
- **Description**: Attacker modifies their own profile role to `super_admin`.
- **Payload**:
```json
{
  "userId": "attacker_uid_456",
  "name": "Attacker",
  "phone": "+918888888888",
  "role": "super_admin",
  "department": "IT",
  "createdAt": "2026-05-23T07:28:41Z"
}
```
- **Target Path**: `/users/attacker_uid_456`
- **Result**: `PERMISSION_DENIED` (Blocked in production, though sandbox switcher handles this via verified impersonator path updates).

### Threat Matcher #4: Fraudulent Payout Balance Manipulation
- **Description**: Employee claims negative advance paid to make the organizational refund due extremely high.
- **Payload**:
```json
{
  "claimNumber": "KRPLTR99",
  "employeeUid": "attacker_uid_456",
  "employeeName": "Fraudulent Employee",
  "employeePhone": "+918888888888",
  "department": "Sales",
  "designation": "Associate",
  "status": "Pending",
  "tourStartDate": "2026-05-10",
  "tourEndDate": "2026-05-14",
  "advanceAmount": -50000,
  "totalExpenseAmount": 750,
  "finalBalance": 50750,
  "narration": "Malicious refund claim",
  "createdAt": "2026-05-23T07:28:41Z",
  "updatedAt": "2026-05-23T07:28:41Z",
  "lineItems": []
}
```
- **Target Path**: `/claims/KRPLTR99`
- **Result**: `PERMISSION_DENIED` (Non-negative check validation helper)

### Threat Matcher #5: Unauthorized Multi-Tenant Claim Scraping (PII Leak)
- **Description**: Attacker searches/reads another employee's claim details.
- **Target Operation**: `get` `/claims/KRPLTR01` (A claim belonging to `victim_uid_123`)
- **Result**: `PERMISSION_DENIED` (List/get queries filtered by ownership and roles)

### Threat Matcher #6: Resource Poisoning / Injection Attack
- **Description**: Attacker writes 1.5MB junk-character string into claim details or ID field to exhaust project storage.
- **Target Path**: `/claims/very_long_invalid_junk_string_with_excessive_characters_exceeding_128_limit_characters`
- **Result**: `PERMISSION_DENIED` (Strict path ID validation helper)

### Threat Matcher #7: Shadow Ghost Field Injection
- **Description**: Attacker updates their claim record but appends a ghost/illegal field such as `isAutoApproved: true` to hijack flow.
- **Payload update**: `resource.data` with `isAutoApproved: true` added.
- **Result**: `PERMISSION_DENIED` (Managed by strict validation checks and keys differentiation)

### Threat Matcher #8: Self-Approval of Travel Claims
- **Description**: Regular Employee tries to change status of their pending or rejected claim directly to `Approved`.
- **Payload update**:
```json
{
  "status": "Approved"
}
```
- **Result**: `PERMISSION_DENIED` (Only Auditors and Super Admins can transition status fields to Approved/Rejected)

### Threat Matcher #9: Retroactive Timestamp Modification
- **Description**: Employee alters `createdAt` or `updatedAt` to spoof timing.
- **Result**: `PERMISSION_DENIED` (Verification of immutable `createdAt` and enforced `request.time` timestamps)

### Threat Matcher #10: Unauthorized Delete of Historic Claims
- **Description**: Regular Employee tries to delete an approved/rejected claim to hide receipts.
- **Result**: `PERMISSION_DENIED` (Employees cannot delete claims, only Super Admins can purge)

### Threat Matcher #11: Settings Hijack
- **Description**: An Auditor or Employee attempts to write to `/settings/global` to change the passcode or custom categories.
- **Result**: `PERMISSION_DENIED` (Only Super Admins can modify settings)

### Threat Matcher #12: Corrupted Reference Linkage
- **Description**: Attacker submits a claim document at `/claims/KRPLTR88` but specifies `claimNumber: "CORRUPTED_SERIAL_99"`.
- **Result**: `PERMISSION_DENIED` (Strict check matching claim number to document path ID)

---

## 3. Test Runner Architecture
Tests must run locally checking rule permissions against these identities:
- **Employee (`auth.uid: 'usr_rajesh'`)**
- **Auditor Admin (`auth.uid: 'usr_auditor'`)**
- **Super Admin (`auth.uid: 'usr_super'`)**
