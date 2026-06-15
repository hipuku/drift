/**
 * Job subscription registry.
 *
 * Tracks which clients want events for which job. Kept deliberately free of
 * WebSocket and Redis concerns so the routing logic — the part with the bugs —
 * is pure and unit-testable. Generic over the client type for that reason.
 *
 * Maintains both directions (job → clients, client → jobs) so that a
 * disconnect can be cleaned up in one step without scanning every job.
 */
export class SubscriptionRegistry<TClient> {
  private readonly byJob = new Map<string, Set<TClient>>();
  private readonly byClient = new Map<TClient, Set<string>>();

  subscribe(jobId: string, client: TClient): void {
    let clients = this.byJob.get(jobId);
    if (!clients) {
      clients = new Set();
      this.byJob.set(jobId, clients);
    }
    clients.add(client);

    let jobs = this.byClient.get(client);
    if (!jobs) {
      jobs = new Set();
      this.byClient.set(client, jobs);
    }
    jobs.add(jobId);
  }

  unsubscribe(jobId: string, client: TClient): void {
    const clients = this.byJob.get(jobId);
    if (clients) {
      clients.delete(client);
      if (clients.size === 0) this.byJob.delete(jobId);
    }
    const jobs = this.byClient.get(client);
    if (jobs) {
      jobs.delete(jobId);
      if (jobs.size === 0) this.byClient.delete(client);
    }
  }

  /** Drop a client from every job it subscribed to (call on disconnect). */
  removeClient(client: TClient): void {
    const jobs = this.byClient.get(client);
    if (!jobs) return;
    for (const jobId of jobs) {
      const clients = this.byJob.get(jobId);
      if (clients) {
        clients.delete(client);
        if (clients.size === 0) this.byJob.delete(jobId);
      }
    }
    this.byClient.delete(client);
  }

  subscribers(jobId: string): TClient[] {
    return [...(this.byJob.get(jobId) ?? [])];
  }

  /** Number of jobs with at least one subscriber. */
  get jobCount(): number {
    return this.byJob.size;
  }
}
