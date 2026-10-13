-- Sales submitted from the test deployment (origin in the TEST_ORIGINS secret). They are onboarded on
-- test.zekerenmobiel.nl, also when retried by sync-onboarding, and never go to the Google Sheet.
alter table public.submissions add column test boolean not null default false;
