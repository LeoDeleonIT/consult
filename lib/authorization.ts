import type { Role } from "./types";

export function canAccessManager(role: Role): boolean {
  return role === "manager";
}

export function canAccessConsultation(input: {
  role: Role;
  userId: string;
  coordinatorId: string;
}): boolean {
  return input.role === "manager" || input.userId === input.coordinatorId;
}

export function canSubmitConsultation(input: {
  role: Role;
  userId: string;
  coordinatorId: string;
}): boolean {
  return input.role === "coordinator" && input.userId === input.coordinatorId;
}

export function canDeleteConsultation(role: Role): boolean {
  return role === "manager";
}
