-- ============================================================================
-- 0023_seed_data.sql
-- Initial reference data and a default restaurant settings row.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
insert into roles (name, label, description) values
  ('ADMIN','Administrator','Full access to all restaurant settings, menu, staff and reports.'),
  ('MANAGER','Manager','Operational access: menu, orders, tables and reports.')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- Demo categories
-- ---------------------------------------------------------------------------
insert into categories (name, slug, sort_order) values
  ('Burgers',  'burgers',  1),
  ('Pizza',    'pizza',    2),
  ('BBQ',      'bbq',      3),
  ('Drinks',   'drinks',   4),
  ('Desserts', 'desserts', 5)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Default restaurant settings row
-- ---------------------------------------------------------------------------
insert into restaurant_settings (name)
select 'Restaurant'
where not exists (select 1 from restaurant_settings);

-- ============================================================================
-- POST-INSTALL: create your admin user
-- ============================================================================
-- 1. In Supabase Dashboard → Authentication → Users → "Add user", create a
--    user with email + password (note the user's UUID).
-- 2. Run the following (replace the UUID):
--
--    insert into staff (user_id, full_name, role)
--    values ('<paste-user-uuid-here>', 'Restaurant Admin', 'ADMIN');
-- ============================================================================
