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
  UsageRecord,
} from '@hcp/contracts';

/** 内存 Store，供测试与无持久化场景使用。 */
export function createMemoryStore(): Store {
  return new MemoryStore();
}

class MemoryStore implements Store {
  private projects = new Map<string, ProjectRecord>();
  private tasks = new Map<string, TaskRecord>();
  private stages = new Map<string, StageRecord>();
  private runs = new Map<string, RunRecord>();
  private events: EventRecord[] = [];
  private artifacts = new Map<string, ArtifactRecord>();
  private approvals = new Map<string, ApprovalRecord>();
  private usage: UsageRecord[] = [];
  private context: ContextRecord[] = [];
  private nextEventId = 1;

  upsertProject(project: ProjectRecord): void {
    this.projects.set(project.id, { ...project });
  }
  getProject(id: string): ProjectRecord | null {
    return this.projects.get(id) ?? null;
  }

  createTask(task: TaskRecord): void {
    this.tasks.set(task.id, { ...task });
  }
  getTask(id: string): TaskRecord | null {
    return this.tasks.get(id) ?? null;
  }
  updateTaskStatus(id: string, status: TaskStatus, updatedAt: string): void {
    const task = this.tasks.get(id);
    if (task) this.tasks.set(id, { ...task, status, updatedAt });
  }

  createStage(stage: StageRecord): void {
    this.stages.set(stage.id, { ...stage });
  }
  getStage(id: string): StageRecord | null {
    return this.stages.get(id) ?? null;
  }
  listStagesByTask(taskId: string): StageRecord[] {
    return [...this.stages.values()].filter((s) => s.taskId === taskId);
  }
  updateStageStatus(id: string, status: StageStatus, workspace?: string | null): void {
    const stage = this.stages.get(id);
    if (!stage) return;
    this.stages.set(id, {
      ...stage,
      status,
      workspace: workspace === undefined ? stage.workspace : workspace,
    });
  }

  createRun(run: RunRecord): void {
    this.runs.set(run.id, { ...run });
  }
  getRun(id: string): RunRecord | null {
    return this.runs.get(id) ?? null;
  }
  listRunsByStage(stageId: string): RunRecord[] {
    return [...this.runs.values()].filter((r) => r.stageId === stageId);
  }
  updateRun(id: string, patch: RunPatch): void {
    const run = this.runs.get(id);
    if (!run) return;
    const next: RunRecord = { ...run };
    for (const [k, v] of Object.entries(patch)) {
      (next as unknown as Record<string, unknown>)[k] = v;
    }
    this.runs.set(id, next);
  }

  appendEvent(event: Omit<EventRecord, 'id'>): number {
    const id = this.nextEventId++;
    this.events.push({ ...event, id });
    return id;
  }
  listEvents(runId: string, afterId?: number): EventRecord[] {
    return this.events.filter(
      (e) => e.runId === runId && (afterId === undefined || e.id > afterId),
    );
  }

  createArtifact(artifact: ArtifactRecord): void {
    this.artifacts.set(artifact.id, { ...artifact });
  }
  listArtifactsByRun(runId: string): ArtifactRecord[] {
    return [...this.artifacts.values()].filter((a) => a.runId === runId);
  }

  createApproval(approval: ApprovalRecord): void {
    this.approvals.set(approval.id, { ...approval });
  }
  getApproval(id: string): ApprovalRecord | null {
    return this.approvals.get(id) ?? null;
  }
  updateApproval(id: string, status: ApprovalStatus, decidedAt: string, note?: string): void {
    const approval = this.approvals.get(id);
    if (!approval) return;
    this.approvals.set(id, {
      ...approval,
      status,
      decidedAt,
      note: note === undefined ? approval.note : note,
    });
  }

  appendUsage(usage: UsageRecord): void {
    this.usage.push({ ...usage });
  }
  listUsageByRun(runId: string): UsageRecord[] {
    return this.usage.filter((u) => u.runId === runId);
  }

  appendContext(context: ContextRecord): void {
    this.context.push({ ...context });
  }
  listContextByProject(projectId: string): ContextRecord[] {
    return this.context.filter((c) => c.projectId === projectId);
  }

  close(): void {
    // 无资源需释放
  }
}
