#!/usr/bin/env npx ts-node
/**
 * CREATE TEST MONITOR — Facebook Marketplace (Itaberaí/GO)
 *
 * Uses raw SQL to bypass Prisma type limitations in the worker package.
 *
 * Usage:
 *   cd worker && npx ts-node scripts/create-test-monitor.ts
 */

import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('ERROR: DATABASE_URL not set in .env');
    process.exit(1);
  }

  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

  try {
    // Step 1: Find user with active subscription
    console.log('\n[1/3] Looking for a user with active subscription...\n');

    const subResult = await pool.query(`
      SELECT s.id AS sub_id, s.status, s.user_id,
             u.name AS user_name, u.email,
             p.name AS plan_name
      FROM subscriptions s
      JOIN users u ON u.id = s.user_id
      JOIN plans p ON p.id = s.plan_id
      WHERE s.status IN ('ACTIVE', 'TRIAL')
      ORDER BY s.created_at ASC
      LIMIT 1
    `);

    if (subResult.rows.length === 0) {
      console.error('ERROR: No user with active/trial subscription found.');
      process.exit(1);
    }

    const row = subResult.rows[0];
    console.log(`  User: ${row.user_name} (${row.email})`);
    console.log(`  Plan: ${row.plan_name} | Status: ${row.status}`);
    console.log(`  User ID: ${row.user_id}\n`);

    // Step 2: Check if monitor already exists
    console.log('[2/3] Checking for existing monitor...\n');

    const existing = await pool.query(
      `SELECT id, site, active, created_at FROM monitors WHERE user_id = $1 AND name = $2`,
      [row.user_id, 'TEST_FB_ITABERAI']
    );

    if (existing.rows.length > 0) {
      const m = existing.rows[0];
      console.log(`  Monitor already exists! ID: ${m.id}`);
      console.log(`  Site: ${m.site} | Active: ${m.active}`);
      console.log(`  Created at: ${m.created_at}\n`);
      console.log('Skipping creation. Delete first if you want to recreate.\n');
      return;
    }

    // Step 3: Create the monitor
    console.log('[3/3] Creating Facebook Marketplace test monitor...\n');

    const insertResult = await pool.query(
      `INSERT INTO monitors (
        id, user_id, name, site, mode, search_url,
        country, state_region, city,
        filters_json, active, price_min, price_max,
        created_at, updated_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5,
        $6, $7, $8,
        $9, $10, $11, $12,
        NOW(), NOW()
      ) RETURNING id, name, site, mode, country, state_region, city, filters_json, active`,
      [
        row.user_id,
        'TEST_FB_ITABERAI',
        'FACEBOOK_MARKETPLACE',
        'STRUCTURED_FILTERS',
        null,             // searchUrl
        'BR',             // country
        'GO',             // stateRegion
        'Itaberaí',       // city
        JSON.stringify({ keywords: 'carro' }),
        true,
        null,             // priceMin
        null,             // priceMax
      ]
    );

    const m = insertResult.rows[0];
    console.log('  Monitor created successfully!\n');
    console.log('  ┌──────────────────────────────────────────────');
    console.log(`  │ ID:          ${m.id}`);
    console.log(`  │ Name:        ${m.name}`);
    console.log(`  │ Site:        ${m.site}`);
    console.log(`  │ Mode:        ${m.mode}`);
    console.log(`  │ Country:     ${m.country}`);
    console.log(`  │ State:       ${m.state_region}`);
    console.log(`  │ City:        ${m.city}`);
    console.log(`  │ Filters:     ${JSON.stringify(m.filters_json)}`);
    console.log(`  │ Active:      ${m.active}`);
    console.log('  └──────────────────────────────────────────────\n');
  } catch (error: any) {
    console.error('\nFailed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
