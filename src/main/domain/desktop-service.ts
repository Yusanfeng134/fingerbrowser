import { randomUUID } from 'node:crypto';
import type {
  CreateDesktopFolderFromShortcutsInput,
  CreateDesktopFolderInput,
  CreateDesktopShortcutInput,
  DesktopFolder,
  DesktopItem,
  DesktopShortcut,
  MoveDesktopShortcutInput,
  ProfileStatus,
  ReorderDesktopFolderShortcutsInput,
  ReorderDesktopItemsInput,
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
  folder_id: string | null;
  folder_name: string | null;
  position_index: number;
  created_at: string;
  updated_at: string;
  profile_name: string;
  profile_status: ProfileStatus;
  runtime_channel: RuntimeChannel;
}

interface DesktopFolderRow {
  id: string;
  name: string;
  position_index: number;
  created_at: string;
  updated_at: string;
  shortcut_count: number;
}

interface ProfileExistsRow {
  id: string;
}

export interface DesktopService {
  listShortcuts(): DesktopShortcut[];
  listFolders(): DesktopFolder[];
  listDesktopItems(): DesktopItem[];
  createShortcut(input: CreateDesktopShortcutInput): DesktopShortcut;
  createFolder(input?: CreateDesktopFolderInput): DesktopFolder;
  createFolderFromShortcuts(input: CreateDesktopFolderFromShortcutsInput): DesktopFolder;
  moveShortcut(input: MoveDesktopShortcutInput): DesktopShortcut;
  reorderDesktopItems(input: ReorderDesktopItemsInput): DesktopItem[];
  reorderFolderShortcuts(input: ReorderDesktopFolderShortcutsInput): DesktopShortcut[];
  deleteShortcut(id: string): void;
  deleteFolder(id: string): void;
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
      folderId: row.folder_id,
      folderName: row.folder_name,
      positionIndex: row.position_index,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  function mapFolder(row: DesktopFolderRow): DesktopFolder {
    return {
      id: row.id,
      name: row.name,
      shortcutCount: row.shortcut_count,
      positionIndex: row.position_index,
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

  function getFolder(id: string): DesktopFolder {
    const row = selectFolderById(id);
    if (!row) {
      throw new Error('桌面文件夹不存在');
    }
    return mapFolder(row);
  }

  function selectShortcutById(id: string): DesktopShortcutRow | undefined {
    return shortcutQuery('where ds.id = ?').get(id) as DesktopShortcutRow | undefined;
  }

  function selectShortcutByProfile(profileId: string): DesktopShortcutRow | undefined {
    return shortcutQuery('where ds.profile_id = ?').get(profileId) as DesktopShortcutRow | undefined;
  }

  function selectFolderById(id: string): DesktopFolderRow | undefined {
    return folderQuery('where df.id = ?').get(id) as DesktopFolderRow | undefined;
  }

  function shortcutQuery(whereClause = '') {
    return db.prepare(
      `select
        ds.id,
        ds.profile_id,
        ds.icon_variant,
        ds.folder_id,
        df.name as folder_name,
        ds.position_index,
        ds.created_at,
        ds.updated_at,
        p.name as profile_name,
        p.status as profile_status,
        p.runtime_channel
      from desktop_shortcuts ds
      join profiles p on p.id = ds.profile_id
      left join desktop_folders df on df.id = ds.folder_id
      ${whereClause}`
    );
  }

  function folderQuery(whereClause = '', orderClause = '') {
    return db.prepare(
      `select
        df.id,
        df.name,
        df.position_index,
        df.created_at,
        df.updated_at,
        count(ds.id) as shortcut_count
      from desktop_folders df
      left join desktop_shortcuts ds on ds.folder_id = df.id
      ${whereClause}
      group by df.id
      ${orderClause}`
    );
  }

  function assertProfileExists(profileId: string): void {
    const profile = db.prepare('select id from profiles where id = ?').get(profileId) as ProfileExistsRow | undefined;
    if (!profile) {
      throw new Error('浏览器环境不存在');
    }
  }

  function countTopItems(): number {
    const shortcuts = db.prepare('select count(*) as count from desktop_shortcuts where folder_id is null').get() as {
      count: number;
    };
    const folders = db.prepare('select count(*) as count from desktop_folders').get() as { count: number };
    return shortcuts.count + folders.count;
  }

  function countFolderShortcuts(folderId: string): number {
    return (
      db.prepare('select count(*) as count from desktop_shortcuts where folder_id = ?').get(folderId) as { count: number }
    ).count;
  }

  function normalizeTopPositions(): void {
    const items = listDesktopItems();
    const updateShortcut = db.prepare('update desktop_shortcuts set position_index = ?, updated_at = ? where id = ?');
    const updateFolder = db.prepare('update desktop_folders set position_index = ?, updated_at = ? where id = ?');
    const now = new Date().toISOString();
    items.forEach((item, index) => {
      if (item.type === 'shortcut') {
        updateShortcut.run(index, now, item.id);
      } else {
        updateFolder.run(index, now, item.id);
      }
    });
  }

  function normalizeFolderPositions(folderId: string): void {
    const rows = shortcutQuery('where ds.folder_id = ? order by ds.position_index asc, ds.created_at asc').all(
      folderId
    ) as DesktopShortcutRow[];
    const update = db.prepare('update desktop_shortcuts set position_index = ?, updated_at = ? where id = ?');
    const now = new Date().toISOString();
    rows.forEach((row, index) => update.run(index, now, row.id));
  }

  function listShortcuts(): DesktopShortcut[] {
    const rows = shortcutQuery('order by ds.folder_id is not null, ds.folder_id, ds.position_index asc, ds.created_at asc').all() as DesktopShortcutRow[];
    return rows.map(mapShortcut);
  }

  function listFolders(): DesktopFolder[] {
    const rows = folderQuery('', 'order by df.position_index asc, df.created_at asc').all() as DesktopFolderRow[];
    return rows.map(mapFolder);
  }

  function listDesktopItems(): DesktopItem[] {
    const shortcuts = (
      shortcutQuery('where ds.folder_id is null order by ds.position_index asc, ds.created_at asc').all() as DesktopShortcutRow[]
    ).map((row) => ({
      type: 'shortcut' as const,
      id: row.id,
      positionIndex: row.position_index,
      shortcut: mapShortcut(row)
    }));
    const folders = listFolders().map((folder) => ({
      type: 'folder' as const,
      id: folder.id,
      positionIndex: folder.positionIndex,
      folder
    }));
    return [...shortcuts, ...folders].sort((first, second) => first.positionIndex - second.positionIndex);
  }

  function createFolder(input: CreateDesktopFolderInput = {}): DesktopFolder {
    const now = new Date().toISOString();
    const id = randomUUID();
    const name = input.name?.trim() || '新建文件夹';
    db.prepare(
      'insert into desktop_folders (id, name, position_index, created_at, updated_at) values (?, ?, ?, ?, ?)'
    ).run(id, name, countTopItems(), now, now);
    return getFolder(id);
  }

  return {
    listShortcuts,
    listFolders,
    listDesktopItems,
    createShortcut(input: CreateDesktopShortcutInput): DesktopShortcut {
      assertProfileExists(input.profileId);
      const existing = selectShortcutByProfile(input.profileId);
      if (existing) {
        return mapShortcut(existing);
      }

      const now = new Date().toISOString();
      const id = randomUUID();
      db.prepare(
        `insert into desktop_shortcuts (
          id, profile_id, folder_id, icon_variant, position_index, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?)`
      ).run(id, input.profileId, null, iconVariants[countTopItems() % iconVariants.length], countTopItems(), now, now);
      return getShortcut(id);
    },
    createFolder,
    createFolderFromShortcuts(input: CreateDesktopFolderFromShortcutsInput): DesktopFolder {
      if (input.sourceShortcutId === input.targetShortcutId) {
        throw new Error('不能用同一个快捷方式创建文件夹');
      }
      const source = getShortcut(input.sourceShortcutId);
      const target = getShortcut(input.targetShortcutId);
      const now = new Date().toISOString();
      const folderId = randomUUID();
      const folderName = input.name?.trim() || '新建文件夹';
      const folderPosition = Math.min(source.positionIndex, target.positionIndex);

      db.prepare(
        'insert into desktop_folders (id, name, position_index, created_at, updated_at) values (?, ?, ?, ?, ?)'
      ).run(folderId, folderName, folderPosition, now, now);
      db.prepare('update desktop_shortcuts set folder_id = ?, position_index = ?, updated_at = ? where id = ?').run(
        folderId,
        0,
        now,
        source.id
      );
      db.prepare('update desktop_shortcuts set folder_id = ?, position_index = ?, updated_at = ? where id = ?').run(
        folderId,
        1,
        now,
        target.id
      );
      normalizeTopPositions();
      return getFolder(folderId);
    },
    moveShortcut(input: MoveDesktopShortcutInput): DesktopShortcut {
      const shortcut = getShortcut(input.shortcutId);
      const now = new Date().toISOString();
      const nextPosition = input.folderId ? countFolderShortcuts(input.folderId) : countTopItems();
      if (input.folderId) {
        getFolder(input.folderId);
      }
      db.prepare('update desktop_shortcuts set folder_id = ?, position_index = ?, updated_at = ? where id = ?').run(
        input.folderId,
        nextPosition,
        now,
        shortcut.id
      );
      if (shortcut.folderId) {
        normalizeFolderPositions(shortcut.folderId);
      }
      if (input.folderId) {
        normalizeFolderPositions(input.folderId);
      }
      normalizeTopPositions();
      return getShortcut(shortcut.id);
    },
    reorderDesktopItems(input: ReorderDesktopItemsInput): DesktopItem[] {
      const current = listDesktopItems();
      const byKey = new Map(current.map((item) => [`${item.type}:${item.id}`, item]));
      const requested = input.items
        .map((item) => byKey.get(`${item.type}:${item.id}`))
        .filter((item): item is DesktopItem => Boolean(item));
      const requestedKeys = new Set(requested.map((item) => `${item.type}:${item.id}`));
      const ordered = [...requested, ...current.filter((item) => !requestedKeys.has(`${item.type}:${item.id}`))];
      const now = new Date().toISOString();
      const updateShortcut = db.prepare('update desktop_shortcuts set folder_id = null, position_index = ?, updated_at = ? where id = ?');
      const updateFolder = db.prepare('update desktop_folders set position_index = ?, updated_at = ? where id = ?');
      ordered.forEach((item, index) => {
        if (item.type === 'shortcut') {
          updateShortcut.run(index, now, item.id);
        } else {
          updateFolder.run(index, now, item.id);
        }
      });
      return listDesktopItems();
    },
    reorderFolderShortcuts(input: ReorderDesktopFolderShortcutsInput): DesktopShortcut[] {
      getFolder(input.folderId);
      const current = (
        shortcutQuery('where ds.folder_id = ? order by ds.position_index asc, ds.created_at asc').all(
          input.folderId
        ) as DesktopShortcutRow[]
      ).map(mapShortcut);
      const byId = new Map(current.map((shortcut) => [shortcut.id, shortcut]));
      const requested = input.shortcutIds.map((id) => byId.get(id)).filter((shortcut): shortcut is DesktopShortcut => Boolean(shortcut));
      const requestedIds = new Set(requested.map((shortcut) => shortcut.id));
      const ordered = [...requested, ...current.filter((shortcut) => !requestedIds.has(shortcut.id))];
      const now = new Date().toISOString();
      const update = db.prepare('update desktop_shortcuts set position_index = ?, updated_at = ? where id = ?');
      ordered.forEach((shortcut, index) => update.run(index, now, shortcut.id));
      return listShortcuts().filter((shortcut) => shortcut.folderId === input.folderId);
    },
    deleteShortcut(id: string): void {
      const shortcut = getShortcut(id);
      const result = db.prepare('delete from desktop_shortcuts where id = ?').run(id);
      if (result.changes === 0) {
        throw new Error('桌面快捷方式不存在');
      }
      if (shortcut.folderId) {
        normalizeFolderPositions(shortcut.folderId);
      }
      normalizeTopPositions();
    },
    deleteFolder(id: string): void {
      getFolder(id);
      const now = new Date().toISOString();
      const shortcuts = listShortcuts().filter((shortcut) => shortcut.folderId === id);
      const updateShortcut = db.prepare('update desktop_shortcuts set folder_id = null, position_index = ?, updated_at = ? where id = ?');
      shortcuts.forEach((shortcut) => updateShortcut.run(countTopItems(), now, shortcut.id));
      const result = db.prepare('delete from desktop_folders where id = ?').run(id);
      if (result.changes === 0) {
        throw new Error('桌面文件夹不存在');
      }
      normalizeTopPositions();
    },
    getShortcut
  };
}
