-- 008: Add shared test account for finance-team review (2026-05-27).
INSERT INTO users (
  id, name, email, role, department, active,
  password_hash, testing_override, created_at, audit_log
) VALUES (
  'gsl-testing',
  'GSL Testing',
  'gsl-testing@getsetlearn.info',
  'Admin',
  NULL,
  true,
  '$2b$12$Efi/fU030f1rPqU4F4AwL.SZV48s17our6iclTiRhB7Gxza/GPreS',
  false,
  '2026-05-27T00:00:00Z',
  '[{"timestamp":"2026-05-27T00:00:00Z","user":"anish.d","action":"create","notes":"Shared test account for finance-team review. Cross-functional Admin (department null wildcard). SSO via getsetlearn.info domain."}]'::jsonb
) ON CONFLICT (id) DO NOTHING;
