// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RecordForm } from './RecordForm'
import type { CaptureDraft } from '../types'

const draft: CaptureDraft = { projectId: 'p', mode: 'point', coordinates: [{ latitude: 1, longitude: 2, source: 'manual', timestamp: 0 }], startedAt: '2026-09-07', paused: true }
const props = { draft, projectId: 'p', currentPosition: null, operative: 'Tester', suggestedLabel: 'P-001', onCancel: vi.fn() }
afterEach(cleanup)
describe('observation saving', () => {
  it('retains the form and reports storage failures', async () => {
    render(<RecordForm {...props} onSave={async () => { throw new Error('Device storage is full') }}/>)
    fireEvent.click(screen.getByRole('button', { name: 'Save record' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Device storage is full'))
    expect((screen.getByRole('textbox', { name: 'Label Required' }) as HTMLInputElement).value).toBe('P-001')
  })
  it('saves structured assessment fields and explicit units', async () => {
    const onSave = vi.fn()
    render(<RecordForm {...props} onSave={onSave}/>)
    fireEvent.click(screen.getByText('Condition, priority & extra fields'))
    fireEvent.change(screen.getByLabelText('Condition'), { target: { value: 'Poor' } })
    fireEvent.change(screen.getByLabelText('Priority'), { target: { value: 'Urgent' } })
    fireEvent.click(screen.getByRole('button', { name: '+ Add field' }))
    fireEvent.change(screen.getByLabelText('Field 1 name'), { target: { value: 'Diameter (mm)' } })
    fireEvent.change(screen.getByLabelText('Field 1 value'), { target: { value: '150' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save record' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
    expect(onSave.mock.calls[0][0].attributes).toEqual({ Condition: 'Poor', Priority: 'Urgent', 'Diameter (mm)': '150' })
  })
  it('blocks duplicate custom names instead of silently dropping data', () => {
    const onSave = vi.fn()
    render(<RecordForm {...props} onSave={onSave}/>)
    fireEvent.click(screen.getByText('Condition, priority & extra fields'))
    fireEvent.click(screen.getByRole('button', { name: '+ Add field' }))
    fireEvent.change(screen.getByLabelText('Field 1 name'), { target: { value: 'Condition' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save record' }))
    expect(screen.getByRole('alert').textContent).toContain('unique name')
    expect(onSave).not.toHaveBeenCalled()
  })
})
