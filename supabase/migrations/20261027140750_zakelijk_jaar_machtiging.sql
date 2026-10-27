-- The form offers "Zakelijk Jaar Machtiging" instead of the two acceptgiro terms. Those stay allowed: earlier sales
-- carry them, and a sale queued before the change may still send one.
alter table public.submissions drop constraint submissions_betaalperiode_check;
alter table public.submissions add constraint submissions_betaalperiode_check check (
  betaalperiode in (
    'Maand Machtiging', 'Kwartaal Machtiging', 'Jaar Machtiging', 'Zakelijk Jaar Machtiging',
    'Jaar Acceptgiro', 'Zakelijk Acceptgiro'
  )
);
