export interface User {
  id: string;
  email?: string;
  display_name: string;
  avatar_url?: string | null;
  role: "admin" | "member";
  is_active?: boolean;
}

export interface DailyLog {
  id: string;
  user_id: string;
  log_date: string;
  content: Record<string, unknown>;
  word_count: number;
}

export interface ResearchNote {
  id: string;
  user_id: string;
  title: string;
  content: Record<string, unknown>;
  is_shared: boolean;
  is_pinned: boolean;
}

export interface SharedPost {
  id: string;
  user_id: string;
  type: "kanban" | "article";
  title: string;
  content: Record<string, unknown>;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface Comment {
  id: string;
  user_id: string;
  body: Record<string, unknown>;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body?: string;
  is_read: boolean;
}

export interface ScheduleEvent {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
}

export interface Upload {
  id: string;
  filename: string;
  public_url: string;
}

export interface Bookmark {
  id: string;
  content_type: "research_note" | "shared_post";
  content_id: string;
}

export interface AiSummary {
  id: string;
  user_id: string;
  summary_date: string;
  summary_text: string;
  activity_score: number;
}
