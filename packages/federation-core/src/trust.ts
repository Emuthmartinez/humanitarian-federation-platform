import type { PartnerScope, SourcePartner } from './schemas.js';

export type BadgeState = 'verified' | 'stale' | 'unverified';

export interface BadgeAssessment {
  domain: string;
  state: BadgeState;
  label: string;
  scopes: PartnerScope[];
  verifiedAt: string | null | undefined;
  staleAfterDays: number;
  reasons: string[];
}

export function normalizeDomain(raw: string): string | null {
  const input = raw.trim().toLowerCase();
  const urlish = /^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`;
  try {
    const host = new URL(urlish).hostname.replace(/^www\./, '');
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return null;
    return host;
  } catch {
    return null;
  }
}

function daysSince(timestamp: string, now: Date): number {
  return (now.getTime() - Date.parse(timestamp)) / 86_400_000;
}

export function assessPartnerBadge(
  partner: SourcePartner,
  domainInput: string,
  opts: { now?: Date; staleAfterDays?: number } = {},
): BadgeAssessment {
  const now = opts.now ?? new Date();
  const staleAfterDays = opts.staleAfterDays ?? 30;
  const domain = normalizeDomain(domainInput) ?? domainInput.trim().toLowerCase();
  const verifiedDomains = new Set(partner.verifiedDomains.map((domainValue) => normalizeDomain(domainValue)).filter(Boolean));
  const reasons: string[] = [];

  if (!verifiedDomains.has(domain)) {
    reasons.push('domain is not verified for this partner');
    return {
      domain,
      state: 'unverified',
      label: partner.badgeLabel,
      scopes: partner.scopes,
      verifiedAt: partner.badgeVerifiedAt,
      staleAfterDays,
      reasons,
    };
  }

  if (!partner.badgeVerifiedAt) {
    reasons.push('badge has no verification timestamp');
    return {
      domain,
      state: 'stale',
      label: partner.badgeLabel,
      scopes: partner.scopes,
      verifiedAt: partner.badgeVerifiedAt,
      staleAfterDays,
      reasons,
    };
  }

  if (daysSince(partner.badgeVerifiedAt, now) > staleAfterDays) {
    reasons.push('badge verification is stale');
    return {
      domain,
      state: 'stale',
      label: partner.badgeLabel,
      scopes: partner.scopes,
      verifiedAt: partner.badgeVerifiedAt,
      staleAfterDays,
      reasons,
    };
  }

  return {
    domain,
    state: 'verified',
    label: partner.badgeLabel,
    scopes: partner.scopes,
    verifiedAt: partner.badgeVerifiedAt,
    staleAfterDays,
    reasons: ['domain and timestamp are verified'],
  };
}
