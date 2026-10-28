import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseRepository } from '../src/supabase-services.js';

type Item = Record<string, unknown>;

function fakeClient(options: { storageError?: boolean } = {}) {
  const assignments = [
    { id: 'assignment-1', course_id: 'course-1' },
    { id: 'assignment-2', course_id: 'course-1' },
    { id: 'assignment-3', course_id: 'course-2' }
  ];
  const submissions = [
    { assignment_id: 'assignment-1', file_path: 'submission-1/essay.pdf' },
    { assignment_id: 'assignment-1', file_path: null },
    { assignment_id: 'assignment-2', file_path: 'submission-2/report.docx' },
    { assignment_id: 'assignment-3', file_path: 'submission-3/other.pdf' }
  ];
  const events: string[] = [];
  const removed: string[][] = [];

  class Query implements PromiseLike<{ data: Item[] | null; error: null }> {
    private action = 'select';
    private filters: Array<(item: Item) => boolean> = [];
    constructor(private readonly table: string) {}
    select() { this.action = 'select'; return this; }
    delete() { this.action = 'delete'; return this; }
    eq(column: string, value: unknown) { this.filters.push((item) => item[column] === value); return this; }
    in(column: string, values: unknown[]) { this.filters.push((item) => values.includes(item[column])); return this; }
    then<TResult1 = { data: Item[] | null; error: null }, TResult2 = never>(
      onfulfilled?: ((value: { data: Item[] | null; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ): PromiseLike<TResult1 | TResult2> {
      const rows = (this.table === 'assignments' ? assignments : this.table === 'submissions' ? submissions : [])
        .filter((item) => this.filters.every((filter) => filter(item)));
      if (this.action === 'delete') events.push('delete:' + this.table);
      return Promise.resolve({ data: this.action === 'select' ? rows : null, error: null }).then(onfulfilled, onrejected);
    }
  }

  const client = {
    from(table: string) { return new Query(table); },
    storage: {
      from() {
        return {
          async remove(paths: string[]) {
            events.push('remove:storage');
            removed.push(paths);
            return { data: options.storageError ? null : [], error: options.storageError ? { message: 'refused' } : null };
          }
        };
      }
    }
  } as unknown as SupabaseClient;

  return { client, events, removed };
}

test('deleting a course removes only files from that course before its rows', async () => {
  const fake = fakeClient();
  await new SupabaseRepository(fake.client).deleteCourse('course-1');
  assert.deepEqual(fake.removed, [['submission-1/essay.pdf', 'submission-2/report.docx']]);
  assert.deepEqual(fake.events, ['remove:storage', 'delete:courses']);
});

test('deleting an assignment removes only that assignment files', async () => {
  const fake = fakeClient();
  await new SupabaseRepository(fake.client).deleteAssignment('assignment-1');
  assert.deepEqual(fake.removed, [['submission-1/essay.pdf']]);
  assert.deepEqual(fake.events, ['remove:storage', 'delete:assignments']);
});

test('a storage refusal prevents the database deletion', async () => {
  const fake = fakeClient({ storageError: true });
  await assert.rejects(
    new SupabaseRepository(fake.client).deleteAssignment('assignment-1'),
    (error: unknown) => !!error && typeof error === 'object' && 'code' in error && error.code === 'FILE_DELETE_FAILED'
  );
  assert.deepEqual(fake.events, ['remove:storage']);
});

