export type UserRole = "admin" | "member";

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}
