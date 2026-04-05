import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RoomLayout } from '../../src/renderer/src/features/room/RoomLayout'

describe('RoomLayout', () => {
  it('renders the room timeline, composer, and control panel', () => {
    render(
      <RoomLayout
        roomTitle="Design Review"
        agents={[{ id: 'builder', status: 'idle' }]}
        messages={[{ id: 'm1', senderId: 'user', body: 'hello', kind: 'user_message' }]}
        mode="open"
      />
    )

    expect(screen.getByText('Design Review')).toBeInTheDocument()
    expect(screen.getByText('hello')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /message/i })).toBeInTheDocument()
    expect(screen.getByText('Round Mode')).toBeInTheDocument()
  })
})
