import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from 'pg';
import type { ConnectionOptions } from 'node:tls';
import { postgresConfig } from '../server/postgres';

test('Supabase URLs retain certificate and hostname verification even with URL SSL overrides', () => {
  for (const host of ['db.example.supabase.co', 'aws-1-us-east-1.pooler.supabase.com']) {
    const client = new Client(postgresConfig(`postgres://demo:demo@${host}:6543/postgres?sslmode=no-verify&sslrootcert=missing&uselibpqcompat=true`));
    const parameters = (client as unknown as {connectionParameters: {ssl: ConnectionOptions; host: string}}).connectionParameters;
    const ssl = parameters.ssl;
    assert.ok(ssl && typeof ssl === 'object');
    assert.equal(ssl.rejectUnauthorized, true);
    assert.ok(Array.isArray(ssl.ca) && ssl.ca.length > 1);
    assert.equal(ssl.checkServerIdentity, undefined); // Node's default hostname check.
    assert.equal(parameters.host, host);
  }
});

test('Local and unrelated PostgreSQL URLs preserve their explicit settings', () => {
  for (const host of ['localhost', 'supabase.co.attacker.example']) {
    const url = `postgres://demo:demo@${host}/postgres?sslmode=disable`;
    assert.deepEqual(postgresConfig(url), {connectionString:url});
  }
});
