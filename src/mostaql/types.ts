export interface MostaqlProject {
  id: string;
  title: string;
  url: string;
  description?: string;
  budget?: {
    min?: number;
    max?: number;
    currency?: string;
  };
  skills: string[];
  client?: {
    name?: string;
    profileUrl?: string;
  };
  publishedAt?: Date;
  publishedRelative?: string;
  status?: string;
  deliveryPeriod?: string;
  bidsCount?: number;
  source: "mostaql";
  discoveredAt: Date;
}

export interface StoredProject {
  id: string;
  title: string;
  url: string;
  description: string | null;
  budget_min: number | null;
  budget_max: number | null;
  currency: string | null;
  published_at: string | null;
  discovered_at: string;
  notified_at: string | null;
}

export interface MonitorRunStats {
  projectsFound: number;
  newProjects: number;
  notificationsSent: number;
  errors: number;
}

export interface MonitorStatus {
  online: boolean;
  lastCheckAt: Date | null;
  nextCheckAt: Date | null;
  lastProjectsFound: number;
  lastNewProjects: number;
  lastNotificationsSent: number;
  totalProjectsStored: number;
  totalNotificationsSent: number;
  notificationsToday: number;
  errors: number;
  initialSyncComplete: boolean;
}
