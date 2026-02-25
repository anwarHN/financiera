-- Ensure profile permissions include newly added modules.
update public.account_profiles
set permissions = coalesce(permissions, '{}'::jsonb)
  || jsonb_build_object(
    'dashboard', coalesce(permissions->'dashboard', '{"read":true,"create":false,"update":false}'::jsonb),
    'employees', coalesce(permissions->'employees', '{"read":true,"create":false,"update":false}'::jsonb),
    'appointments', coalesce(permissions->'appointments', '{"read":true,"create":false,"update":false}'::jsonb),
    'paymentForms', coalesce(permissions->'paymentForms', '{"read":true,"create":false,"update":false}'::jsonb),
    'planning', coalesce(permissions->'planning', '{"read":true,"create":false,"update":false}'::jsonb),
    'catalogs', coalesce(permissions->'catalogs', '{"read":true,"create":false,"update":false}'::jsonb),
    'reports', coalesce(permissions->'reports', '{"read":true,"create":false,"update":false}'::jsonb),
    'reportAccess', coalesce(permissions->'reportAccess', '{"sales":true,"receivable":true,"payable":true,"internal_obligations":true,"budget_execution":true,"project_execution":true,"expenses":true,"cashflow":true,"employee_absences":true,"sales_by_employee":true,"expenses_by_tag_payment_form":true}'::jsonb)
  );
