# Privacy Model

The platform is designed for public crisis response, but public does not mean
everything is safe to disclose.

## Public Projection Rule

Public response shapes are whitelisted. Helpers return a new object containing
only public fields.

Never expose:

- precise private coordinates
- private contacts
- national IDs
- raw photo hashes
- private notes
- credentials or tokens
- raw source payloads that may contain personal data

## Coordinates

When location can be shown, fuzz it before public display. The current helper
rounds to three decimals by default. Instances may omit coordinates entirely
for sensitive people, shelters, medical sites, or responder operations.

## Missing Persons

Missing-person records are high-risk. Public surfaces should prefer:

- source link-backs
- public-safe names and coarse locality
- status summaries and conflicts
- coordinator-reviewed merges

They should avoid public identity documents, raw photos, phone numbers, private
messages, or exact home/work locations.

## Child Protection Cases

Child tracing records are more restricted than ordinary missing-person records.
Public surfaces should not list individual missing, separated, or
unaccompanied children. They should publish a confidential intake path and use
the child redaction helpers only for generic source/intake signals.

Never expose:

- child name or alias
- child photo or raw photo hash
- shelter, hospital, room, or exact care placement
- family details or claimed caregiver identities
- caseworker contacts or private child protection hotlines
- relationship-claim proof or review notes
- per-child match results to public users
