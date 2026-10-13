-- A second phone number and the IBAN account holder ("ten name van"), sent to onboarding as Telefoon2 and IBANtnv.
-- "" means none / the customer's own surname, so existing rows need no backfill.
alter table public.submissions
  add column telefoon2 text not null default '',
  add column iban_tnv text not null default '';
