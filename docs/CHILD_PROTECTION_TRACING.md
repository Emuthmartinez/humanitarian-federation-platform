# Child Protection Tracing

This model supports websites and partner systems that need to register missing,
unaccompanied, or separated children after a disaster without creating a public
target list for traffickers, opportunistic claimants, or unsafe adults.

The platform should help sites coordinate child tracing, not publish child
whereabouts. Public users can submit confidential reports or relationship
claims. Restricted child protection workers can compare those claims against
case records and coordinate with verified partners.

## Research Basis

- UNICEF warned on 25 June 2026 that children affected by the Venezuela
  earthquakes face risks including injury, family separation, displacement,
  distress, and disrupted protection services:
  https://www.unicef.org/press-releases/thousands-children-risk-after-powerful-earthquakes-strike-venezuela
- ICRC Restoring Family Links work covers preventing separation, tracing
  missing relatives, restoring contact, and reunification after conflict,
  violence, disasters, and migration:
  https://www.icrc.org/en/what-we-do/reconnecting-families
- The Child Protection Minimum Standards identify unaccompanied and separated
  children as a child protection response area and emphasize care, protection,
  family tracing, and reunification:
  https://alliancecpha.org/en/CPMS_home
- CPIMS+/Primero pairs tracing requests made by caregivers with records of
  missing, separated, or unaccompanied children, backed by child protection case
  management:
  https://www.primero.org/
- The ICRC data protection handbook frames data protection as part of protecting
  life, integrity, and dignity in humanitarian emergencies:
  https://www.icrc.org/en/data-protection-humanitarian-action-handbook
- Disaster trafficking guidance notes that displacement, family separation, and
  disconnection from services can increase trafficking vulnerability:
  https://archive.cdc.gov/www_cdc_gov/disasters/human_trafficking_info_for_shelters.html

## Platform Position

Child tracing is a restricted case-management lane. It is related to the
federated person model, but it has stricter defaults:

- no public child name, photo, precise location, caregiver details, caseworker
  contact, document id, or shelter placement
- no public per-child search result that says where a child is or who has them
- no automatic match, merge, closure, release, or reunification
- no badge language that implies government approval or independent shelter
  safety validation
- no broad partner read access; child case reads require explicit restricted
  scopes and a fresh verified domain badge

## Actors

- **Reporting adult:** someone searching for a child or reporting that a child
  is separated, unaccompanied, injured, or in temporary care.
- **Child protection caseworker:** trained partner user who can access
  restricted child case records.
- **Coordinator:** trusted instance operator who grants partner scopes,
  reviews access, and audits case activity.
- **Verified partner:** a source with a fresh badge and explicit child
  protection scopes.
- **Public reader:** any unauthenticated visitor. They receive only intake
  links, aggregate safety messaging, and public partner trust signals.

## Data Objects

### Restricted child protection case

Use `ChildProtectionCaseRecordSchema` for records about a child who is missing,
unaccompanied, separated, in interim care, under reunification review, reunified,
transferred to a child protection authority, or closed.

The schema allows restricted case fields such as:

- private child name or alias
- approximate age under 18
- last-known locality or place
- separation context
- family details
- current care arrangement
- caseworker and contact details
- strong identifiers and photo hash
- risk flags such as trafficking risk, unverified caregiver claim, cross-border
  risk, or urgent medical need

`isPublicListingAllowed` is always false. If an instance wants to show public
counts or a call to action, it should aggregate separately from redacted case
signals.

### Restricted relationship claim

Use `ChildRelationshipClaimSchema` when an adult or authority claims a
relationship to a child or submits information while searching. This record is
not proof of family relationship. It starts as `received` or `needs_review` and
must be verified before any sensitive information is released.

Claims capture private claimant identity, claimed relationship, contact
channel, supporting proof, and review status. Public receipts should confirm
submission status only; they should not disclose child details or where a
possible match may be.

## Public Surface Rules

For broad public websites:

- show a generic child tracing intake entry point
- show verified partner badges for domains, not per-child findings
- show safety copy directing families to confidential intake
- avoid photos, names, shelter locations, age plus locality combinations, and
  case ids on public pages
- never let public search return "child found at X" or "child is in care of Y"

`redactChildProtectionCase` returns only a safe signal: event id, source, intake
URL, active or closed state, timestamps, and a restricted-disclosure marker.

`redactChildRelationshipClaimReceipt` returns only a receipt-style status. It
does not include child name, claimant name, contact details, proof, or notes.

## Restricted Access

Child case access should require:

1. authenticated partner user
2. verified partner domain badge that is not stale
3. explicit child protection scope such as `child:case:read_restricted`
4. role assignment inside the instance
5. case access logging
6. review workflow for any potential match or reunification

The helper `assessPartnerScopes` checks the badge state and required scopes.
For child case reads, use it with `child:case:read_restricted`; for reviewing
relationship claims, require `child:claim:review`.

## Federation Flow

1. Public site publishes a child tracing intake link and partner trust badge.
2. Family member, caregiver, hospital, shelter, or responder submits a private
   child report or relationship claim.
3. Instance validates the payload with the restricted child schemas.
4. Raw/private records stay behind the instance authorization boundary.
5. Matching produces review candidates only; it does not reveal child
   whereabouts to claimants.
6. Caseworkers verify identity, relationship, best-interests concerns, and
   authority involvement.
7. Coordinators record reunification, transfer, split, closure, or rejection
   decisions with audit logs.
8. Public surfaces only update aggregate guidance or a private receipt status.

## Abuse Controls

- Rate-limit intake and claim endpoints.
- Quarantine repeat claimants, conflicting claims, scripted submissions, and
  claims that name many unrelated children.
- Require human review for any claimant requesting pickup, address, shelter, or
  direct contact.
- Require a second authorized reviewer for reunification or transfer status.
- Treat missing documents as normal after disasters, but do not let missing
  documents bypass verification.
- Keep audit logs of restricted reads and all relationship-claim status changes.
- Use short badge freshness windows during acute response.
- Prefer referrals to child protection authorities and established family links
  networks for high-risk cases.

## Implementation Boundary

This repository does not ship a hosted child protection database, caseworker UI,
or reunification authority. It provides the contracts, privacy projection, trust
scope checks, and operating guidance that an instance can use to interoperate
with child protection systems safely.
