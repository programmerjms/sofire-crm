-- ============================================================
-- Sofire-IT CRM — Schema Part 2: SECURITY + SEED DATA
-- Run this AFTER Part 1 has completed successfully
-- ============================================================

-- Enable Row Level Security on all tables
alter table tenants      enable row level security;
alter table settings     enable row level security;
alter table customers    enable row level security;
alter table invoices     enable row level security;
alter table payments     enable row level security;
alter table expenses     enable row level security;
alter table tax_payments enable row level security;
alter table email_log    enable row level security;

-- Block direct browser access (service role key bypasses RLS)
create policy "deny_anon_tenants"      on tenants      as restrictive for all to anon, authenticated using (false);
create policy "deny_anon_settings"     on settings     as restrictive for all to anon, authenticated using (false);
create policy "deny_anon_customers"    on customers    as restrictive for all to anon, authenticated using (false);
create policy "deny_anon_invoices"     on invoices     as restrictive for all to anon, authenticated using (false);
create policy "deny_anon_payments"     on payments     as restrictive for all to anon, authenticated using (false);
create policy "deny_anon_expenses"     on expenses     as restrictive for all to anon, authenticated using (false);
create policy "deny_anon_tax_payments" on tax_payments as restrictive for all to anon, authenticated using (false);
create policy "deny_anon_email_log"    on email_log    as restrictive for all to anon, authenticated using (false);

-- Insert admin tenant (password = SHA-256 of 'Sofire@2024!')
insert into tenants (id, company, contact, email, username, password_hash, role, status)
values (
  'admin',
  'Sofire-IT Support (Juan Du Plessis Freelance)',
  'Juan Du Plessis',
  'juan@sofire-it.co.za',
  'juan',
  'cf61d5cd29ff916b13dfb741084a066513cb254b5bd720cbdbbdea14247ec97c',
  'superadmin',
  'active'
) on conflict (id) do nothing;

insert into settings (tenant_id, company, owner, email, phone, fy_start, next_inv_num)
values (
  'admin',
  'Sofire-IT Support (Juan Du Plessis Freelance)',
  'Juan Du Plessis',
  'juan@sofire-it.co.za',
  '+27 671 371 638',
  3,
  202600001
) on conflict (tenant_id) do nothing;
