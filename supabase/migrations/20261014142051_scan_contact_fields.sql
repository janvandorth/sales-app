-- Whether the photo scan may fill in the customer's name and phone numbers for this recruiter. Off by default:
-- those are read too unreliably from handwriting. Set per recruiter (service role / SQL) for whom it works well.
alter table public.profiles add column scan_contact_fields boolean not null default false;
