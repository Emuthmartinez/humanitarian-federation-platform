import { z } from 'zod';
import {
  CoordinationEntitySchema,
  EntityChannelSchema,
  EntityNeedSchema,
  NeedCategories,
  Urgencies,
  type CoordinationEntity,
  type EntityChannel,
  type EntityNeed,
} from './schemas.js';
import { fuzzCoordinate, redactCoordinationEntity } from './redaction.js';

const str = (max: number) => z.string().trim().min(1).max(max);
const optStr = (max: number) => z.string().trim().min(1).max(max).nullish();
const httpUrl = (max: number) => z.string().trim().url().max(max).refine((value) => /^https?:\/\//i.test(value), {
  message: 'must use http or https',
});
const isoTime = z.string().trim().min(1).max(80).refine((value) => Number.isFinite(Date.parse(value)), {
  message: 'must be a valid timestamp',
});

export type ResourceAudienceScope = 'in_venezuela' | 'outside_venezuela' | 'both' | 'unknown';
export type ResourceViewTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export const ResourceRelationshipSchema = z.object({
  type: str(100),
  targetId: str(180),
  label: optStr(200),
}).strict();

export const PublicResourceViewInputSchema = z.object({
  id: str(180),
  eventId: str(120),
  source: str(120),
  externalId: str(200),
  sourceUrl: httpUrl(500),
  kind: str(80),
  title: str(240),
  description: optStr(900),
  audienceScope: optStr(80),
  countryCode: z.string().trim().length(2).transform((value) => value.toUpperCase()).nullish(),
  admin1: optStr(120),
  admin2: optStr(160),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
  status: optStr(120),
  urgency: z.enum(Urgencies).nullish(),
  priority: z.number().finite().nullish(),
  categories: z.array(z.enum(NeedCategories)).max(30).default([]),
  channels: z.array(EntityChannelSchema).max(20).default([]),
  needs: z.array(EntityNeedSchema).max(50).default([]),
  relationships: z.array(ResourceRelationshipSchema).max(50).default([]),
  sourceUpdatedAt: isoTime.nullish(),
  lastVerifiedAt: isoTime.nullish(),
  updatedAt: isoTime.nullish(),
}).strict().refine((value) => (value.lat == null && value.lng == null) || (value.lat != null && value.lng != null), {
  message: 'lat and lng must be provided together',
});

export type PublicResourceViewInput = z.infer<typeof PublicResourceViewInputSchema>;
export type ResourceRelationship = z.infer<typeof ResourceRelationshipSchema>;

export interface ResourceViewOptions {
  sourceLabelById?: Record<string, string>;
  defaultSourceLabel?: string;
  now?: Date | string;
  staleAfterDays?: number;
}

export interface ResourceViewBadge {
  id: string;
  label: string;
  tone: ResourceViewTone;
}

export interface ResourceViewWarning {
  id: string;
  tone: ResourceViewTone;
  message: string;
}

export interface ResourceViewNeed extends EntityNeed {
  label: string;
  tone: ResourceViewTone;
}

export interface ResourceViewSource {
  id: string;
  label: string;
  url: string;
}

export interface ResourceCardView {
  id: string;
  eventId: string;
  kind: string;
  kindLabel: string;
  title: string;
  subtitle?: string;
  description?: string;
  audienceScope: ResourceAudienceScope;
  audienceLabel: string;
  countryCode?: string;
  admin1?: string;
  admin2?: string;
  areaLabel: string;
  lat?: number;
  lng?: number;
  status?: string;
  urgency?: string;
  priority: number;
  categories: string[];
  badges: ResourceViewBadge[];
  warnings: ResourceViewWarning[];
  source: ResourceViewSource;
  channels: EntityChannel[];
  needs: ResourceViewNeed[];
  relationships: ResourceRelationship[];
  sourceUpdatedAt?: string;
  lastVerifiedAt?: string;
  updatedAt?: string;
}

export interface ResourceViewSection {
  id: string;
  title: string;
  description: string;
  resourceIds: string[];
}

export interface ResourceViewModel {
  stats: {
    resourcesTotal: number;
    byAudience: Record<ResourceAudienceScope, number>;
    byKind: Record<string, number>;
    byNeedCategory: Record<string, number>;
    urgentResources: number;
    withPublicChannels: number;
    withNeeds: number;
    withCoordinates: number;
    sourceCount: number;
  };
  sections: ResourceViewSection[];
  resources: ResourceCardView[];
}

export interface BuildResourceViewModelInput {
  entities?: CoordinationEntity[];
  resources?: PublicResourceViewInput[];
}

const KIND_LABELS: Record<string, string> = {
  hospital: 'Hospital',
  clinic: 'Clinica',
  field_clinic: 'Clinica de campo',
  shelter: 'Refugio',
  donation_center: 'Centro de acopio',
  supply_hub: 'Centro de suministros',
  pharmacy: 'Farmacia',
  water_point: 'Punto de agua',
  official_channel: 'Canal publico',
  organization: 'Organizacion',
  community_group: 'Grupo comunitario',
  need: 'Necesidad',
  report: 'Reporte',
  map_report: 'Reporte del mapa',
  patient: 'Paciente',
  patient_signal: 'Senal hospitalaria',
  support_channel: 'Canal de apoyo',
  media: 'Media',
  url_list: 'Lista de enlaces',
  status: 'Estado',
  mixed: 'Mixto',
  unknown: 'Recurso',
};

const CATEGORY_LABELS: Record<string, string> = {
  medical_supplies: 'Insumos medicos',
  beds: 'Camas',
  blood: 'Sangre',
  water: 'Agua',
  food: 'Comida',
  shelter: 'Refugio',
  volunteers: 'Voluntarios',
  transport: 'Transporte',
  fuel: 'Combustible',
  power: 'Electricidad',
  communications: 'Comunicaciones',
  sanitation: 'Saneamiento',
  funds: 'Fondos',
  other: 'Otro',
};

const SUPPORT_KINDS = new Set([
  'donation_center',
  'supply_hub',
  'official_channel',
  'organization',
  'community_group',
  'support_channel',
]);
const HEALTH_KINDS = new Set(['hospital', 'clinic', 'field_clinic', 'pharmacy', 'patient', 'patient_signal']);
const URGENT_URGENCIES = new Set(['critical', 'high']);

function normalizeToken(value: string | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeAudienceScope(value: string | null | undefined): ResourceAudienceScope {
  const normalized = normalizeToken(value ?? '');
  if (['outside_venezuela', 'fuera_de_venezuela', 'external', 'outside', 'diaspora'].includes(normalized)) {
    return 'outside_venezuela';
  }
  if (['in_venezuela', 'en_venezuela', 'local', 'inside', 'domestic'].includes(normalized)) return 'in_venezuela';
  if (['both', 'ambos', 'inside_and_outside', 'in_and_out'].includes(normalized)) return 'both';
  return 'unknown';
}

function audienceLabel(scope: ResourceAudienceScope): string {
  if (scope === 'in_venezuela') return 'En Venezuela';
  if (scope === 'outside_venezuela') return 'Fuera de Venezuela';
  if (scope === 'both') return 'Dentro y fuera';
  return 'Alcance por revisar';
}

function audienceTone(scope: ResourceAudienceScope): ResourceViewTone {
  if (scope === 'outside_venezuela') return 'info';
  if (scope === 'in_venezuela') return 'success';
  if (scope === 'both') return 'warning';
  return 'neutral';
}

function kindLabel(kind: string): string {
  const normalized = normalizeToken(kind);
  return KIND_LABELS[normalized] ?? kind.replace(/_/g, ' ');
}

function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category.replace(/_/g, ' ');
}

function urgencyRank(urgency: string | null | undefined): number {
  if (urgency === 'critical') return 0;
  if (urgency === 'high') return 1;
  if (urgency === 'normal') return 2;
  if (urgency === 'low') return 3;
  return 4;
}

function urgencyTone(urgency: string | null | undefined): ResourceViewTone {
  if (urgency === 'critical') return 'danger';
  if (urgency === 'high') return 'warning';
  if (urgency === 'normal') return 'info';
  return 'neutral';
}

function strongestUrgency(needs: readonly EntityNeed[], fallback: string | null | undefined): string | undefined {
  const urgencies = [...needs.map((need) => need.urgency), fallback].filter((value): value is string => !!value);
  return urgencies.sort((a, b) => urgencyRank(a) - urgencyRank(b))[0];
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))].sort((a, b) => a.localeCompare(b));
}

function areaLabel(resource: PublicResourceViewInput): string {
  const parts = [resource.admin1, resource.admin2].filter((part): part is string => !!part);
  if (parts.length > 0) return parts.join(' · ');
  if (resource.countryCode) return resource.countryCode;
  return 'Sin area';
}

function sourceLabel(source: string, options: ResourceViewOptions): string {
  return options.sourceLabelById?.[source] ?? options.defaultSourceLabel ?? source;
}

function resourceFromEntity(entity: CoordinationEntity): PublicResourceViewInput {
  const redacted = redactCoordinationEntity(CoordinationEntitySchema.parse(entity));
  const needs = redacted.needs ?? [];
  const categories = uniqueSorted(needs.map((need) => need.category));
  return PublicResourceViewInputSchema.parse({
    id: redacted.id,
    eventId: redacted.eventId,
    source: redacted.source,
    externalId: redacted.externalId,
    sourceUrl: redacted.sourceUrl,
    kind: redacted.kind,
    title: redacted.name,
    description: redacted.description,
    audienceScope: redacted.audienceScope,
    countryCode: redacted.countryCode,
    admin1: redacted.admin1,
    admin2: redacted.admin2,
    lat: redacted.lat,
    lng: redacted.lng,
    categories,
    channels: redacted.channels,
    needs,
    urgency: strongestUrgency(needs, undefined),
    sourceUpdatedAt: redacted.sourceUpdatedAt,
    lastVerifiedAt: redacted.lastVerifiedAt,
    updatedAt: redacted.updatedAt,
  });
}

function resourceNeeds(resource: PublicResourceViewInput): ResourceViewNeed[] {
  return resource.needs.map((need) => ({
    ...need,
    label: categoryLabel(need.category),
    tone: urgencyTone(need.urgency),
  }));
}

function resourcePriority(resource: PublicResourceViewInput): number {
  if (typeof resource.priority === 'number') return resource.priority;
  const urgency = strongestUrgency(resource.needs, resource.urgency);
  const urgencyBase = urgencyRank(urgency);
  const kind = normalizeToken(resource.kind);
  if (HEALTH_KINDS.has(kind)) return urgencyBase - 0.25;
  if (SUPPORT_KINDS.has(kind)) return urgencyBase + 0.25;
  return urgencyBase;
}

function isStale(card: Pick<ResourceCardView, 'updatedAt' | 'sourceUpdatedAt' | 'lastVerifiedAt'>, options: ResourceViewOptions): boolean {
  if (!options.staleAfterDays || options.staleAfterDays <= 0) return false;
  const newest = [card.lastVerifiedAt, card.updatedAt, card.sourceUpdatedAt]
    .filter((value): value is string => !!value)
    .sort((a, b) => b.localeCompare(a))[0];
  if (!newest) return true;
  const now = options.now instanceof Date
    ? options.now
    : options.now
      ? new Date(options.now)
      : new Date();
  return now.getTime() - new Date(newest).getTime() > options.staleAfterDays * 86_400_000;
}

function badgesForResource(card: Omit<ResourceCardView, 'badges' | 'warnings'>): ResourceViewBadge[] {
  const badges: ResourceViewBadge[] = [
    { id: `audience_${card.audienceScope}`, label: card.audienceLabel, tone: audienceTone(card.audienceScope) },
    { id: `kind_${normalizeToken(card.kind)}`, label: card.kindLabel, tone: 'neutral' },
  ];

  if (card.needs.some((need) => URGENT_URGENCIES.has(need.urgency))) {
    badges.push({ id: 'urgent_need', label: 'Necesidad urgente', tone: 'danger' });
  }
  if (card.channels.length > 0) badges.push({ id: 'public_channel', label: 'Canal publico', tone: 'info' });
  if (card.lastVerifiedAt) badges.push({ id: 'reviewed_recently', label: 'Revisado recientemente', tone: 'success' });
  return badges;
}

function warningsForResource(card: Omit<ResourceCardView, 'badges' | 'warnings'>, options: ResourceViewOptions): ResourceViewWarning[] {
  const warnings: ResourceViewWarning[] = [];
  const kind = normalizeToken(card.kind);
  if (SUPPORT_KINDS.has(kind) && card.channels.length === 0) {
    warnings.push({
      id: 'source_only',
      tone: 'warning',
      message: 'Este recurso tiene fuente publica, pero aun no tiene canal de contacto o entrega normalizado.',
    });
  }
  if (kind === 'patient' || kind === 'patient_signal') {
    warnings.push({
      id: 'restricted_patient_projection',
      tone: 'warning',
      message: 'Los datos hospitalarios deben mostrarse solo como proyeccion publica segura; no publiques contacto, notas privadas ni detalle medico sensible.',
    });
  }
  if (isStale(card, options)) {
    warnings.push({
      id: 'stale_resource',
      tone: 'warning',
      message: 'Este recurso necesita verificacion reciente antes de destacarse.',
    });
  }
  return warnings;
}

function cardFromResource(input: PublicResourceViewInput, options: ResourceViewOptions): ResourceCardView {
  const parsed = PublicResourceViewInputSchema.parse(input);
  const audienceScope = normalizeAudienceScope(parsed.audienceScope);
  const needs = resourceNeeds(parsed);
  const categories = uniqueSorted([
    ...parsed.categories,
    ...needs.map((need) => need.category),
  ]);
  const urgency = strongestUrgency(needs, parsed.urgency);
  const baseCard = {
    id: parsed.id,
    eventId: parsed.eventId,
    kind: parsed.kind,
    kindLabel: kindLabel(parsed.kind),
    title: parsed.title,
    ...(parsed.admin2 || parsed.admin1 ? { subtitle: areaLabel(parsed) } : {}),
    ...(parsed.description ? { description: parsed.description } : {}),
    audienceScope,
    audienceLabel: audienceLabel(audienceScope),
    ...(parsed.countryCode ? { countryCode: parsed.countryCode } : {}),
    ...(parsed.admin1 ? { admin1: parsed.admin1 } : {}),
    ...(parsed.admin2 ? { admin2: parsed.admin2 } : {}),
    areaLabel: areaLabel(parsed),
    ...(parsed.lat != null ? { lat: fuzzCoordinate(parsed.lat) ?? undefined } : {}),
    ...(parsed.lng != null ? { lng: fuzzCoordinate(parsed.lng) ?? undefined } : {}),
    ...(parsed.status ? { status: parsed.status } : {}),
    ...(urgency ? { urgency } : {}),
    priority: resourcePriority(parsed),
    categories,
    source: {
      id: parsed.source,
      label: sourceLabel(parsed.source, options),
      url: parsed.sourceUrl,
    },
    channels: parsed.channels,
    needs,
    relationships: parsed.relationships,
    ...(parsed.sourceUpdatedAt ? { sourceUpdatedAt: parsed.sourceUpdatedAt } : {}),
    ...(parsed.lastVerifiedAt ? { lastVerifiedAt: parsed.lastVerifiedAt } : {}),
    ...(parsed.updatedAt ? { updatedAt: parsed.updatedAt } : {}),
  };

  return {
    ...baseCard,
    badges: badgesForResource(baseCard),
    warnings: warningsForResource(baseCard, options),
  };
}

function sectionView(id: string, title: string, description: string, resources: readonly ResourceCardView[]): ResourceViewSection {
  return {
    id,
    title,
    description,
    resourceIds: resources.map((resource) => resource.id),
  };
}

function increment(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

export function buildResourceViewModel(
  input: BuildResourceViewModelInput,
  options: ResourceViewOptions = {},
): ResourceViewModel {
  const resourceInputs = [
    ...(input.entities ?? []).map(resourceFromEntity),
    ...(input.resources ?? []).map((resource) => PublicResourceViewInputSchema.parse(resource)),
  ];
  const byId = new Map<string, PublicResourceViewInput>();
  for (const resource of resourceInputs) byId.set(resource.id, resource);

  const resources = [...byId.values()]
    .map((resource) => cardFromResource(resource, options))
    .sort((a, b) => (
      a.priority - b.priority ||
      a.audienceScope.localeCompare(b.audienceScope) ||
      a.kind.localeCompare(b.kind) ||
      a.title.localeCompare(b.title)
    ));

  const byAudience: Record<ResourceAudienceScope, number> = {
    in_venezuela: 0,
    outside_venezuela: 0,
    both: 0,
    unknown: 0,
  };
  const byKind: Record<string, number> = {};
  const byNeedCategory: Record<string, number> = {};

  for (const resource of resources) {
    byAudience[resource.audienceScope] += 1;
    increment(byKind, normalizeToken(resource.kind) || 'unknown');
    for (const category of resource.categories) increment(byNeedCategory, category);
  }

  const inVenezuela = resources.filter((resource) => resource.audienceScope === 'in_venezuela');
  const outsideVenezuela = resources.filter((resource) => resource.audienceScope === 'outside_venezuela');
  const both = resources.filter((resource) => resource.audienceScope === 'both');
  const needs = resources.filter((resource) => resource.needs.length > 0 || resource.categories.length > 0 || normalizeToken(resource.kind) === 'need');
  const health = resources.filter((resource) => HEALTH_KINDS.has(normalizeToken(resource.kind)));
  const support = resources.filter((resource) => SUPPORT_KINDS.has(normalizeToken(resource.kind)) || resource.channels.length > 0);

  return {
    stats: {
      resourcesTotal: resources.length,
      byAudience,
      byKind,
      byNeedCategory,
      urgentResources: resources.filter((resource) => resource.needs.some((need) => URGENT_URGENCIES.has(need.urgency)) ||
        (resource.urgency ? URGENT_URGENCIES.has(resource.urgency) : false)).length,
      withPublicChannels: resources.filter((resource) => resource.channels.length > 0).length,
      withNeeds: resources.filter((resource) => resource.needs.length > 0).length,
      withCoordinates: resources.filter((resource) => resource.lat != null && resource.lng != null).length,
      sourceCount: new Set(resources.map((resource) => resource.source.id)).size,
    },
    sections: [
      sectionView(
        'outside_venezuela',
        'Fuera de Venezuela',
        'Acopios, donaciones y canales de apoyo para personas fuera del pais.',
        outsideVenezuela,
      ),
      sectionView(
        'in_venezuela',
        'En Venezuela',
        'Recursos operativos, centros y necesidades dentro del pais afectado.',
        inVenezuela,
      ),
      sectionView(
        'both',
        'Conectores',
        'Recursos que conectan apoyo externo con operaciones locales.',
        both,
      ),
      sectionView(
        'needs',
        'Necesidades',
        'Solicitudes y necesidades agrupadas por categoria y urgencia.',
        needs,
      ),
      sectionView(
        'health_and_patients',
        'Salud y hospitales',
        'Hospitales, clinicas y proyecciones publicas seguras de datos hospitalarios.',
        health,
      ),
      sectionView(
        'support_channels',
        'Canales de apoyo',
        'Organizaciones, centros de acopio, enlaces de donacion y canales publicos.',
        support,
      ),
    ],
    resources,
  };
}
