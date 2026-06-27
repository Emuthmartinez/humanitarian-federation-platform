import { parse } from 'csv-parse/sync';

export type GroupedPersonViewTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export interface GroupedPersonViewOptions {
  sourceLabelById?: Record<string, string>;
  defaultSourceLabel?: string;
  sourceUrlColumn?: string;
  sourceLabelColumn?: string;
  maxSourceUrlsPerReport?: number;
  localizedStatusValues?: string[];
  excludeModerationDecisions?: string[];
}

export interface GroupedPersonBadge {
  id: string;
  label: string;
  tone: GroupedPersonViewTone;
}

export interface GroupedPersonStatusView {
  raw: string;
  label: string;
  tone: GroupedPersonViewTone;
}

export interface GroupedPersonReportView {
  rowNumber: number;
  sourceId: string;
  externalId: string;
  displayName: string;
  age?: number;
  sex?: string;
  hospital?: string;
  numReports: number;
  status: GroupedPersonStatusView;
  source: {
    label: string;
    urls: string[];
    primaryUrl?: string;
  };
}

export interface GroupedPersonCardWarning {
  id: string;
  tone: GroupedPersonViewTone;
  message: string;
}

export interface GroupedPersonCardView {
  groupId: string;
  sortBucket: number;
  kind: string;
  confidence: string;
  title: string;
  subtitle?: string;
  hasIdentifier: boolean;
  reportRows: number;
  totalReports: number;
  status: GroupedPersonStatusView;
  badges: GroupedPersonBadge[];
  warnings: GroupedPersonCardWarning[];
  needsModeration: boolean;
  reports: GroupedPersonReportView[];
}

export interface GroupedPersonViewSection {
  id: string;
  title: string;
  description: string;
  groupIds: string[];
}

export interface GroupedPersonViewModel {
  stats: {
    groupsTotal: number;
    sourceRows: number;
    reportsGathered: number;
    localizedReports: number;
    groupsWithIdentifier: number;
    groupsNeedingModeration: number;
    groupsWithStatusConflict: number;
  };
  sections: GroupedPersonViewSection[];
  groups: GroupedPersonCardView[];
}

type CsvRow = Record<string, unknown>;

const DEFAULT_SOURCE_URL_COLUMN = 'Fuentes';
const DEFAULT_MAX_SOURCE_URLS = 4;
const DEFAULT_EXCLUDED_MODERATION_DECISIONS = ['reject', 'rejected', 'hide', 'hidden', 'exclude', 'excluded', 'descartar'];
const DEFAULT_LOCALIZED_STATUSES = [
  'found',
  'found_safe',
  'localizado',
  'localizada',
  'encontrado',
  'encontrada',
  'encontrado_a_salvo',
  'encontrada_a_salvo',
];

function parseCsvRows(csvText: string): CsvRow[] {
  if (!csvText.trim()) throw new Error('CSV input is empty');
  const rows = parse(csvText, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as unknown;

  if (!Array.isArray(rows) || !rows.every((row) => typeof row === 'object' && row !== null && !Array.isArray(row))) {
    throw new Error('CSV parser returned an unexpected row shape');
  }
  return rows as CsvRow[];
}

function readString(row: CsvRow | undefined, ...columns: string[]): string | undefined {
  if (!row) return undefined;
  for (const column of columns) {
    const value = row[column];
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return undefined;
}

function parseInteger(value: string | undefined, fallback = 0): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function normalizeToken(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseBoolean(value: string | undefined): boolean {
  if (!value) return false;
  return ['1', 'true', 'yes', 'y', 'si', 'sí'].includes(value.trim().toLowerCase());
}

function splitList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split('|')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function displayName(row: CsvRow): string {
  const direct = readString(row, 'displayName', 'display_name', 'name', 'full_name');
  if (direct) return direct;
  const parts = [
    readString(row, 'Nombre', 'givenName', 'given_name', 'first_name'),
    readString(row, 'Apellido', 'familyName', 'family_name', 'last_name'),
  ].filter((part): part is string => !!part);
  return parts.length > 0 ? parts.join(' ') : 'Sin nombre';
}

function statusView(rawStatus: string | undefined): GroupedPersonStatusView {
  const raw = rawStatus?.trim() || 'unknown';
  const normalized = normalizeToken(raw);
  if (['missing', 'desaparecido', 'desaparecida'].includes(normalized)) {
    return { raw, label: 'Desaparecido(a)', tone: 'warning' };
  }
  if (['found', 'found_safe', 'localizado', 'localizada', 'encontrado', 'encontrada', 'encontrado_a_salvo', 'encontrada_a_salvo'].includes(normalized)) {
    return { raw, label: 'Encontrado(a) a salvo', tone: 'success' };
  }
  if (['found_injured', 'herido', 'herida', 'encontrado_herido', 'encontrada_herida'].includes(normalized)) {
    return { raw, label: 'Encontrado(a) herido(a)', tone: 'warning' };
  }
  if (['deceased', 'fallecido', 'fallecida'].includes(normalized)) {
    return { raw, label: 'Fallecido(a)', tone: 'danger' };
  }
  if (['confirmado', 'confirmed', 'aceptado', 'accepted'].includes(normalized)) {
    return { raw, label: 'Confirmado', tone: 'success' };
  }
  if (['por_confirmar', 'pending', 'unconfirmed', 'review'].includes(normalized)) {
    return { raw, label: 'Por confirmar', tone: 'warning' };
  }
  if (['unknown', 'desconocido'].includes(normalized)) {
    return { raw, label: 'Desconocido', tone: 'neutral' };
  }
  return { raw, label: raw, tone: 'neutral' };
}

function groupStatusView(statuses: string[], statusConflict: boolean): GroupedPersonStatusView {
  const ordered = [...statuses].sort((a, b) => statusPriority(a) - statusPriority(b));
  const chosen = statusView(ordered[0]);
  if (statusConflict && chosen.raw === 'unknown') {
    return { raw: statuses.join(' | '), label: 'Estado en conflicto', tone: 'warning' };
  }
  return chosen;
}

function statusPriority(value: string): number {
  const normalized = normalizeToken(value);
  if (['missing', 'desaparecido', 'desaparecida'].includes(normalized)) return 1;
  if (['found', 'found_safe', 'localizado', 'localizada', 'encontrado', 'encontrada'].includes(normalized)) return 2;
  if (['found_injured', 'herido', 'herida'].includes(normalized)) return 3;
  if (['deceased', 'fallecido', 'fallecida'].includes(normalized)) return 4;
  if (['confirmado', 'confirmed', 'aceptado', 'accepted'].includes(normalized)) return 5;
  if (['por_confirmar', 'pending', 'unconfirmed', 'review'].includes(normalized)) return 6;
  return 7;
}

function extractHttpUrls(value: string | undefined, limit: number): string[] {
  if (!value) return [];
  const urls: string[] = [];
  const matches = value.match(/\bhttps?:\/\/[^\s<>"']+/giu) ?? [];
  for (const match of matches) {
    if (urls.length >= limit) break;
    const trimmed = match.trim().replace(/[),.;\]]+$/u, '');
    try {
      const url = new URL(trimmed);
      if (url.protocol === 'http:' || url.protocol === 'https:') urls.push(url.href);
    } catch {
      // Ignore malformed source fragments while preserving other usable links.
    }
  }
  return [...new Set(urls)];
}

function sourceLabel(row: CsvRow, urls: readonly string[], options: GroupedPersonViewOptions): string {
  const fromColumn = options.sourceLabelColumn ? readString(row, options.sourceLabelColumn) : undefined;
  if (fromColumn) return fromColumn;
  const sourceId = readString(row, 'source_id', 'source', 'sourceId') ?? '';
  const mapped = sourceId ? options.sourceLabelById?.[sourceId] : undefined;
  if (mapped) return mapped;
  if (sourceId) return sourceId;
  if (urls[0]) return new URL(urls[0]).hostname.replace(/^www\./u, '');
  return options.defaultSourceLabel ?? 'Fuente';
}

function reportView(row: CsvRow, options: GroupedPersonViewOptions): GroupedPersonReportView {
  const urls = extractHttpUrls(
    readString(row, options.sourceUrlColumn ?? DEFAULT_SOURCE_URL_COLUMN),
    options.maxSourceUrlsPerReport ?? DEFAULT_MAX_SOURCE_URLS,
  );
  const numReports = parseInteger(readString(row, 'NumReportes', 'num_reports', 'numReports'), 1);
  const age = parseInteger(readString(row, 'Edad', 'age'), -1);
  return {
    rowNumber: parseInteger(readString(row, 'row_number', 'rowNumber')),
    sourceId: readString(row, 'source_id', 'source', 'sourceId') ?? 'unknown-source',
    externalId: readString(row, 'external_id', 'externalId') ?? '',
    displayName: displayName(row),
    ...(age >= 0 ? { age } : {}),
    ...(readString(row, 'Sexo', 'sex') ? { sex: readString(row, 'Sexo', 'sex') } : {}),
    ...(readString(row, 'Hospital', 'hospital', 'admin2') ? { hospital: readString(row, 'Hospital', 'hospital', 'admin2') } : {}),
    numReports,
    status: statusView(readString(row, 'Status', 'status')),
    source: {
      label: sourceLabel(row, urls, options),
      urls,
      ...(urls[0] ? { primaryUrl: urls[0] } : {}),
    },
  };
}

function shouldExcludeGroup(row: CsvRow | undefined, options: GroupedPersonViewOptions): boolean {
  const decision = readString(row, 'moderation_decision');
  if (!decision) return false;
  const excluded = options.excludeModerationDecisions ?? DEFAULT_EXCLUDED_MODERATION_DECISIONS;
  return excluded.map(normalizeToken).includes(normalizeToken(decision));
}

function badgesForGroup(card: Omit<GroupedPersonCardView, 'badges' | 'warnings'>): GroupedPersonBadge[] {
  const badges: GroupedPersonBadge[] = [];
  if (card.hasIdentifier) badges.push({ id: 'identifier_reported', label: 'Cédula reportada', tone: 'success' });
  const reportLabel = card.reportRows === 1 ? '1 reporte' : `${card.reportRows} reportes`;
  if (card.kind === 'single') {
    badges.push({ id: 'single_record', label: `Registro único · ${reportLabel}`, tone: 'neutral' });
  } else if (card.hasIdentifier) {
    badges.push({ id: 'same_record', label: `Mismo registro · ${reportLabel}`, tone: 'info' });
  } else {
    badges.push({ id: 'candidate_match', label: `Posible duplicado · ${reportLabel}`, tone: 'info' });
  }
  if (card.needsModeration) badges.push({ id: 'needs_moderation', label: 'Revisar', tone: 'warning' });
  return badges;
}

function warningsForGroup(row: CsvRow | undefined): GroupedPersonCardWarning[] {
  const warnings: GroupedPersonCardWarning[] = [];
  if (parseBoolean(readString(row, 'status_conflict', 'group_status_conflict'))) {
    warnings.push({
      id: 'status_conflict',
      tone: 'warning',
      message: 'Los reportes del grupo no comparten el mismo estado. Verifica antes de cerrar o publicar.',
    });
  }
  if (parseBoolean(readString(row, 'ci_conflict', 'group_ci_conflict'))) {
    warnings.push({
      id: 'identifier_conflict',
      tone: 'danger',
      message: 'Hay identificadores en conflicto. Requiere revisión manual.',
    });
  }
  return warnings;
}

function buildCard(groupId: string, summaryRow: CsvRow | undefined, reportRows: CsvRow[], options: GroupedPersonViewOptions): GroupedPersonCardView {
  const firstReport = reportRows[0];
  const groupKind = readString(summaryRow, 'group_kind') ?? readString(firstReport, 'group_kind') ?? 'single';
  const reportViews = reportRows.map((row) => reportView(row, options));
  const statusValues = splitList(readString(summaryRow, 'statuses') ?? readString(firstReport, 'group_statuses'));
  const fallbackStatuses = [...new Set(reportViews.map((report) => report.status.raw))];
  const statusConflict = parseBoolean(readString(summaryRow, 'status_conflict') ?? readString(firstReport, 'group_status_conflict'));
  const hasIdentifier = parseBoolean(readString(summaryRow, 'has_ci') ?? readString(firstReport, 'group_has_ci')) ||
    groupKind === 'cedula' ||
    !!readString(summaryRow, 'ci_normalized') ||
    !!readString(firstReport, 'group_ci_normalized');
  const reportRowsCount = parseInteger(readString(summaryRow, 'report_rows') ?? readString(firstReport, 'group_report_rows'), reportViews.length);
  const totalReports = parseInteger(
    readString(summaryRow, 'total_num_reportes') ?? readString(firstReport, 'group_total_num_reportes'),
    reportViews.reduce((sum, report) => sum + report.numReports, 0),
  );
  const title = readString(summaryRow, 'representative_name') ??
    readString(firstReport, 'group_representative_name') ??
    reportViews[0]?.displayName ??
    'Sin nombre';
  const subtitle = readString(summaryRow, 'representative_hospital') ??
    readString(firstReport, 'group_representative_hospital') ??
    readString(summaryRow, 'hospitals') ??
    readString(firstReport, 'group_hospitals') ??
    reportViews[0]?.hospital;
  const needsModeration = parseBoolean(readString(summaryRow, 'needs_moderation') ?? readString(firstReport, 'needs_moderation'));
  const baseCard = {
    groupId,
    sortBucket: parseInteger(readString(summaryRow, 'group_sort_bucket') ?? readString(firstReport, 'group_sort_bucket'), 99),
    kind: groupKind,
    confidence: readString(summaryRow, 'group_confidence') ?? readString(firstReport, 'group_confidence') ?? 'unknown',
    title,
    ...(subtitle ? { subtitle } : {}),
    hasIdentifier,
    reportRows: reportRowsCount,
    totalReports,
    status: groupStatusView(statusValues.length > 0 ? statusValues : fallbackStatuses, statusConflict),
    needsModeration,
    reports: reportViews.sort((a, b) => a.rowNumber - b.rowNumber),
  };

  return {
    ...baseCard,
    badges: badgesForGroup(baseCard),
    warnings: warningsForGroup(summaryRow ?? firstReport),
  };
}

function sectionView(id: string, title: string, description: string, groups: readonly GroupedPersonCardView[]): GroupedPersonViewSection {
  return {
    id,
    title,
    description,
    groupIds: groups.map((group) => group.groupId),
  };
}

function isLocalizedStatus(rawStatus: string, options: GroupedPersonViewOptions): boolean {
  const localized = options.localizedStatusValues ?? DEFAULT_LOCALIZED_STATUSES;
  const normalized = normalizeToken(rawStatus);
  return localized.map(normalizeToken).includes(normalized);
}

export function buildGroupedPersonViewModel(
  groupSummaryCsvText: string,
  groupedReportsCsvText: string,
  options: GroupedPersonViewOptions = {},
): GroupedPersonViewModel {
  const summaryRows = parseCsvRows(groupSummaryCsvText);
  const reportRows = parseCsvRows(groupedReportsCsvText);
  const summaryByGroup = new Map(summaryRows.map((row) => [readString(row, 'group_id') ?? '', row]));
  const reportsByGroup = new Map<string, CsvRow[]>();

  for (const row of reportRows) {
    const groupId = readString(row, 'group_id');
    if (!groupId) continue;
    const group = reportsByGroup.get(groupId);
    if (group) group.push(row);
    else reportsByGroup.set(groupId, [row]);
  }

  const groups = [...reportsByGroup.entries()]
    .filter(([groupId]) => !shouldExcludeGroup(summaryByGroup.get(groupId), options))
    .map(([groupId, rows]) => buildCard(groupId, summaryByGroup.get(groupId), rows, options))
    .sort((a, b) => (
      a.sortBucket - b.sortBucket ||
      Number(b.hasIdentifier) - Number(a.hasIdentifier) ||
      Number(b.needsModeration) - Number(a.needsModeration) ||
      b.reportRows - a.reportRows ||
      a.title.localeCompare(b.title)
    ));

  const withIdentifier = groups.filter((group) => group.hasIdentifier);
  const needsReview = groups.filter((group) => group.needsModeration && !group.hasIdentifier);
  const singleRecords = groups.filter((group) => group.kind === 'single' && !group.hasIdentifier);

  return {
    stats: {
      groupsTotal: groups.length,
      sourceRows: reportRows.length,
      reportsGathered: groups.reduce((sum, group) => sum + group.totalReports, 0),
      localizedReports: groups.reduce((sum, group) => (
        sum + group.reports.reduce((reportSum, report) => (
          reportSum + (isLocalizedStatus(report.status.raw, options) ? report.numReports : 0)
        ), 0)
      ), 0),
      groupsWithIdentifier: withIdentifier.length,
      groupsNeedingModeration: groups.filter((group) => group.needsModeration).length,
      groupsWithStatusConflict: groups.filter((group) => group.warnings.some((warning) => warning.id === 'status_conflict')).length,
    },
    sections: [
      sectionView(
        'identified_with_identifier',
        'Identificados con cédula',
        'Registros aceptados que reportan una cédula. Agrupados con alta confianza.',
        withIdentifier,
      ),
      sectionView(
        'needs_review',
        'Por revisar',
        'Grupos sin cédula o con señales mixtas que necesitan revisión manual.',
        needsReview,
      ),
      sectionView(
        'single_records',
        'Registros únicos',
        'Reportes que no se agruparon con otros registros.',
        singleRecords,
      ),
    ],
    groups,
  };
}
