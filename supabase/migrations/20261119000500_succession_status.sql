alter table public.properties
  add column if not exists succession_status text not null default 'Sans objet'
  check (succession_status in ('Sans objet','En cours','À confirmer chez le notaire','Clôturée'));
