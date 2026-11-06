import { describe, expect, it } from 'vitest';
import { goalBarFill, goalIsOverdue } from './GoalBar';

describe('goalBarFill after extend', () => {
  it('uses the goal palette once the due date is no longer in the past', () => {
    const extended = {
      color: '#6B8E9F',
      status: 'active',
      tags: ['Overdue'],
      due_date: '2099-12-31',
    };
    expect(goalIsOverdue(extended)).toBe(false);
    expect(goalBarFill(extended)).toBe('#6B8E9F');
  });

  it('stays red while the due date is still past', () => {
    const overdue = {
      color: '#6B8E9F',
      status: 'active',
      tags: ['Overdue'],
      due_date: '2020-01-01',
    };
    expect(goalBarFill(overdue)).toBe('#E24B4A');
  });
});
