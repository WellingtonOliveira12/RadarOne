/**
 * Opportunity Score — Formatters (V3)
 *
 * Pure formatting functions with zero external dependencies.
 * Safe to import from notification services without triggering DB initialization.
 *
 * V3: Respects scoreMode — 'simplified' mode shows NO price-related labels.
 * V2.1: Shows confidence level. Breakdown details only for meaningful adjustments.
 */

import type { OpportunityResult } from './score-types';

// ─── Confidence Labels ──────────────────────────────────────────────────────

const CONFIDENCE_LABELS: Record<string, string> = {
  HIGH: '\uD83D\uDFE2 Alta',     // 🟢
  MEDIUM: '\uD83D\uDFE1 M\u00E9dia', // 🟡
  LOW: '\uD83D\uDD34 Baixa',     // 🔴
};

// ─── Breakdown Helpers ──────────────────────────────────────────────────────

function buildBreakdownLinesTelegram(result: OpportunityResult): string {
  const bd = result.breakdown;
  if (!bd) return '';

  const parts: string[] = [];

  if (bd.timeBoost > 0) {
    parts.push(`\u26A1 Novo an\u00FAncio (+${bd.timeBoost})`);
  }

  if (bd.sellerScore > 0) {
    parts.push(`\uD83D\uDC64 Vendedor verificado (+${bd.sellerScore})`);
  } else if (bd.sellerScore < 0) {
    parts.push(`\u26A0\uFE0F Sinal de urg\u00EAncia (${bd.sellerScore})`);
  }

  if (parts.length === 0) return '';

  return '\n' + parts.join('\n');
}

// ─── Telegram ───────────────────────────────────────────────────────────────

export function formatScoreTelegram(result: OpportunityResult): string {
  const isSimplified = result.scoreMode === 'simplified';

  if (isSimplified) {
    // V3 Simplified: show only label + breakdown, NO score number, NO confidence badge
    let text = `\n${result.label}`;
    text += buildBreakdownLinesTelegram(result);
    return text;
  }

  // FULL mode: show score, label, confidence, breakdown
  let text = `\n\u2B50 <b>Score:</b> ${result.score}/100\n${result.label}`;

  // Confidence (always show in full mode)
  const confLabel = CONFIDENCE_LABELS[result.confidenceLevel] || result.confidenceLevel;
  text += `\n\uD83D\uDCCA Confian\u00E7a: ${confLabel}`;

  // V2 breakdown details
  text += buildBreakdownLinesTelegram(result);

  return text;
}

// ─── Email HTML ─────────────────────────────────────────────────────────────

export function formatScoreEmail(result: OpportunityResult): string {
  const isSimplified = result.scoreMode === 'simplified';

  if (isSimplified) {
    // V3 Simplified: minimal badge, no score number
    return `
    <div style="text-align: center; margin: 15px 0;">
      <p style="margin: 0; font-size: 14px; font-weight: 600; color: #333;">${result.label}</p>
    </div>
    `;
  }

  // FULL mode: score badge + confidence + breakdown
  let badgeColor: string;
  if (result.score >= 85) badgeColor = '#e74c3c';
  else if (result.score >= 70) badgeColor = '#27ae60';
  else if (result.score >= 50) badgeColor = '#f39c12';
  else badgeColor = '#95a5a6';

  // Confidence badge
  let confColor: string;
  switch (result.confidenceLevel) {
    case 'HIGH': confColor = '#27ae60'; break;
    case 'MEDIUM': confColor = '#f39c12'; break;
    default: confColor = '#e74c3c'; break;
  }
  const confLabel = CONFIDENCE_LABELS[result.confidenceLevel] || result.confidenceLevel;

  // V2 breakdown details
  let detailsHtml = '';
  const bd = result.breakdown;
  if (bd) {
    const details: string[] = [];
    if (bd.timeBoost > 0) details.push(`\u26A1 Novo an\u00FAncio (+${bd.timeBoost})`);
    if (bd.sellerScore > 0) details.push(`\uD83D\uDC64 Vendedor verificado (+${bd.sellerScore})`);
    else if (bd.sellerScore < 0) details.push(`\u26A0\uFE0F Sinal de urg\u00EAncia (${bd.sellerScore})`);

    if (details.length > 0) {
      detailsHtml = `
        <p style="margin: 8px 0 0 0; font-size: 12px; color: #666;">
          ${details.join(' &middot; ')}
        </p>
      `;
    }
  }

  return `
    <div style="text-align: center; margin: 15px 0;">
      <div style="display: inline-block; background-color: ${badgeColor}; color: white; padding: 8px 20px; border-radius: 20px; font-size: 16px; font-weight: bold;">
        \u2B50 Score: ${result.score}/100
      </div>
      <p style="margin: 6px 0 0 0; font-size: 14px; font-weight: 600; color: #333;">${result.label}</p>
      <p style="margin: 4px 0 0 0; font-size: 12px; color: ${confColor};">Confian\u00E7a: ${confLabel}</p>
      ${detailsHtml}
    </div>
  `;
}

// ─── Plain Text ─────────────────────────────────────────────────────────────

export function formatScoreText(result: OpportunityResult): string {
  const isSimplified = result.scoreMode === 'simplified';

  if (isSimplified) {
    let text = result.label;
    const bd = result.breakdown;
    if (bd) {
      const parts: string[] = [];
      if (bd.timeBoost > 0) parts.push(`Novo (+${bd.timeBoost})`);
      if (bd.sellerScore !== 0) parts.push(`Vendedor (${bd.sellerScore > 0 ? '+' : ''}${bd.sellerScore})`);
      if (parts.length > 0) {
        text += ` | ${parts.join(', ')}`;
      }
    }
    return text;
  }

  // FULL mode
  const confLabel = CONFIDENCE_LABELS[result.confidenceLevel] || result.confidenceLevel;
  let text = `\u2B50 Score: ${result.score}/100 \u2014 ${result.label} | Confian\u00E7a: ${confLabel}`;

  const bd = result.breakdown;
  if (bd) {
    const parts: string[] = [];
    if (bd.timeBoost > 0) parts.push(`Novo (+${bd.timeBoost})`);
    if (bd.sellerScore !== 0) parts.push(`Vendedor (${bd.sellerScore > 0 ? '+' : ''}${bd.sellerScore})`);
    if (parts.length > 0) {
      text += ` | ${parts.join(', ')}`;
    }
  }

  return text;
}
