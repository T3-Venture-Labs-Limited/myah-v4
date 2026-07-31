export class WorkspaceSharedConnectedAccountConflictError extends Error {
  constructor() {
    super('A workspace-shared connected account already exists');
    this.name = WorkspaceSharedConnectedAccountConflictError.name;
  }
}
