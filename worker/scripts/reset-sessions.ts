#!/usr/bin/env npx ts-node
/**
 * ============================================================
 * RESET SESSIONS — Safe Key Rotation Script
 * ============================================================
 *
 * Marks user sessions as NEEDS_REAUTH and clears encrypted data
 * so users can re-upload fresh sessions after a key rotation.
 *
 * Does NOT delete records (keeps them for audit).
 *
 * Usage:
 *   cd worker
 *   npx ts-node scripts/reset-sessions.ts --site FACEBOOK_MARKETPLACE
 *   npx ts-node scripts/reset-sessions.ts --all --dry-run
 *   npx ts-node scripts/reset-sessions.ts --site MERCADO_LIVRE --user <userId>
 */

import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

// ============================================================
// CLI ARGS
// ============================================================

function parseArgs(): { site?: string; all: boolean; userId?: string; dryRun: boolean } {
  const args = process.argv.slice(2);
  let site: string | undefined;
  let all = false;
  let userId: string | undefined;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--site':
        site = args[++i]?.toUpperCase();
        break;
      case '--all':
        all = true;
        break;
      case '--user':
        userId = args[++i];
        break;
      case '--dry-run':
        dryRun = true;
        break;
    }
  }

  if (!site && !all) {
    console.error('Usage: npx ts-node scripts/reset-sessions.ts (--site <SITE> | --all) [--user <userId>] [--dry-run]');
    console.error('');
    console.error('Options:');
    console.error('  --site <SITE>    Reset sessions for a specific site (e.g. FACEBOOK_MARKETPLACE)');
    console.error('  --all            Reset ALL sessions');
    console.error('  --user <userId>  Optional: filter by user ID');
    console.error('  --dry-run        Show what would be done without executing');
    process.exit(1);
  }

  return { site, all, userId, dryRun };
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  const { site, all, userId, dryRun } = parseArgs();

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('ERROR: DATABASE_URL not set in .env');
    process.exit(1);
  }

  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

  try {
    // Build WHERE clause
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (site && !all) {
      conditions.push(`site = $${paramIdx++}`);
      params.push(site);
    }

    if (userId) {
      conditions.push(`user_id = $${paramIdx++}`);
      params.push(userId);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    // Preview
    const preview = await pool.query(
      `SELECT id, user_id, site, domain, status, account_label,
              last_used_at, expires_at
       FROM user_sessions ${whereClause}
       ORDER BY site, user_id`,
      params,
    );

    if (preview.rows.length === 0) {
      console.log('No sessions found matching the criteria.');
      return;
    }

    console.log('');
    console.log('='.repeat(70));
    console.log(dryRun ? '  DRY RUN — No changes will be made' : '  RESET SESSIONS');
    console.log('='.repeat(70));
    console.log('');

    const byStatus: Record<string, number> = {};
    for (const row of preview.rows) {
      byStatus[row.status] = (byStatus[row.status] || 0) + 1;
    }

    console.log(`Sessions found: ${preview.rows.length}`);
    console.log(`By status: ${Object.entries(byStatus).map(([s, c]) => `${s}=${c}`).join(', ')}`);
    console.log('');

    // Show table
    console.log(
      'ID'.padEnd(12) +
      'Site'.padEnd(25) +
      'Status'.padEnd(16) +
      'User'.padEnd(12) +
      'Label',
    );
    console.log('-'.repeat(80));

    for (const row of preview.rows) {
      console.log(
        row.id.substring(0, 10).padEnd(12) +
        row.site.padEnd(25) +
        row.status.padEnd(16) +
        (row.user_id || '').substring(0, 10).padEnd(12) +
        (row.account_label || '-'),
      );
    }
    console.log('');

    if (dryRun) {
      console.log('DRY RUN complete. No changes were made.');
      return;
    }

    // Execute reset
    const now = new Date().toISOString();
    const updateResult = await pool.query(
      `UPDATE user_sessions
       SET status = 'NEEDS_REAUTH',
           encrypted_storage_state = NULL,
           last_error_at = NOW(),
           metadata = jsonb_set(
             jsonb_set(
               COALESCE(metadata, '{}'::jsonb),
               '{lastErrorReason}',
               '"SESSION_RESET_FOR_KEY_ROTATION"'
             ),
             '{lastStatusChange}',
             $${paramIdx}::jsonb
           )
       ${whereClause}
       RETURNING id, site, user_id`,
      [...params, JSON.stringify(now)],
    );

    console.log(`Reset ${updateResult.rowCount} session(s) to NEEDS_REAUTH.`);
    console.log('Users will need to re-upload their sessions.');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
