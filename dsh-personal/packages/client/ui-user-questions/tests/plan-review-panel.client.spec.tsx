// @vitest-environment jsdom
import { questionSeats } from './question-seats.client.ts';
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { h } from 'vue';
import { fireEvent, screen } from '@testing-library/dom';
import { renderVue as render, cleanupVue as cleanup, flushVue as act } from './vue-render.ts';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { ToolCallId } from '@deepseek-ai/dsh-llm/types';
import { createWaterfallRequest, PendingQuestion, planReviewOf, type QuestionComposerProps, type QuestionWait, } from '../src/client/contract/slots.ts';
import { createQuestionDraftStore } from '../src/client/draft-store.ts';
import { QuestionComposer } from '../src/client/QuestionComposer.tsx';
import { en, zh } from '../src/client/locales.ts';
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts';
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts';
afterEach(cleanup);
const SID = 's1' as SessionId;
const seatOver = (dict: Record<string, string>, common: Record<string, string>): QuestionComposerProps['t'] => (key => dict[key] ?? common[key] ?? key);
const questionDraftStore = createQuestionDraftStore().create(SID);
/** Framework standard-kit stubs: the panel consumes only the locale seat. */
const kit: Omit<QuestionComposerProps, 'matched'> = { ...questionSeats, useQuestionCard: () => { throw new Error('plan review does not read question card state'); }, renderSlot: () => null, sessionId: SID, session: undefined, pendingInteraction: undefined, useStore: bindSnapshotSelector(questionDraftStore), actions: questionDraftStore.actions, t: seatOver(zh, commonZh) };
const PLAN = '# Ship the picker\n\n- read the store\n- render the rows\n';
/** The plan-mode request shape: one question, the plan as detail, approve named. */
const questions = (): QuestionWait['questions'] => [{
        id: 'plan-review',
        header: 'Plan review',
        question: 'Approve this plan and leave plan mode?',
        detail: PLAN,
        options: [
            { label: 'Approve', description: 'Leave plan mode; the plan is carried out from the next step.' },
            { label: 'Keep planning', description: 'Stay in plan mode; feedback goes back to the model.' },
        ],
        intent: { kind: 'plan-review', approve: 'Approve' },
    }];
/** Pending waterfall fixture with observable Client response methods. */
function wait(items: QuestionWait['questions'] = questions()) {
    const carrier = new PendingQuestion(SID, items);
    const request = createWaterfallRequest(undefined, undefined, (channel) => { carrier.detachWaterfall(channel); });
    carrier.attachWaterfall(request.channel);
    const answer = vi.spyOn(carrier, 'answer');
    const cancel = vi.spyOn(carrier, 'dismiss');
    void request.result.catch(() => { });
    return { carrier, answer, cancel };
}
const decision = (label: string) => ({ answers: [{ id: 'plan-review', selected: [label] }] });
describe('planReviewOf', () => {
    it('narrows a plan-review request to its decision, options included', () => {
        expect(planReviewOf(questions())).toEqual({
            id: 'plan-review',
            question: 'Approve this plan and leave plan mode?',
            plan: PLAN,
            approve: { label: 'Approve', description: 'Leave plan mode; the plan is carried out from the next step.' },
            decline: { label: 'Keep planning', description: 'Stay in plan mode; feedback goes back to the model.' },
        });
    });
    it('retains the logged invocation so the review can reopen its exact plan', () => {
        const question = questions()[0]!;
        const callId = 'plan-call' as ToolCallId;
        const review = planReviewOf([{
                ...question,
                intent: { kind: 'plan-review', approve: 'Approve', callId },
            }]);
        expect(review).toEqual({ ...planReviewOf([question]), callId });
    });
    it('leaves the decline absent when the asker offered approve alone', () => {
        const [question] = questions();
        const review = planReviewOf([{ ...question as object, options: [{ label: 'Approve' }] } as never]);
        expect(review?.approve).toEqual({ label: 'Approve' });
        expect(review === undefined ? true : 'decline' in review).toBe(false);
    });
    it.each([
        ['a batch of more than one question', () => [...questions(), ...questions()]],
        ['no intent at all', () => [{ ...questions()[0] as object, intent: undefined }]],
        ['an intent without the plan as detail', () => [{ ...questions()[0] as object, detail: undefined }]],
        ['an intent whose approve names no option', () => [{
                    ...questions()[0] as object, intent: { kind: 'plan-review', approve: 'Ship it' },
                }]],
        ['an intent with no options at all', () => [{ ...questions()[0] as object, options: undefined }]],
        // Two buttons cannot send a third label or a combination, and the generic
        // flow can: an intent never costs the user a reachable answer.
        ['a third option the card could not offer', () => [{
                    ...questions()[0] as object,
                    options: [{ label: 'Approve' }, { label: 'Keep planning' }, { label: 'Start over' }],
                }]],
        ['a multi-select decision', () => [{ ...questions()[0] as object, multiSelect: true }]],
    ])('declines %s, leaving the request to the generic flow', (_case, build) => {
        expect(planReviewOf(build() as never)).toBeUndefined();
    });
    it('declines an empty batch, which the generic flow reports as such', () => {
        expect(planReviewOf([])).toBeUndefined();
    });
});
describe('PlanReviewPanel', () => {
    it('passes distinct pending request identities to the preview action for unlogged reviews', async () => {
        const rendered = vi.fn<(key: string, owner: unknown) => void>();
        const renderSlot: QuestionComposerProps['renderSlot'] = (key, owner) => { rendered(key, owner); return null; };
        const first = wait();
        const second = wait();
        const view = await act(async () => render(h(QuestionComposer, { "matched": first.carrier, ...kit, "renderSlot": renderSlot }, undefined)));
        expect(rendered).toHaveBeenLastCalledWith('conversation.plan-review.actions', {
            review: planReviewOf(first.carrier.questions), requestKey: first.carrier.key,
        });
        await act(async () => view.rerender(h(QuestionComposer, { "matched": second.carrier, ...kit, "renderSlot": renderSlot }, undefined)));
        expect(rendered).toHaveBeenLastCalledWith('conversation.plan-review.actions', {
            review: planReviewOf(second.carrier.questions), requestKey: second.carrier.key,
        });
        expect(first.carrier.key).not.toBe(second.carrier.key);
        expect(first.answer).not.toHaveBeenCalled();
        expect(second.answer).not.toHaveBeenCalled();
    });
    it('shows the plan title and summary above two review actions', async () => {
        const { carrier } = wait();
        await act(async () => render(h(QuestionComposer, { "matched": carrier, ...kit }, undefined)));
        expect(document.querySelector('[data-plan-review-key]')?.getAttribute('data-plan-review-key')).toBe(carrier.key);
        expect(screen.getByText(zh['plan.header'])).toBeTruthy();
        expect(document.querySelector('[data-plan-review-key] [data-state="warning"]')).not.toBeNull();
        expect(screen.getByRole('heading', { name: 'Ship the picker' })).toBeTruthy();
        expect(screen.getByText('read the store')).toBeTruthy();
        expect(screen.getAllByRole('button')).toHaveLength(2);
        expect(screen.queryByText('render the rows')).toBeNull();
        expect(document.querySelector('[data-plan-review-scroll]')).toBeNull();
        // The question text stays as the card's accessible name rather than a title
        // that reads like a test item.
        expect(screen.getByLabelText('Approve this plan and leave plan mode?')).toBeTruthy();
        // No pager, no numbered options, no skip, no custom answer.
        expect(screen.queryByText('1 / 1')).toBeNull();
        expect(screen.queryByRole('radio')).toBeNull();
        expect(screen.queryByText(zh['action.skip'])).toBeNull();
        expect(screen.queryByRole('textbox')).toBeNull();
    });
    it('extracts a plain summary and keeps a heading-only plan compact', async () => {
        const question = questions()[0]!;
        const detail = '# **Release** plan\n\nReview the [changes](https://example.com) before **shipping**.\n\n## Steps\n- Build';
        const { carrier } = wait([{ ...question, detail }]);
        const view = await act(async () => render(h(QuestionComposer, { "matched": carrier, ...kit }, undefined)));
        expect(screen.getByRole('heading', { name: 'Release plan' })).toBeTruthy();
        expect(screen.getByText('Review the changes before shipping.')).toBeTruthy();
        expect(screen.queryByRole('link')).toBeNull();
        const onlyTitle = wait([{ ...question, detail: '# Plan without a summary' }]);
        await act(async () => view.rerender(h(QuestionComposer, { "matched": onlyTitle.carrier, ...kit }, undefined)));
        expect(screen.getByRole('heading', { name: 'Plan without a summary' })).toBeTruthy();
        expect(document.querySelector('[data-plan-review-key] p')).toBeNull();
        const paragraph = wait([{ ...question, detail: 'A single paragraph plan.' }]);
        await act(async () => view.rerender(h(QuestionComposer, { "matched": paragraph.carrier, ...kit }, undefined)));
        expect(screen.getAllByText('A single paragraph plan.')).toHaveLength(1);
    });
    it('answers with the asker\'s approve label and keeps its description as the tooltip', async () => {
        const { carrier, answer } = wait();
        await act(async () => render(h(QuestionComposer, { "matched": carrier, ...kit }, undefined)));
        const approve = screen.getByRole('button', { name: zh['plan.approve'] });
        expect(approve.getAttribute('title')).toBe('Leave plan mode; the plan is carried out from the next step.');
        await act(async () => (approve as HTMLButtonElement).click());
        expect(answer).toHaveBeenCalledWith(decision('Approve'));
        expect(document.querySelector('[data-plan-review-key] [data-state="ongoing"]')).not.toBeNull();
        expect(document.querySelector('[data-plan-review-key] section')?.getAttribute('aria-busy')).toBe('true');
        // One-shot: every action locks until the host's resolved frame lands.
        expect(approve.hasAttribute('disabled')).toBe(true);
        expect(screen.getByRole('button', { name: zh['plan.discuss'] }).hasAttribute('disabled')).toBe(true);
        await act(async () => (approve as HTMLButtonElement).click());
        expect(answer).toHaveBeenCalledTimes(1);
    });
    it('hides a continued plan decision after steering its reply', async () => {
        const carrier = new PendingQuestion(SID, questions(), 'continued-plan' as ToolCallId);
        const answer = vi.fn(async () => true);
        const hide = vi.fn();
        carrier.attachRpc({ answer });
        carrier.attachSeat({ hide });
        carrier.setState('continued');
        await act(async () => render(h(QuestionComposer, { "matched": carrier, ...kit }, undefined)));
        await act(async () => fireEvent.click(screen.getByRole('button', { name: zh['plan.approve'] })));
        await vi.waitFor(() => { expect(hide).toHaveBeenCalledOnce(); });
        expect(screen.getByRole('button', { name: zh['plan.approve'] }).hasAttribute('disabled')).toBe(false);
        expect(answer).toHaveBeenCalledOnce();
    });
    it('reports a sent plan reply when hiding its panel fails', async () => {
        const carrier = new PendingQuestion(SID, questions(), 'continued-plan-hide-error' as ToolCallId);
        const answer = vi.fn(async () => true);
        carrier.attachRpc({ answer });
        carrier.attachSeat({ hide: () => { throw new Error('hide failed'); } });
        carrier.setState('continued');
        await act(async () => render(h(QuestionComposer, { "matched": carrier, ...kit }, undefined)));
        await act(async () => fireEvent.click(screen.getByRole('button', { name: zh['plan.approve'] })));
        expect(await screen.findByText(zh['status.sent'])).toBeTruthy();
        expect(answer).toHaveBeenCalledOnce();
    });
    it('dismisses the request so the composer returns for a plain message', async () => {
        const { carrier, cancel, answer } = wait();
        await act(async () => render(h(QuestionComposer, { "matched": carrier, ...kit }, undefined)));
        await act(async () => fireEvent.click(screen.getByRole('button', { name: zh['plan.discuss'] })));
        expect(cancel).toHaveBeenCalledWith();
        expect(answer).not.toHaveBeenCalled();
    });
    it('omits the tooltip for an option carrying no description', async () => {
        const { carrier } = wait([{
                ...questions()[0] as object,
                options: [{ label: 'Approve' }, { label: 'Keep planning' }],
            }] as never);
        await act(async () => render(h(QuestionComposer, { "matched": carrier, ...kit }, undefined)));
        expect(screen.getByRole('button', { name: zh['plan.approve'] }).hasAttribute('title')).toBe(false);
    });
    it('hides the decline action when the asker offered approve alone', async () => {
        const { carrier } = wait([{
                ...questions()[0] as object, options: [{ label: 'Approve' }],
            }] as never);
        await act(async () => render(h(QuestionComposer, { "matched": carrier, ...kit }, undefined)));
        expect(screen.queryByRole('button', { name: zh['plan.decline'] })).toBeNull();
        expect(screen.getByRole('button', { name: zh['plan.approve'] })).toBeTruthy();
    });
    it('re-arms the actions and says why when the decision does not land', async () => {
        const { carrier, answer } = wait();
        answer.mockRejectedValue(new Error('question response rejected: not-pending'));
        await act(async () => render(h(QuestionComposer, { "matched": carrier, ...kit }, undefined)));
        await act(async () => fireEvent.click(screen.getByRole('button', { name: zh['plan.approve'] })));
        const failure = await screen.findByText('question response rejected: not-pending');
        expect(failure.getAttribute('role')).toBe('status');
        // Re-armed for the retry: a lost click must not leave a dead card.
        expect(screen.getByRole('button', { name: zh['plan.approve'] }).hasAttribute('disabled')).toBe(false);
        await act(async () => fireEvent.click(screen.getByRole('button', { name: zh['plan.approve'] })));
        expect(answer).toHaveBeenCalledTimes(2);
    });
    it('reports a non-Error transport failure as its stringified value', async () => {
        // A non-Error rejection is the case under test: a carrier can reject with
        // anything, and the panel must still show the user something.
        const { carrier, cancel } = wait();
        cancel.mockRejectedValue('socket gone');
        await act(async () => render(h(QuestionComposer, { "matched": carrier, ...kit }, undefined)));
        await act(async () => fireEvent.click(screen.getByRole('button', { name: zh['plan.discuss'] })));
        expect(await screen.findByText('socket gone')).toBeTruthy();
    });
    it('carries the same decision surface in English', async () => {
        const { carrier } = wait();
        await act(async () => render(h(QuestionComposer, { "matched": carrier, ...kit, "t": seatOver(en, commonEn) }, undefined)));
        expect(screen.getByText('Plan review')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Approve' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Refuse' })).toBeNull();
        expect(screen.getByRole('button', { name: 'Request changes' })).toBeTruthy();
    });
});
