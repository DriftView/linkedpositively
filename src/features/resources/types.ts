import type { ResourceReportReason } from "@/server/db/schema";

export type ResourceTagDTO = { id: string; name: string; slug: string; count?: number };

export type ResourceCardDTO = {
  id: string;
  title: string;
  description: string;
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
  tags: ResourceTagDTO[];
  distanceMiles: number | null;
  ratingAverage: number;
  ratingCount: number;
  favorited: boolean;
};

export type ResourceDetailDTO = ResourceCardDTO & {
  status: "published" | "suggested" | "unpublished";
  myRating: number | null;
  myReport: ResourceReportReason | null;
  hasLocation: boolean;
  updatedAt: string;
};

export type SearchResultDTO = {
  results: ResourceCardDTO[];
  total: number;
  hasMore: boolean;
  mode: "distance" | "text" | "all";
  center: { label: string; source: "device" | "geocoded" | "nearby" } | null;
  /** Explains a fallback, e.g. "We couldn't place that ZIP on the map…". */
  notice: string | null;
  radius: number;
};

export type AdminResourceRowDTO = {
  id: string;
  title: string;
  city: string;
  state: string;
  zip: string;
  address: string;
  contact: string;
  status: "published" | "suggested" | "unpublished";
  geocodeStatus: "ok" | "pending" | "failed" | "none";
  tags: string[];
  openReportCount: number;
  ratingAverage: number;
  ratingCount: number;
  favoriteCount: number;
  suggestedByName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminReportDTO = {
  id: string;
  reason: ResourceReportReason;
  note: string;
  reporterName: string;
  createdAt: string;
};
