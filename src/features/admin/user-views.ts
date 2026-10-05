export const USER_VIEWS = [
  { id: "all", label: "Everyone" },
  { id: "participants", label: "Participants" },
  { id: "control", label: "Control" },
  { id: "staff", label: "Staff" },
  { id: "deactivated", label: "Deactivated" },
] as const;
export type UserView = (typeof USER_VIEWS)[number]["id"];
