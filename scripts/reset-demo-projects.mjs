import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

try { process.loadEnvFile('.env.local'); } catch {}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

async function resetDemoProjects() {
  const users = await sql`SELECT id, email, full_name FROM users WHERE email = 'wanjiru@example.com'`;
  if (users.length === 0) {
    console.log('No user found with email wanjiru@example.com');
    return;
  }
  const wanjiru = users[0];
  console.log(`Found demo client: ${wanjiru.full_name} (${wanjiru.email}, ID: ${wanjiru.id})`);

  const clientProjects = await sql`SELECT id, code, title FROM projects WHERE client_id = ${wanjiru.id}`;
  const clientRequests = await sql`SELECT id, reference, title FROM requests WHERE client_id = ${wanjiru.id}`;

  console.log(`Found ${clientProjects.length} project(s) and ${clientRequests.length} request(s) to remove.`);

  const projectIds = clientProjects.map(p => p.id);
  const requestIds = clientRequests.map(r => r.id);

  await sql.begin(async (tx) => {
    // Disable triggers temporarily for maintenance reset
    await tx`SET session_replication_role = 'replica'`;

    if (projectIds.length > 0) {
      // 1. Delete report reads and evidence
      const reports = await tx`SELECT id FROM reports WHERE project_id = ANY(${projectIds})`;
      const reportIds = reports.map(r => r.id);
      if (reportIds.length > 0) {
        await tx`DELETE FROM report_reads WHERE report_id = ANY(${reportIds})`;
        await tx`DELETE FROM report_evidence WHERE report_id = ANY(${reportIds})`;
      }

      // 2. Delete inspections and findings
      const inspections = await tx`SELECT id FROM inspections WHERE project_id = ANY(${projectIds})`;
      const inspectionIds = inspections.map(i => i.id);
      if (inspectionIds.length > 0) {
        await tx`DELETE FROM inspection_checks WHERE inspection_id = ANY(${inspectionIds})`;
        await tx`DELETE FROM inspection_corrections WHERE inspection_id = ANY(${inspectionIds})`;
        await tx`DELETE FROM findings WHERE inspection_id = ANY(${inspectionIds})`;
        await tx`DELETE FROM monitoring_cycles WHERE inspection_id = ANY(${inspectionIds})`;
      }

      // 3. Delete reports
      await tx`DELETE FROM reports WHERE project_id = ANY(${projectIds})`;

      // 4. Delete invoices, payments, payment_notices
      const invoices = await tx`SELECT id FROM invoices WHERE project_id = ANY(${projectIds})`;
      const invoiceIds = invoices.map(i => i.id);
      if (invoiceIds.length > 0) {
        await tx`DELETE FROM payment_notices WHERE invoice_id = ANY(${invoiceIds})`;
        await tx`DELETE FROM payments WHERE invoice_id = ANY(${invoiceIds})`;
        await tx`DELETE FROM monitoring_cycles WHERE invoice_id = ANY(${invoiceIds})`;
        await tx`DELETE FROM invoices WHERE id = ANY(${invoiceIds})`;
      }

      // 5. Delete other project-linked records
      await tx`DELETE FROM monitoring_cycles WHERE project_id = ANY(${projectIds})`;
      await tx`DELETE FROM payment_notices WHERE project_id = ANY(${projectIds})`;
      await tx`DELETE FROM service_requests WHERE project_id = ANY(${projectIds})`;
      await tx`DELETE FROM project_alerts WHERE project_id = ANY(${projectIds})`;
      await tx`DELETE FROM project_contacts WHERE project_id = ANY(${projectIds})`;
      await tx`DELETE FROM inspections WHERE project_id = ANY(${projectIds})`;
      await tx`DELETE FROM project_sites WHERE project_id = ANY(${projectIds})`;
      await tx`DELETE FROM files WHERE project_id = ANY(${projectIds})`;
      await tx`DELETE FROM events WHERE project_id = ANY(${projectIds})`;
      await tx`DELETE FROM messages WHERE project_id = ANY(${projectIds})`;
    }

    if (requestIds.length > 0) {
      await tx`DELETE FROM files WHERE request_id = ANY(${requestIds})`;
      await tx`DELETE FROM events WHERE request_id = ANY(${requestIds})`;
      await tx`DELETE FROM messages WHERE request_id = ANY(${requestIds})`;
      await tx`DELETE FROM enquiries WHERE request_id = ANY(${requestIds})`;
    }

    // 6. Delete projects
    if (projectIds.length > 0) {
      await tx`DELETE FROM projects WHERE id = ANY(${projectIds})`;
    }

    // 7. Delete proposals
    if (requestIds.length > 0) {
      const proposals = await tx`SELECT id FROM proposals WHERE request_id = ANY(${requestIds})`;
      const propIds = proposals.map(p => p.id);
      if (propIds.length > 0) {
        await tx`DELETE FROM invoices WHERE proposal_id = ANY(${propIds})`;
        await tx`DELETE FROM proposals WHERE id = ANY(${propIds})`;
      }
      // 8. Delete requests
      await tx`DELETE FROM requests WHERE id = ANY(${requestIds})`;
    }

    // 9. Reset notifications and email outbox for Wanjiru
    await tx`DELETE FROM notifications WHERE user_id = ${wanjiru.id}`;
    await tx`DELETE FROM email_outbox WHERE recipients::text LIKE '%wanjiru%'`;

    // Re-enable triggers
    await tx`SET session_replication_role = 'origin'`;

    console.log('Successfully deleted all project records from database.');
  });

  // Clean disk storage
  for (const pid of projectIds) {
    const dir = path.resolve('storage/projects', pid);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
      console.log(`Removed storage directory for project ${pid}`);
    }
  }

  // Verify
  const remainingProjects = await sql`SELECT count(*) FROM projects WHERE client_id = ${wanjiru.id}`;
  const remainingRequests = await sql`SELECT count(*) FROM requests WHERE client_id = ${wanjiru.id}`;
  console.log(`Remaining projects for demo client: ${remainingProjects[0].count}`);
  console.log(`Remaining requests for demo client: ${remainingRequests[0].count}`);

  await sql.end();
}

resetDemoProjects().catch(err => {
  console.error('Reset failed:', err);
  process.exit(1);
});
