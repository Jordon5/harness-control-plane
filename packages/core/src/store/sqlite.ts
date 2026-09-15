import { DatabaseSync } from 'node:sqlite';
import type {
  ApprovalRecord,
  ApprovalStatus,
  ArtifactRecord,
  ContextRecord,
  EventRecord,
  ProjectRecord,
  RunPatch,
  RunRecord,
  StageRecord,
  StageStatus,
  Store,
  TaskRecord,
  TaskStatus,
  UnifiedResult,
  UsageRecord,
} from '@hcp/contracts';

const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    root TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    definition TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE stages (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    harness_id TEXT,
    mode TEXT NOT NULL,
    depends_on TEXT NOT NULL,
    owned_paths TEXT NOT NULL,
    status TEXT NOT NULL,
    workspace TEXT
  );
  CREATE TABLE runs (
    id TEXT PRIMARY KEY,
    stage_id TEXT NOT NULL,
    harness_id TEXT,
    model TEXT,
    pid INTEGER,
    status TEXT NOT NULL,
    exit_code INTEGER,
    started_at TEXT,
    ended_at TEXT,
    result TEXT,
    error TEXT,
    config_ref TEXT
  );
  CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    type TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    message TEXT,
    raw TEXT NOT NULL
  );
  CREATE INDEX idx_events_run ON events (run_id, id);
  CREATE TABLE artifacts (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    path TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE approvals (
    id TEXT PRIMARY KEY,
    run_id TEXT,
    task_id TEXT,
    gate TEXT NOT NULL,
    status TEXT NOT NULL,
    requested_at TEXT NOT NULL,
    decided_at TEXT,
    note TEXT
  );
  CREATE TABLE usage (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    stage_id TEXT NOT NULL,
    harness_id TEXT NOT NULL,
    model TEXT,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    total_tokens INTEGER NOT NULL,
    source TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    raw TEXT
  );
  CREATE TABLE context (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    source_run_id TEXT,
    created_at TEXT NOT NULL
  );
  `,
];

/** SQLite Store（node:sqlite）。path 传 ':memory:' 即为内存库。 */
export function createSqliteStore(path: string): Store {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  migrate(db);
  return new SqliteStore(db);
}

function migrate(db: DatabaseSync): void {
  db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  const row = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as
    | { value: string }
    | undefined;
  const current = row ? Number(row.value) : 0;
  for (let i = current; i < MIGRATIONS.length; i++) {
    db.exec(MIGRATIONS[i] as string);
    db.prepare(
      "INSERT INTO meta (key, value) VALUES ('schema_version', ?) " +
        'ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    ).run(String(i + 1));
  }
}

class SqliteStore implements Store {
  constructor(private readonly db: DatabaseSync) {}

  upsertProject(project: ProjectRecord): void {
    this.db
      .prepare(
        'INSERT INTO projects (id, root, created_at) VALUES (?, ?, ?) ' +
          'ON CONFLICT(id) DO UPDATE SET root = excluded.root',
      )
      .run(project.id, project.root, project.createdAt);
  }
  getProject(id: string): ProjectRecord | null {
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row
      ? { id: row['id'] as string, root: row['root'] as string, createdAt: row['created_at'] as string }
      : null;
  }

  createTask(task: TaskRecord): void {
    this.db
      .prepare(
        'INSERT INTO tasks (id, project_id, definition, status, created_at, updated_at) ' +
          'VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(task.id, task.projectId, task.definition, task.status, task.createdAt, task.updatedAt);
  }
  getTask(id: string): TaskRecord | null {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? mapTask(row) : null;
  }
  updateTaskStatus(id: string, status: TaskStatus, updatedAt: string): void {
    this.db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?').run(status, updatedAt, id);
  }

  createStage(stage: StageRecord): void {
    this.db
      .prepare(
        'INSERT INTO stages (id, task_id, harness_id, mode, depends_on, owned_paths, status, workspace) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        stage.id,
        stage.taskId,
        stage.harnessId,
        stage.mode,
        JSON.stringify(stage.dependsOn),
        JSON.stringify(stage.ownedPaths),
        stage.status,
        stage.workspace,
      );
  }
  getStage(id: string): StageRecord | null {
    const row = this.db.prepare('SELECT * FROM stages WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? mapStage(row) : null;
  }
  listStagesByTask(taskId: string): StageRecord[] {
    const rows = this.db.prepare('SELECT * FROM stages WHERE task_id = ?').all(taskId) as Record<
      string,
      unknown
    >[];
    return rows.map(mapStage);
  }
  updateStageStatus(id: string, status: StageStatus, workspace?: string | null): void {
    if (workspace === undefined) {
      this.db.prepare('UPDATE stages SET status = ? WHERE id = ?').run(status, id);
    } else {
      this.db.prepare('UPDATE stages SET status = ?, workspace = ? WHERE id = ?').run(status, workspace, id);
    }
  }

  createRun(run: RunRecord): void {
    this.db
      .prepare(
        'INSERT INTO runs (id, stage_id, harness_id, model, pid, status, exit_code, started_at, ended_at, result, error, config_ref) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        run.id,
        run.stageId,
        run.harnessId,
        run.model,
        run.pid,
        run.status,
        run.exitCode,
        run.startedAt,
        run.endedAt,
        run.result ? JSON.stringify(run.result) : null,
        run.error,
        run.configRef,
      );
  }
  getRun(id: string): RunRecord | null {
    const row = this.db.prepare('SELECT * FROM runs WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? mapRun(row) : null;
  }
  listRunsByStage(stageId: string): RunRecord[] {
    const rows = this.db.prepare('SELECT * FROM runs WHERE stage_id = ?').all(stageId) as Record<
      string,
      unknown
    >[];
    return rows.map(mapRun);
  }
  updateRun(id: string, patch: RunPatch): void {
    const existing = this.getRun(id);
    if (!existing) return;
    const next: RunRecord = { ...existing };
    for (const [k, v] of Object.entries(patch)) {
      (next as unknown as Record<string, unknown>)[k] = v;
    }
    this.db
      .prepare(
        'UPDATE runs SET harness_id = ?, model = ?, pid = ?, status = ?, exit_code = ?, ' +
          'started_at = ?, ended_at = ?, result = ?, error = ?, config_ref = ? WHERE id = ?',
      )
      .run(
        next.harnessId,
        next.model,
        next.pid,
        next.status,
        next.exitCode,
        next.startedAt,
        next.endedAt,
        next.result ? JSON.stringify(next.result) : null,
        next.error,
        next.configRef,
        id,
      );
  }

  appendEvent(event: Omit<EventRecord, 'id'>): number {
    const info = this.db
      .prepare('INSERT INTO events (run_id, type, timestamp, message, raw) VALUES (?, ?, ?, ?, ?)')
      .run(event.runId, event.type, event.timestamp, event.message, event.raw);
    return Number(info.lastInsertRowid);
  }
  listEvents(runId: string, afterId?: number): EventRecord[] {
    const rows = (
      afterId === undefined
        ? this.db.prepare('SELECT * FROM events WHERE run_id = ? ORDER BY id').all(runId)
        : this.db
            .prepare('SELECT * FROM events WHERE run_id = ? AND id > ? ORDER BY id')
            .all(runId, afterId)
    ) as Record<string, unknown>[];
    return rows.map((row) => ({
      id: Number(row['id']),
      runId: row['run_id'] as string,
      type: row['type'] as EventRecord['type'],
      timestamp: row['timestamp'] as string,
      message: (row['message'] as string | null) ?? null,
      raw: row['raw'] as string,
    }));
  }

  createArtifact(artifact: ArtifactRecord): void {
    this.db
      .prepare('INSERT INTO artifacts (id, run_id, kind, path, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(artifact.id, artifact.runId, artifact.kind, artifact.path, artifact.createdAt);
  }
  listArtifactsByRun(runId: string): ArtifactRecord[] {
    const rows = this.db.prepare('SELECT * FROM artifacts WHERE run_id = ?').all(runId) as Record<
      string,
      unknown
    >[];
    return rows.map((row) => ({
      id: row['id'] as string,
      runId: row['run_id'] as string,
      kind: row['kind'] as ArtifactRecord['kind'],
      path: row['path'] as string,
      createdAt: row['created_at'] as string,
    }));
  }

  createApproval(approval: ApprovalRecord): void {
    this.db
      .prepare(
        'INSERT INTO approvals (id, run_id, task_id, gate, status, requested_at, decided_at, note) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        approval.id,
        approval.runId,
        approval.taskId,
        approval.gate,
        approval.status,
        approval.requestedAt,
        approval.decidedAt,
        approval.note,
      );
  }
  getApproval(id: string): ApprovalRecord | null {
    const row = this.db.prepare('SELECT * FROM approvals WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    if (!row) return null;
    return {
      id: row['id'] as string,
      runId: (row['run_id'] as string | null) ?? null,
      taskId: (row['task_id'] as string | null) ?? null,
      gate: row['gate'] as ApprovalRecord['gate'],
      status: row['status'] as ApprovalStatus,
      requestedAt: row['requested_at'] as string,
      decidedAt: (row['decided_at'] as string | null) ?? null,
      note: (row['note'] as string | null) ?? null,
    };
  }
  updateApproval(id: string, status: ApprovalStatus, decidedAt: string, note?: string): void {
    if (note === undefined) {
      this.db.prepare('UPDATE approvals SET status = ?, decided_at = ? WHERE id = ?').run(status, decidedAt, id);
    } else {
      this.db
        .prepare('UPDATE approvals SET status = ?, decided_at = ?, note = ? WHERE id = ?')
        .run(status, decidedAt, note, id);
    }
  }

  appendUsage(usage: UsageRecord): void {
    this.db
      .prepare(
        'INSERT INTO usage (id, run_id, stage_id, harness_id, model, input_tokens, output_tokens, total_tokens, source, timestamp, raw) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        usage.id,
        usage.runId,
        usage.stageId,
        usage.harnessId,
        usage.model,
        usage.inputTokens,
        usage.outputTokens,
        usage.totalTokens,
        usage.source,
        usage.timestamp,
        usage.raw === null ? null : JSON.stringify(usage.raw),
      );
  }
  listUsageByRun(runId: string): UsageRecord[] {
    const rows = this.db.prepare('SELECT * FROM usage WHERE run_id = ?').all(runId) as Record<
      string,
      unknown
    >[];
    return rows.map((row) => ({
      id: row['id'] as string,
      runId: row['run_id'] as string,
      stageId: row['stage_id'] as string,
      harnessId: row['harness_id'] as string,
      model: (row['model'] as string | null) ?? null,
      inputTokens: Number(row['input_tokens']),
      outputTokens: Number(row['output_tokens']),
      totalTokens: Number(row['total_tokens']),
      source: row['source'] as UsageRecord['source'],
      timestamp: row['timestamp'] as string,
      raw: row['raw'] === null ? null : JSON.parse(row['raw'] as string),
    }));
  }

  appendContext(context: ContextRecord): void {
    this.db
      .prepare(
        'INSERT INTO context (id, project_id, kind, key, value, source_run_id, created_at) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        context.id,
        context.projectId,
        context.kind,
        context.key,
        context.value,
        context.sourceRunId,
        context.createdAt,
      );
  }
  listContextByProject(projectId: string): ContextRecord[] {
    const rows = this.db.prepare('SELECT * FROM context WHERE project_id = ?').all(projectId) as Record<
      string,
      unknown
    >[];
    return rows.map((row) => ({
      id: row['id'] as string,
      projectId: row['project_id'] as string,
      kind: row['kind'] as ContextRecord['kind'],
      key: row['key'] as string,
      value: row['value'] as string,
      sourceRunId: (row['source_run_id'] as string | null) ?? null,
      createdAt: row['created_at'] as string,
    }));
  }

  close(): void {
    this.db.close();
  }
}

function mapTask(row: Record<string, unknown>): TaskRecord {
  return {
    id: row['id'] as string,
    projectId: row['project_id'] as string,
    definition: row['definition'] as string,
    status: row['status'] as TaskStatus,
    createdAt: row['created_at'] as string,
    updatedAt: row['updated_at'] as string,
  };
}

function mapStage(row: Record<string, unknown>): StageRecord {
  return {
    id: row['id'] as string,
    taskId: row['task_id'] as string,
    harnessId: (row['harness_id'] as string | null) ?? null,
    mode: row['mode'] as StageRecord['mode'],
    dependsOn: JSON.parse(row['depends_on'] as string) as string[],
    ownedPaths: JSON.parse(row['owned_paths'] as string) as string[],
    status: row['status'] as StageStatus,
    workspace: (row['workspace'] as string | null) ?? null,
  };
}

function mapRun(row: Record<string, unknown>): RunRecord {
  return {
    id: row['id'] as string,
    stageId: row['stage_id'] as string,
    harnessId: (row['harness_id'] as string | null) ?? null,
    model: (row['model'] as string | null) ?? null,
    pid: row['pid'] === null ? null : Number(row['pid']),
    status: row['status'] as RunRecord['status'],
    exitCode: row['exit_code'] === null ? null : Number(row['exit_code']),
    startedAt: (row['started_at'] as string | null) ?? null,
    endedAt: (row['ended_at'] as string | null) ?? null,
    result: row['result'] === null ? null : (JSON.parse(row['result'] as string) as UnifiedResult),
    error: (row['error'] as string | null) ?? null,
    configRef: (row['config_ref'] as string | null) ?? null,
  };
}
