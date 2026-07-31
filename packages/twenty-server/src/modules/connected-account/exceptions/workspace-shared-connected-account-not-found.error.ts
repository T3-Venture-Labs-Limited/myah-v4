export class WorkspaceSharedConnectedAccountNotFoundError extends Error {
  constructor() {
    super('The expected workspace-shared connected account was not found');
    this.name = WorkspaceSharedConnectedAccountNotFoundError.name;
  }
}
