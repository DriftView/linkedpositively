/** DTOs passed from Peer Navigation queries to (client) components. Plain data only. */
import type { Answers } from "./answers";
import type { SessionStatus } from "./format";

export type PersonRef = { id: string; name: string; username: string };

export type ParticipantListItem = PersonRef & {
  pronouns: string | null;
  completed: number;
  total: number;
  /** Serial of the first started-but-not-complete session in plan order. */
  currentSerial: number | null;
  lastActivityAt: string | null;
  unread: number;
  coach: PersonRef | null;
};

export type ParticipantDetail = PersonRef & {
  email: string;
  firstName: string | null;
  pronouns: string | null;
  location: string | null;
  age: number | null;
  onPrep: boolean | null;
  studyId: string | null;
  participantCode: string | null;
  coach: PersonRef | null;
  isAssignedCoach: boolean;
  createdAt: string | null;
  blocked: boolean;
  timeOnSiteSeconds: number;
  signIns: number;
  lastSignInAt: string | null;
  avatarVersion: string | null;
};

export type PlanSession = {
  serial: number;
  title: string;
  description: string;
  order: number;
  status: SessionStatus;
  startedAt: string | null;
  completedAt: string | null;
  lastModifiedAt: string | null;
  revisionCount: number;
  worksheets: { title: string; href: string }[];
};

export type LegacySession = {
  serial: number;
  status: SessionStatus;
  startedAt: string | null;
  completedAt: string | null;
  revisionCount: number;
};

export type NoteItem = {
  id: string;
  text: string;
  method: string | null;
  sessionSerial: number | null;
  createdAt: string;
  updatedAt: string;
  edited: boolean;
  author: PersonRef | null;
  canEdit: boolean;
};

export type RevisionSummary = { id: string; createdAt: string; coach: PersonRef | null; complete: boolean };

export type RunnerData = {
  participant: PersonRef & { pronouns: string | null };
  serial: number;
  status: SessionStatus;
  startedAt: string | null;
  completedAt: string | null;
  answers: Answers;
  latest: RevisionSummary | null;
  revisions: RevisionSummary[];
  notes: NoteItem[];
  defaultMethod: string | null;
  /** Serials of the plan in coach order, for previous/next navigation. */
  planOrder: number[];
};

export type FileItem = {
  id: string;
  filename: string;
  mime: string;
  size: number;
  createdAt: string;
  uploadedBy: PersonRef | null;
  mine: boolean;
  canRemove: boolean;
};

export type CoachCard = PersonRef & {
  firstName: string | null;
  pronouns: string | null;
  location: string | null;
  aboutMe: string | null;
  zoomLink: string | null;
  avatarVersion: string | null;
};

export type ThreadSummary = {
  id: string;
  subject: string;
  other: PersonRef | null;
  participantId: string;
  lastMessageAt: string;
  preview: string;
  lastFromMe: boolean;
  unread: number;
  canReply: boolean;
};

export type ThreadMessage = {
  id: string;
  body: string;
  createdAt: string;
  author: PersonRef | null;
  mine: boolean;
  unread: boolean;
};

export type ThreadDetail = ThreadSummary & { messages: ThreadMessage[] };
