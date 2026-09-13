// Store barrel. Import from '@/store' (or '../store') everywhere.
import { db } from './db';
import { buildSeed } from './seed';

db.registerSeed(buildSeed);
db.init();

export { db, useCollection, useRecord, useDb, ConflictError, ValidationError } from './db';
export type { Row, DB } from './db';
export { C } from './collections';
export type { CollectionName } from './collections';
export { session, useSession, currentScope } from './session';
export type { Scope, AuthState, SessionState } from './session';
export { nav, useRoute, docLink } from './nav';
export type { Route } from './nav';
export * from './types';
export * as engine from './engine';
export { IDS } from './seed/core';
