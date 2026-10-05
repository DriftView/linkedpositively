import Papa from "papaparse";
import { isValidLatLng, parseZip, splitTags, websiteHref } from "./lib";

/**
 * CSV import for resources (replaces the Drupal Feeds importer
 * `resources_import`, docs/legacy/04 §6.6). Pure: used by the preview in the
 * browser and re-run on the server before anything is written.
 */

export type ImportField =
  | "guid"
  | "title"
  | "address"
  | "state"
  | "city"
  | "zip"
  | "website"
  | "contact"
  | "hours"
  | "eligibility"
  | "scheduling"
  | "covidUpdates"
  | "insuranceStatus"
  | "services"
  | "tags"
  | "description"
  | "latitude"
  | "longitude";

/** Header → field. The first header of each field is the one in our template. */
export const IMPORT_COLUMNS: { field: ImportField; headers: string[]; label: string; required?: boolean }[] = [
  { field: "guid", headers: ["Serial No", "Serial Number", "ID", "GUID"], label: "Serial No (unique id)" },
  { field: "title", headers: ["Organization", "Organisation", "Name", "Title", "Resource Name"], label: "Organization", required: true },
  { field: "address", headers: ["Street Address", "Address", "Street"], label: "Street address" },
  { field: "city", headers: ["City"], label: "City" },
  { field: "state", headers: ["State"], label: "State" },
  { field: "zip", headers: ["Zip", "ZIP", "Zip Code", "Postal Code"], label: "ZIP" },
  { field: "website", headers: ["Website", "URL", "Web"], label: "Website" },
  { field: "contact", headers: ["Contact Info", "Contact", "Phone"], label: "Contact" },
  { field: "hours", headers: ["Hours"], label: "Hours" },
  { field: "eligibility", headers: ["Eligibility Requirements", "Eligibility"], label: "Eligibility" },
  { field: "scheduling", headers: ["Scheduling"], label: "Scheduling" },
  { field: "covidUpdates", headers: ["Patient Status", "Covid-19 Updates", "COVID-19 Updates"], label: "Covid-19 updates" },
  { field: "insuranceStatus", headers: ["Rapid Tests Available", "Insurance Status", "Insurance"], label: "Insurance status" },
  { field: "services", headers: ["Other Services", "Services"], label: "Other services" },
  { field: "tags", headers: ["Other tags", "Other Tags", "Tags"], label: "Tags" },
  { field: "description", headers: ["Description", "Notes"], label: "Description" },
  { field: "latitude", headers: ["Latitude", "Lat"], label: "Latitude" },
  { field: "longitude", headers: ["Longitude", "Lng", "Lon", "Long"], label: "Longitude" },
];

export const MAX_IMPORT_ROWS = 2000;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

const LIMITS: Partial<Record<ImportField, number>> = {
  title: 200,
  address: 300,
  city: 120,
  state: 60,
  zip: 12,
  website: 500,
  contact: 500,
  hours: 2000,
  description: 5000,
};

export type ImportRow = {
  /** 1-based line number in the file (header is line 1). */
  line: number;
  guid: string | null;
  title: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  website: string;
  contact: string;
  hours: string;
  eligibility: string;
  scheduling: string;
  covidUpdates: string;
  insuranceStatus: string;
  services: string;
  description: string;
  tags: string[];
  coordinates: { lat: number; lng: number } | null;
  errors: string[];
  warnings: string[];
};

export type ImportParseResult = {
  rows: ImportRow[];
  /** Headers found in the file that map to nothing (shown so staff can fix typos). */
  unknownHeaders: string[];
  /** Fields we recognised, in file order. */
  mappedFields: ImportField[];
  fatal: string | null;
};

function normalizeHeader(value: string) {
  return value.replace(/^﻿/, "").trim().toLowerCase().replace(/[\s_-]+/g, " ");
}

const HEADER_LOOKUP = new Map<string, ImportField>();
for (const column of IMPORT_COLUMNS) for (const header of column.headers) HEADER_LOOKUP.set(normalizeHeader(header), column.field);

export function parseResourceCsv(text: string): ImportParseResult {
  if (text.length > MAX_IMPORT_BYTES) {
    return { rows: [], unknownHeaders: [], mappedFields: [], fatal: "That file is larger than 2 MB. Split it into smaller files." };
  }
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim(),
  });
  const headers = parsed.meta.fields ?? [];
  const headerField = new Map<string, ImportField>();
  const unknownHeaders: string[] = [];
  for (const header of headers) {
    const field = HEADER_LOOKUP.get(normalizeHeader(header));
    if (field && ![...headerField.values()].includes(field)) headerField.set(header, field);
    else if (!field && header) unknownHeaders.push(header);
  }
  const mappedFields = [...headerField.values()];
  if (!mappedFields.includes("title")) {
    return {
      rows: [],
      unknownHeaders,
      mappedFields,
      fatal: 'We couldn\'t find an "Organization" column. Check that the first row holds the column names.',
    };
  }
  if (parsed.data.length > MAX_IMPORT_ROWS) {
    return { rows: [], unknownHeaders, mappedFields, fatal: `That file has ${parsed.data.length} rows. Import at most ${MAX_IMPORT_ROWS} at a time.` };
  }

  const seenGuids = new Map<string, number>();
  const rows = parsed.data.map((record, index) => {
    const values: Partial<Record<ImportField, string>> = {};
    for (const [header, field] of headerField) values[field] = (record[header] ?? "").toString().trim();
    const row: ImportRow = {
      line: index + 2,
      guid: values.guid || null,
      title: values.title ?? "",
      address: values.address ?? "",
      city: values.city ?? "",
      state: values.state ?? "",
      zip: values.zip ?? "",
      website: values.website ?? "",
      contact: values.contact ?? "",
      hours: values.hours ?? "",
      eligibility: values.eligibility ?? "",
      scheduling: values.scheduling ?? "",
      covidUpdates: values.covidUpdates ?? "",
      insuranceStatus: values.insuranceStatus ?? "",
      services: values.services ?? "",
      description: values.description ?? "",
      tags: splitTags(values.tags),
      coordinates: null,
      errors: [],
      warnings: [],
    };

    if (!row.title) row.errors.push("Organization is empty");
    for (const [field, limit] of Object.entries(LIMITS) as [ImportField, number][]) {
      const value = values[field];
      if (value && value.length > limit) row.errors.push(`${labelFor(field)} is longer than ${limit} characters`);
    }
    if (row.guid) {
      const previous = seenGuids.get(row.guid);
      if (previous) row.errors.push(`Serial No "${row.guid}" is also used on line ${previous}`);
      else seenGuids.set(row.guid, row.line);
    }
    if (row.zip) {
      const zip = parseZip(row.zip);
      if (zip) row.zip = zip;
      else row.warnings.push(`ZIP "${row.zip}" doesn't look like a US ZIP code`);
    }
    if (row.website) {
      const href = websiteHref(row.website);
      if (href) row.website = href;
      else row.warnings.push("Website isn't a valid web address; it will be left out");
    }
    if (!row.address && !row.city && !row.zip) row.warnings.push("No address, city or ZIP: it won't show up in location searches");
    if (values.latitude || values.longitude) {
      const lat = Number(values.latitude);
      const lng = Number(values.longitude);
      if (values.latitude && values.longitude && isValidLatLng(lat, lng)) row.coordinates = { lat, lng };
      else row.warnings.push("Latitude/longitude are incomplete or invalid; the address will be geocoded instead");
    }
    return row;
  });

  return { rows, unknownHeaders, mappedFields, fatal: null };
}

function labelFor(field: ImportField) {
  return IMPORT_COLUMNS.find((column) => column.field === field)?.label ?? field;
}

/** CSV cell escaping for exports (also neutralises spreadsheet formulas). */
export function csvCell(value: unknown) {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: unknown[][]) {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
