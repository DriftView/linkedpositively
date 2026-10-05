/** Client-safe constants shared by schemas and components. */
export const PN_CONTACT_METHODS_LIST = ["voice", "voicemail", "sms", "email"] as const;
export type ContactMethod = (typeof PN_CONTACT_METHODS_LIST)[number];

/** Extensions accepted for shared files (legacy: jpg jpeg gif png csv doc docx odt pdf xls xlsx). */
export const FILE_ACCEPT = ".jpg,.jpeg,.gif,.png,.webp,.pdf,.csv,.doc,.docx,.odt,.xls,.xlsx";
export const MAX_FILE_BYTES = 8 * 1024 * 1024;
