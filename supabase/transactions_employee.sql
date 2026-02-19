-- Add optional employee relation at transaction header level.
-- Used by income/expense forms to relate the transaction with an employee.

alter table public.transactions
add column if not exists "employeeId" bigint references public.employes(id);

