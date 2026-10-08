import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { applicationLoader, root } from '../../../tests/fixtures/r3-source-loader.mjs';

const require = createRequire(`${root}/apps/web/package.json`);
const Redis = require('ioredis');
const { Queue } = require('bullmq');

for (const mode of ['close', 'silent']) {
  test(
    `actual HTTP producer has finite ${mode} TCP failure and no offline/reconnecting commands`,
    { timeout: 10_000 },
    async () => {
      const clients = [],
        queues = [],
        sockets = new Set();
      let connections = 0;
      const endpoint = createServer((socket) => {
        connections++;
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
        if (mode === 'close') socket.destroy();
      });
      await new Promise((resolve) => endpoint.listen(0, '127.0.0.1', resolve));
      class TrackedRedis extends Redis {
        constructor(...args) {
          super(...args);
          clients.push(this);
          this.on('error', () => {});
        }
      }
      class TrackedQueue extends Queue {
        constructor(...args) {
          super(...args);
          queues.push(this);
          this.on('error', () => {});
        }
      }
      const { load } = applicationLoader(
        { ioredis: TrackedRedis, bullmq: { Queue: TrackedQueue } },
        { REDIS_URL: `redis://127.0.0.1:${endpoint.address().port}/15` },
      );
      const source = load('apps/web/src/lib/queue.ts');
      try {
        const started = performance.now();
        const outcomes = await Promise.allSettled(
          Array.from({ length: 4 }, () =>
            source.enqueueSummaryGeneration({
              documentId: 'synthetic',
              workspaceId: 'synthetic',
              userId: 'synthetic',
            }),
          ),
        );
        assert.equal(outcomes.filter((outcome) => outcome.status === 'rejected').length, 4);
        assert.ok(performance.now() - started < source.HTTP_QUEUE_DEADLINE_MS + 1000);
        assert.equal(clients.length, 4);
        for (const client of clients) {
          assert.equal(client.options.enableOfflineQueue, false);
          assert.equal(client.options.maxRetriesPerRequest, 0);
          assert.equal(client.options.autoResendUnfulfilledCommands, false);
          assert.equal(client.offlineQueue.length, 0);
          assert.equal(client.commandQueue.length, 0);
        }
        const attempts = connections;
        await delay(100);
        assert.equal(connections, attempts);
        assert.ok(clients.every((client) => ['end', 'close'].includes(client.status)));
      } finally {
        clients.forEach((client) => client.disconnect(false));
        await Promise.all(queues.map((queue) => queue.close()));
        sockets.forEach((socket) => socket.destroy());
        await new Promise((resolve) => endpoint.close(resolve));
      }
    },
  );
}
