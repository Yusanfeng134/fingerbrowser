import { randomUUID } from 'node:crypto';
import type {
  CreateDesktopShortcutInput,
  DesktopShortcut,
  ProfileStatus,
  RuntimeChannel
} from '../../shared/types';
import type { ApplicationDatabase } from '../infrastructure/database';

interface DesktopServiceOptions {
  db: ApplicationDatabase;
}

interface DesktopShortcutRow {
  id: string;
  profile_id: string;
  icon_variant: string;
  position_index: number;
  created_at: string;
  updated_at: string;
  profile_name: string;
  profile_status: ProfileStatus;
  runtime_channel: RuntimeChannel;
}

interface ProfileExistsRow {
  id: string;
}

export interface DesktopService {
  listShortcuts(): DesktopShortcut[];
  createShortcut(input: CreateDesktopShortcutInput): DesktopShortcut;
  deleteShortcut(id: string): void;
  getShortcut(id: string): DesktopShortcut;
}

const iconVariants = ['emerald', 'blue', 'violet', 'amber', 'rose', 'slate'];

export function createDesktopService(options: DesktopServiceOptions): DesktopService {
  const { db } = options;

  function mapShortcut(row: DesktopShortcutRow): DesktopShortcut {
    return {
      id: row.id,
      profileId: row.profile_id,
      label: row.profile_name,
      profileStatus: row.profile_status,
      runtimeChannel: row.runtime_channel,
      iconVariant: row.icon_variant,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  function getShortcut(id: string): DesktopShortcut {
    const row = selectShortcutById(id);
    if (!row) {
      throw new Error('桌面快捷方式不存在');
    }
    return mapShortcut(row);
  }

  function selectShortcutById(id: string): DesktopShortcutRow | undefined {
    return db
      .prepare(
        `select
          ds.id,
          ds.profile_id,
          ds.icon_variant,
          ds.position_index,
          ds.created_at,
          ds.updated_at,
          p.name as profile_name,
          p.status as profile_status,
          p.runtime_channel
        from desktop_shortcuts ds
        join profiles p on p.id = ds.profile_id
        where ds.id = ?`
      )
      .get(id) as DesktopShortcutRow | undefined;
  }

  function selectShortcutByProfile(profileId: string): DesktopShortcutRow | undefined {
    return db
      .prepare(
        `select
          ds.id,
          ds.profile_id,
          ds.icon_variant,
          ds.position_index,
          ds.created_at,
          ds.updated_at,
          p.name as profile_name,
          p.status as profile_status,
          p.runtime_channel
        from desktop_shortcuts ds
        join profiles p on p.id = ds.profile_id
        where ds.profile_id = ?`
      )
      .get(profileId) as DesktopShortcutRow | undefined;
  }

  function assertProfileExists(profileId: string): void {
    const profile = db.prepare('select id from profiles where id = ?').get(profileId) as ProfileExistsRow | undefined;
    if (!profile) {
      throw new Error('浏览器环境不存在');
    }
  }

  return {
    listShortcuts(): DesktopShortcut[] {
      const rows = db
        .prepare(
          `select
            ds.id,
            ds.profile_id,
            ds.icon_variant,
            ds.position_index,
            ds.created_at,
            ds.updated_at,
            p.name as profile_name,
            p.status as profile_status,
            p.runtime_channel
          from desktop_shortcuts ds
          join profiles p on p.id = ds.profile_id
          order by ds.position_index asc, ds.created_at asc`
        )
        .all() as DesktopShortcutRow[];
      return rows.map(mapShortcut);
    },
    createShortcut(input: CreateDesktopShortcutInput): DesktopShortcut {
      assertProfileExists(input.profileId);
      const existing = selectShortcutByProfile(input.profileId);
      if (existing) {
        return mapShortcut(existing);
      }

      const now = new Date().toISOString();
      const position = (db.prepare('select count(*) as count from desktop_shortcuts').get() as { count: number }).count;
      const id = randomUUID();
      db.prepare(
        `insert into desktop_shortcuts (
          id, profile_id, icon_variant, position_index, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?)`
      ).run(id, input.profileId, iconVariants[position % iconVariants.length], position, now, now);
      return getShortcut(id);
    },
    deleteShortcut(id: string): void {
      const result = db.prepare('delete from desktop_shortcuts where id = ?').run(id);
      if (result.changes === 0) {
        throw new Error('桌面快捷方式不存在');
      }
    },
    getShortcut
  };
}
