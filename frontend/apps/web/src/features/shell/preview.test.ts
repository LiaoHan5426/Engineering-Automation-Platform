import { describe, expect, it } from 'vite-plus/test';
import { createPreview } from './preview';

describe('isolated frontend preview', () => {
  it('retains drafts and references across projects and work modes', () => {
    const demo = createPreview();
    const code = demo.create('code'); code.draft = 'keep my draft'; code.context.files.push({ name: 'a.vue', content: 'sample' });
    const office = demo.project('office-demo', 'work')!; office.draft = 'report';
    expect(demo.project('eap-demo', 'code')?.id).toBe(code.id);
    expect(demo.current('code').draft).toBe('keep my draft');
    expect(demo.current('code').context.files).toHaveLength(1);
    expect(demo.project('office-demo', 'work')?.draft).toBe('report');
  });
  it('deduplicates linked tasks and refuses to skip review', () => {
    const demo = createPreview(), session = demo.create('code');
    const task = demo.task(session);
    expect(demo.task(session).id).toBe(task.id); expect(demo.state.tasks).toHaveLength(1);
    expect(demo.move(task.id, 'done')).toBe(false);
    expect(demo.move(task.id, 'ready')).toBe(true);
    expect(demo.move(task.id, 'running')).toBe(false);
    expect(demo.move(task.id, 'acceptance')).toBe(false);
    expect(demo.move(task.id, 'done')).toBe(false);
    expect(task.column).toBe('ready');
    expect(task.events).toEqual(['created', 'ready']);
  });
});
