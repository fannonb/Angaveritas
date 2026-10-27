-- Clients open a project's published reports only once every issued invoice is paid, or payment is
-- waived. A pending payment claim does not count: it is a client's claim, not money received.
create function client_reports_unlocked(pid uuid) returns boolean language sql stable as $$
  select exists(select 1 from projects p where p.id = pid and p.payment_status = 'waived')
    or not exists(
      select 1 from invoices i
      where i.project_id = pid and i.status = 'issued'
        and i.amount_kes > coalesce((select sum(case when pay.kind = 'payment' then pay.amount_kes else -pay.amount_kes end)::int
          from payments pay where pay.invoice_id = i.id), 0)
    );
$$;
