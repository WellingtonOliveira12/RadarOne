/**
 * migrate-ml-urls.ts
 *
 * Strips legacy ML "hack" segments (`_PublishedToday_YES`, `_NoIndex_True`)
 * from every Monitor.searchUrl pointing at MERCADO_LIVRE.
 *
 * These segments stopped surfacing fresh ads on the platform around 2026-04
 * and now shrink the result set without the freshness benefit. RadarOne
 * already treats "new" as "externalId not yet seen" via AdsSeen, so the
 * hack is no longer needed.
 *
 * Usage:
 *   # dry run (default — prints the diff, changes nothing)
 *   npx ts-node backend/scripts/migrate-ml-urls.ts
 *
 *   # apply the changes for real
 *   npx ts-node backend/scripts/migrate-ml-urls.ts --apply
 *
 * The script is idempotent: running it twice with --apply is safe.
 */

import { PrismaClient } from '@prisma/client';

const HACK_SEGMENTS = ['_PublishedToday_YES', '_NoIndex_True'];

function stripHackSegments(url: string): string {
  if (!url) return url;
  let out = url;
  for (const seg of HACK_SEGMENTS) {
    out = out.split(seg).join('');
  }
  out = out.replace(/_{2,}/g, '_');
  out = out.replace(/_+(\?|#|$)/g, '$1');
  return out;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();

  console.log(`migrate-ml-urls — mode=${apply ? 'APPLY' : 'DRY_RUN'}`);

  const candidates = await prisma.monitor.findMany({
    where: {
      site: 'MERCADO_LIVRE',
      searchUrl: {
        not: null,
        OR: HACK_SEGMENTS.map((seg) => ({ contains: seg })),
      },
    },
    select: { id: true, userId: true, name: true, searchUrl: true },
  });

  console.log(`Found ${candidates.length} ML monitor(s) containing hack segments.`);

  let changed = 0;
  for (const m of candidates) {
    const before = m.searchUrl!;
    const after = stripHackSegments(before);
    if (before === after) continue;
    changed++;
    console.log(`\n[${changed}] monitorId=${m.id} name="${m.name ?? '-'}" user=${m.userId}`);
    console.log(`  before: ${before}`);
    console.log(`  after:  ${after}`);

    if (apply) {
      await prisma.monitor.update({
        where: { id: m.id },
        data: { searchUrl: after },
      });
      console.log(`  ✓ updated`);
    }
  }

  console.log(
    `\nSummary: ${changed} monitor(s) ${apply ? 'updated' : 'would be updated'}.`
  );
  console.log(apply ? 'Done.' : 'Re-run with --apply to persist changes.');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('migrate-ml-urls FAILED:', err);
  process.exit(1);
});
