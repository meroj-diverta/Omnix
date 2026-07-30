# Member registration via rcms_api cannot bind email verification — the enforcing logic exists only in the non-API `login/regist` controller

<!--
Draft for diverta/Kuroco-opendev, following .github/ISSUE_TEMPLATE/bug_report_en.md.
NOT YET FILED.
-->

**Describe the bug**

Kuroco implements invited/verified member registration correctly in
`nfs/lib/modules/login/admin/regist.php`, a Smarty page controller reached at
`/login/regist/?k=<key>`. That path takes the account's email address from the
verified provisional record, refuses a key that has already been used, and marks
the key consumed.

None of that is reachable from the REST API. The two operations the API exposes
for this purpose — `Member::invite` and `Member::insert` — are completely
independent of each other:

- `Member::invite`'s verify branch (`{"email_hash": "<key>"}`) calls
  `MemberProvisional::getMemberData()` and **returns the provisional row**. It
  records nothing, so a successful verification leaves no state behind that any
  later call could check.
- `Member::insert` takes `email` from the request body, takes the group from the
  endpoint's own `default_group_id`, and never consults `t_pre_member_header` at
  all. Its parameter list (`nfs/lib/modules/member/api/v1/Member.php:489`) has no
  `email_hash` / `pre_member_id` / `pre_member_key` argument.

So an integrator who wires up the two operations the admin UI offers gets a
signup flow that **looks** verified and is not: the invite/verify steps are
decorative, and the register endpoint is an open member-creation primitive
scoped only by whatever `default_group_id` was configured on it.

I do not think this is a coding mistake in either method — it is a gap in the API
surface, and it is a footgun because the pieces look like they compose and don't.

**To Reproduce**

On any Kuroco site, create one API structure (`security: none`, or `cookie` —
both answer anonymously here) with two endpoints:

| Path | Model | Operation | `model_method_params` |
|---|---|---|---|
| `auth/invite` | `Member` | `invite` | `{}` |
| `auth/register` | `Member` | `insert` | `{"login_ok_flg": true, "default_group_id": [<a front-end group>]}` |

1. Do **not** call `auth/invite` at all. Skip verification entirely.

2. Post straight to the register endpoint with an address you do not control and
   have never verified:

   ```http
   POST /rcms-api/<api_id>/auth/register
   Content-Type: application/json

   {"email": "someone-elses@example.com", "name1": "Unverified", "login_pwd": "<password>"}
   ```

3. A real member is created, in the configured group, with `login_ok_flg: 1`,
   and can log in immediately.

Two further observations from probing the same endpoints:

- `auth/register`'s schema is permissive — unknown properties are accepted and
  silently ignored. `email_hash`, `otp`, `token` and `invite_token` all pass
  validation and have no effect. So an integrator who *believes* they are passing
  the key gets no error telling them it is being dropped.
  (`Member::invite`, by contrast, has `additionalProperties: false` and rejects
  them, which makes the inconsistency between the two easy to miss.)
- Nothing ever writes `t_pre_member_header.member_id` on the API path, so a key
  is not consumed by registering. It stays valid until `expire_ymdhi` and can be
  used for any number of accounts.

**Expected behavior**

There should be a supported, config-only way to require proof of email ownership
when registering a member through the API — i.e. the API path should be able to
enforce what `login/regist.php` already enforces.

Concretely, `regist.php` guarantees five things that `Member::insert` does not:

| Property | `login/admin/regist.php` | `Member::insert` |
|---|---|---|
| Which address the account gets | `$email_hash_data["email"]`, from the verified provisional row (`:129`) | `email` from the request body — caller's choice |
| Key must be unused | `if(!$email_hash_data["member_id"])` (`:38`) | — |
| Key becomes used | `UPDATE t_pre_member_header SET member_id=… WHERE member_id IS NULL AND key=…` (`:167-169`) | — |
| Group membership | `default_group_ids` read off the provisional row (`:39-40`) | `default_group_id` from endpoint config |
| Atomicity | `dbBegin`/`dbCommit` spanning the insert and the write-back | — |

(`MemberProvisional::getMemberData()` additionally requires
`expire_ymdhi >= CURRENT_TIMESTAMP`, so expiry is already handled wherever it is
used.)

Suggested resolutions, in rough order of preference:

1. **Accept `email_hash` on `Member::insert`** — optional, and when present,
   reproduce the five properties above: resolve the provisional row, reject a
   consumed or expired key, take `email` from the row rather than the body, and
   write `member_id` back inside the same transaction. An endpoint parameter such
   as `require_email_hash: true` could make it mandatory, so the secure
   configuration is expressible and reviewable.
2. **A dedicated operation**, e.g. `Member::register_from_invite` (or
   `MemberProvisional::complete`), that is `regist.php`'s logic exposed as an API
   method. Preferable if changing `insert`'s contract is unattractive — and
   `MemberProvisional` is already an API model
   (`nfs/lib/modules/member/api/v1/MemberProvisional.php`), so there is a natural
   home for it.
3. **Failing either, document the gap where integrators will hit it** — on
   `Member::invite`'s description in the API editor, and on `Member::insert`'s.
   Right now nothing on the endpoint-configuration screen indicates that
   `invite` + `insert` do not compose into a verified flow.

**Note on the existing tutorial.** The docs page
*"Implementing two-step verification on registration form"* describes layering a
separate 6-digit OTP on top of this key using two custom functions
(`set_and_send_otp`, `check_otp_and_regist`) that call
`Api::request_api_post`. That works, and it is presumably the intended answer
today — but it means the only supported way to get verified registration over the
API is to write custom PHP, while the operation named `invite` sits in the
dropdown looking like it does the job. If custom functions are the intended
answer, that is worth stating explicitly on `Member::invite`, because the current
arrangement reads as though verification is built in.

**Environment**

- Target Website URL: reproduced on `https://meroj.g.kuroco.app`
  (`/rcms-api/10/auth/invite` and `/rcms-api/10/auth/register`)
- Source read against `Kuroco-opendev` @ `master`

**Additional context**

Related, and arguably the more actionable half: **`Member::invite`'s
`422 Invalid URL`.** When the supplied `email_hash` is wrong, expired, or already
consumed, `member_invite.php` answers
`$this->translate('/msg/invalid_error', "URL")`, which surfaces to an API client
as `Invalid URL`. Nothing about the request contains a URL. The message reads as
"your request shape is wrong" when it actually means "that key is not valid", and
it cost real debugging time before we identified it — the natural conclusion from
`Invalid URL` is that the endpoint does not accept the field, not that the lookup
failed. `/msg/invalid_error` with a key/token label, or a distinct message for
expired-vs-unknown, would be a small change with a large clarity win.

A further wrinkle in the same area: sending `email` **and** `email_hash` together
pins the create branch (the schema chooses its shape on
`isset($_REQUEST['email_hash'])`, but the controller branches the same way), so
it re-issues the invite and mints a *new* key — silently invalidating the one the
user is holding. A client retrying "verification" with both fields populated
therefore loops forever, each attempt invalidating the key it just received.
