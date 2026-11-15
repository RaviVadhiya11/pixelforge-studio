-- DocNexa admin activity log. Only trusted server-side Edge Functions may access this table.
create table if not exists public.docnexa_admin_audit (
  id bigint generated always as identity primary key,
  admin_email text not null,
  action text not null,
  title text,
  fcm_message_id text,
  created_at timestamptz not null default now()
);

alter table public.docnexa_admin_audit enable row level security;
revoke all on table public.docnexa_admin_audit from anon, authenticated;
grant all on table public.docnexa_admin_audit to service_role;

create index if not exists docnexa_admin_audit_created_at_idx
  on public.docnexa_admin_audit (created_at desc);